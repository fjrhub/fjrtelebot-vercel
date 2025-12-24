# Personal Finance Telegram Bot

A simple Telegram bot to **record and monitor personal finances** using **Google Sheets as the primary database**.

This project is intended for **personal use**, with a focus on data clarity, transparency, and ease of maintenance.

---

## ✨ Key Features

### ✅ Transaction Logging

* Income
* Expense
* Account-to-account transfer
* Categories & sub-categories
* Multiple accounts (Wallet, Bank, E-Wallet, Binance, etc.)
* Multiple currencies (**Rp & USDT**)

### 📊 Balance Check (`/balance`)

* Displays balance **per account**
* Supports **Rp & USDT**
* Total balance **separated by currency**
* Safe for empty data (`#N/A` is automatically treated as 0)
* Timestamp uses **WIB (Asia/Jakarta)**

---

## 🧱 Data Structure (Google Sheets)

### Transactions Sheet (`Sheet1`)

| Column | Description              |
|------|--------------------------|
| F    | Currency (`Rp` / `USDT`) |
| G    | Account                  |
| J    | Balance after transaction |

### Account Summary Sheet

| Column | Content          |
|------|------------------|
| S    | Account Name     |
| T    | Latest Balance   |
| U    | Account Currency |

> Balance and currency are derived from the **latest transaction** of each account.

---

## 🔁 Google Sheets Formulas

### Latest Account Balance

```excel
=IFERROR(
  INDEX(
    Sheet1!J:J;
    MAX(
      FILTER(
        ROW(Sheet1!G:G);
        Sheet1!G:G=S2
      )
    )
  );
  0
)
```

### Account Currency

```excel
=IFERROR(
  INDEX(
    Sheet1!F:F;
    MAX(
      FILTER(
        ROW(Sheet1!G:G);
        Sheet1!G:G=S2
      )
    )
  );
  "Rp"
)
```

---

## 🔐 Environment Variables

```env
GOOGLE_PROJECT_ID=
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
SPREADSHEET_ID=
```

---

## 📌 Design Notes

* Each account uses **only one currency**
* USDT is **not automatically converted** to Rp
* Google Sheets acts as the **single source of truth**
* The bot only **reads and displays** data

---

## 🚀 Future Improvements

* `/last` → last transaction
* `/history` → short transaction history
* `/summary` → monthly summary
* Highlight negative balances
