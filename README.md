# Personal Finance Telegram Bot

A simple Telegram bot to **record and monitor personal finances** using **Google Sheets as the primary database**, with **MongoDB** for auxiliary data and **Groq AI** for smart insights.

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

### 🤖 AI Insights (Powered by Groq)

* Smart categorization suggestions
* Spending analysis summaries
* Natural language queries about your finances

---

## 🧱 Data Structure (Google Sheets)

### Transactions Sheet (`Sheet1`)

| Column | Description              |
|--------|--------------------------|
| F      | Currency (`Rp` / `USDT`) |
| G      | Account                  |
| J      | Balance after transaction |

### Account Summary Sheet

| Column | Content          |
|--------|------------------|
| S      | Account Name     || T      | Latest Balance   |
| U      | Account Currency |

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

Copy the `.env.local.example` file to `.env` (or `.env.local`) and fill in the values:

```bashcp .env.local.example .env
```

### Configuration Details

| Variable | Description | How to get it |
| :--- | :--- | :--- |
| `BOT_TOKEN` | Your Telegram Bot Token | Create a bot via [@BotFather](https://t.me/BotFather) on Telegram. |
| `OWNER_ID` | Your Telegram User ID | Send a message to your bot, then check the update JSON for `from.id`, or ask [@userinfobot](https://t.me/userinfobot). |
| `TELEGRAM_MODE` | Running mode (`polling` or `webhook`) | Use `polling` for local dev, `webhook` for production servers. |
| `WEBHOOK_SECRET` | Secret key for webhook validation | Generate randomly: `openssl rand -hex 16` |
| `SPREADSHEET_ID` | Google Sheet ID | Extract from URL: `docs.google.com/spreadsheets/d/<THIS_ID>/edit` |
| `GOOGLE_API_KEY` | Google Cloud API Key | Create in [Google Cloud Console](https://console.cloud.google.com/apis/credentials). |
| `MONGODB_URI` | MongoDB Connection String | Get from [MongoDB Atlas](https://cloud.mongodb.com/) Cluster > Connect > Drivers. |
| `GROQ_API_KEY` | Groq Cloud API Key | Get from [Groq Cloud Console](https://console.groq.com/keys). |
| `GOOGLE_CLIENT_EMAIL` | Service Account Email | Found in your downloaded Service Account JSON file (`client_email`). |
| `GOOGLE_PRIVATE_KEY` | Service Account Private Key | Found in JSON file (`private_key`). **Keep `\n` characters intact.** |

#### Example `.env` structure:

```env
# Telegram Bot Configuration
BOT_TOKEN=your_bot_token_here
OWNER_ID=123456789
TELEGRAM_MODE=polling
WEBHOOK_SECRET=your_generated_secret_hex

# Google Sheets & Cloud Configuration
SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"

# Database & AI Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
GROQ_API_KEY=gsk_your_groq_api_key_here
```

---

## 📌 Design Notes

* Each account uses **only one currency**.
* USDT is **not automatically converted** to Rp (balances are tracked separately).
* **Google Sheets** acts as the single source of truth for transaction records.
* **MongoDB** is used for storing user preferences, session data, or cached AI contexts.
* **Groq AI** is utilized for processing natural language commands and generating financial summaries.
* The bot restricts admin commands (like reset or config) to the `OWNER_ID`.

---
