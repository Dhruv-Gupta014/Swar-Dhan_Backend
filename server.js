const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const xlsx = require("xlsx");
const fs = require("fs");

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(cors());

const USERS_FILE = "users.xlsx"; // User data
const TRANSACTIONS_FILE = "transactions.xlsx"; // Transaction history
const pendingTransfers = {}; // Store pending transfers temporarily

// Function to read Excel file
const readExcel = (filePath) => {
    if (!fs.existsSync(filePath)) return [];
    try {
        const workbook = xlsx.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        return xlsx.utils.sheet_to_json(sheet) || [];
    } catch (error) {
        console.error("❌ Error reading Excel file:", error);
        return [];
    }
};

// Function to write to Excel file
const writeExcel = (filePath, data, sheetName) => {
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
    xlsx.writeFile(workbook, filePath);
};

// 🟢 Signup API
app.post("/signup", (req, res) => {
    const { name, email, phone, password, voicePassword, voiceText, savingsBalance, walletBalance } = req.body;

    if (!name || !email || !phone || !password || !voicePassword || !voiceText) {
        return res.status(400).json({ message: "⚠️ All fields are required!" });
    }

    let users = readExcel(USERS_FILE);
    if (users.some(user => user.Phone === phone)) {
        return res.status(400).json({ message: "⚠️ Phone number already registered!" });
    }

    const newUser = {
        ID: users.length + 1,
        Name: name,
        Email: email,
        Phone: phone,
        Password: password,
        VoicePassword: voicePassword,
        "Voice Text": voiceText,
        SavingsBalance: savingsBalance || 0,
        WalletBalance: walletBalance || 0
    };

    users.push(newUser);
    writeExcel(USERS_FILE, users, "Users");

    res.status(201).json({ message: "✅ Signup successful!", user: newUser });
});

// 🟢 Login API
app.post("/login", (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) {
        return res.status(400).json({ message: "⚠️ Phone number and password are required!" });
    }

    let users = readExcel(USERS_FILE);
    const user = users.find(u => u.Phone === phone && u.Password === password);

    if (!user) {
        return res.status(401).json({ message: "❌ Invalid phone number or password!" });
    }

    res.status(200).json({ message: "✅ Login successful!", user });
});

// 🟢 Voice-Based Payment API
app.post("/transfer", (req, res) => {
    const { phone, voicePassword, amount, fromAccount, toAccount, confirm } = req.body;

    if (!phone) {
        return res.status(400).json({ message: "⚠️ Phone number is required!" });
    }

    let users = readExcel(USERS_FILE);
    let userIndex = users.findIndex(u => u.Phone === phone);
    if (userIndex === -1) {
        return res.status(404).json({ message: "❌ User not found!" });
    }

    let user = users[userIndex];

    // **STEP 1: Initiate Transfer Request (Ask for Confirmation)**
    if (!confirm) {
        if (!voicePassword || !amount || !fromAccount || !toAccount) {
            return res.status(400).json({ message: "⚠️ All fields are required for initiating a transfer!" });
        }

        if (user.VoicePassword !== voicePassword) {
            return res.status(401).json({ message: "❌ Incorrect voice password!" });
        }

        const amountInt = parseInt(amount);
        if (isNaN(amountInt) || amountInt <= 0) {
            return res.status(400).json({ message: "⚠️ Invalid transfer amount!" });
        }

        pendingTransfers[phone] = { amount: amountInt, fromAccount, toAccount };

        console.log(`🟢 Transfer Initiated for ${phone}:`, pendingTransfers[phone]);

        return res.status(200).json({
            message: `🟢 Do you confirm transferring ₹${amountInt} from ${fromAccount} to ${toAccount}? Reply with 'yes' or 'no'.`
        });
    }

    // **STEP 2: Confirm or Cancel Transfer**
    if (confirm.toLowerCase() === "yes") {
        if (!pendingTransfers[phone]) {
            return res.status(400).json({ message: "❌ No pending transfer found!" });
        }

        let { amount, fromAccount, toAccount } = pendingTransfers[phone];

        if (fromAccount === "savings" && user.SavingsBalance >= amount) {
            user.SavingsBalance -= amount;
            user.WalletBalance += amount;
        } else if (fromAccount === "wallet" && user.WalletBalance >= amount) {
            user.WalletBalance -= amount;
            user.SavingsBalance += amount;
        } else {
            return res.status(400).json({ message: "❌ Insufficient funds!" });
        }

        users[userIndex] = user;
        writeExcel(USERS_FILE, users, "Users");

        // 🟢 **Log Transaction in `transactions.xlsx`**
        let transactions = readExcel(TRANSACTIONS_FILE);
        const newTransaction = {
            TransactionID: transactions.length + 1,
            Phone: phone,
            Amount: amount,
            FromAccount: fromAccount,
            ToAccount: toAccount,
            Timestamp: new Date().toLocaleString()
        };
        transactions.push(newTransaction);
        writeExcel(TRANSACTIONS_FILE, transactions, "Transactions");

        delete pendingTransfers[phone];

        console.log(`✅ Transfer Completed for ${phone}: ₹${amount} from ${fromAccount} to ${toAccount}`);

        return res.status(200).json({ message: `✅ ₹${amount} transferred from ${fromAccount} to ${toAccount}!`, user });
    } else {
        delete pendingTransfers[phone];
        return res.status(200).json({ message: "❌ Transfer cancelled!" });
    }
});

// 🟢 Get Transaction History API
app.get("/transactions/:phone", (req, res) => {
    const { phone } = req.params;
    if (!phone) {
        return res.status(400).json({ message: "⚠️ Phone number is required!" });
    }

    let transactions = readExcel(TRANSACTIONS_FILE);
    let userTransactions = transactions.filter(txn => txn.Phone === phone);

    res.status(200).json({ transactions: userTransactions });
});

// Debugging: Log Registered Routes
console.log("✅ Registered Routes:");
app._router.stack.forEach((r) => {
    if (r.route && r.route.path) {
        console.log(`🔹 ${Object.keys(r.route.methods)[0].toUpperCase()} - ${r.route.path}`);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Swar-Dhan Server is running on http://localhost:${PORT}`);
});
