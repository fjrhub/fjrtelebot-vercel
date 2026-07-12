# fjrtelebot-vercel

> Personal Finance Tracker via Telegram — Google Sheets + MongoDB + Groq AI, deployed on Vercel Serverless.

[![Status](https://img.shields.io/badge/status-active-success?style=flat-square)](https://github.com/fjrhub/fjrtelebot-vercel)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Vercel](https://img.shields.io/badge/deployed%20on-Vercel-000?style=flat-square&logo=vercel)](https://vercel.com)
[![Telegram](https://img.shields.io/badge/bot-Telegram-2CA5E0?style=flat-square&logo=telegram)](https://telegram.org)
[![Node.js](https://img.shields.io/badge/runtime-Node.js-339933?style=flat-square&logo=nodedotjs)](https://nodejs.org)

---

## Overview

A Telegram bot for personal finance tracking. Transactions are recorded via chat, stored in Google Sheets as the primary source, and MongoDB for sessions & AI cache. All commands are locked to `OWNER_ID`.

---

## Features

| Feature | Description |
|---------|-------------|
| 📝 Transaction Log | Income · Expense · Transfer · Categories · Multi-currency (Rp / USDT) |
| 📊 `/balance` | Real-time balance per account · Separated currencies · WIB Timestamp |
| 🤖 AI Insights | Smart categorization & spending summary via Groq |
| 🔐 Owner-Only | All commands restricted to `OWNER_ID` |
| 🔄 Dual Storage | Google Sheets (source of truth) + MongoDB (sessions/cache) |

---

## Tech Stack

| Layer | Tools |
|-------|-------|
| Runtime | Node.js + Next.js (Vercel Serverless) |
| Bot Framework | [Grammy.js](https://grammy.dev) |
| Primary Storage | Google Sheets API |
| Auxiliary DB | MongoDB Atlas |
| AI | [Groq Cloud](https://console.groq.com) |
| Deploy | Vercel (Webhook / Polling) |

---

## Quick Start

```bash
# Clone & install
git clone https://github.com/fjrhub/fjrtelebot-vercel.git
cd fjrtelebot-vercel
npm install

# Setup environment
cp .env.local.example .env.local
# Edit .env.local with your credentials

# Run local (polling mode)
npm run dev

# Deploy to Vercel
vercel --prod
```

---

## Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `BOT_TOKEN` | Bot authentication token | [@BotFather](https://t.me/BotFather) |
| `OWNER_ID` | Admin Telegram ID | [@userinfobot](https://t.me/userinfobot) |
| `TELEGRAM_MODE` | `polling` or `webhook` | `polling` for local |
| `WEBHOOK_SECRET` | Webhook validation | `openssl rand -hex 16` |
| `SPREADSHEET_ID` | Google Sheets ID | URL: `.../spreadsheets/d/<ID>/edit` |
| `GOOGLE_API_KEY` | Sheets API access | Google Cloud Console |
| `GOOGLE_CLIENT_EMAIL` | Service account email | Service Account JSON |
| `GOOGLE_PRIVATE_KEY` | Service account private key | Service Account JSON *(keep `\n`)* |
| `MONGODB_URI` | MongoDB connection | MongoDB Atlas |
| `GROQ_API_KEY` | AI inference | [Groq Cloud](https://console.groq.com) |

<details>
<summary>Example <code>.env.local</code></summary>

```env
# Telegram
BOT_TOKEN=your_bot_token_here
OWNER_ID=123456789
TELEGRAM_MODE=polling
WEBHOOK_SECRET=your_generated_secret_hex

# Google Sheets
SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_CLIENT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

# Database & AI
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/db?retryWrites=true
GROQ_API_KEY=gsk_your_groq_key_here
```
</details>

---

## Google Sheets Structure

### Sheet1 — Transactions

| Column | Content |
|--------|---------|
| `F` | Currency (`Rp` / `USDT`) |
| `G` | Account name |
| `J` | Balance after transaction |

### Account Summary (Sheet1)

| Column | Content |
|--------|---------|
| `S` | Account name |
| `T` | Latest balance |
| `U` | Account currency |

> Balance and currency are fetched from the **latest transaction** per account.

<details>
<summary>Helper Formulas</summary>

**Latest balance per account:**
```excel
=IFERROR(INDEX(Sheet1!J:J,MAX(FILTER(ROW(Sheet1!G:G),Sheet1!G:G=S2))),0)
```

**Currency per account:**
```excel
=IFERROR(INDEX(Sheet1!F:F,MAX(FILTER(ROW(Sheet1!G:G),Sheet1!G:G=S2))),"Rp")
```
</details>

---

## Design Principles

- Each account must use **only one currency**
- USDT balances are tracked **separately**, no auto-conversion to Rp
- Google Sheets = **single source of truth**
- MongoDB = sessions, preferences, AI cache
- Groq AI = natural language commands & spending summary
- All admin commands are restricted via `OWNER_ID`

---

## Links

- [Live Demo](https://fjrtelebot.vercel.app)
- [Grammy.js Docs](https://grammy.dev)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Groq Cloud](https://console.groq.com)

---

> Built by [@fjrhub](https://github.com/fjrhub) · MIT License
