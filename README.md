# fjrtelebot-vercel

> Personal Finance Tracker via Telegram — Google Sheets + MongoDB + Groq AI, deployed on Vercel Serverless.

[![Status](https://img.shields.io/badge/status-active-success?style=flat-square)](https://github.com/fjrhub/fjrtelebot-vercel)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Vercel](https://img.shields.io/badge/deployed%20on-Vercel-000?style=flat-square&logo=vercel)](https://vercel.com)
[![Telegram](https://img.shields.io/badge/bot-Telegram-2CA5E0?style=flat-square&logo=telegram)](https://telegram.org)
[![Node.js](https://img.shields.io/badge/runtime-Node.js-339933?style=flat-square&logo=nodedotjs)](https://nodejs.org)

---

## Overview

Bot Telegram untuk pencatatan keuangan personal. Transaksi dicatat via chat, disimpan ke Google Sheets sebagai sumber utama, dan MongoDB untuk sesi & cache AI. Semua command di-lock ke `OWNER_ID`.

---

## Features

| Feature | Keterangan |
|---------|------------|
| 📝 Transaction Log | Income · Expense · Transfer · Kategori · Multi-currency (Rp / USDT) |
| 📊 `/balance` | Saldo real-time per akun · Currency terpisah · Timestamp WIB |
| 🤖 AI Insights | Smart categorization & spending summary via Groq |
| 🔐 Owner-Only | Semua command dibatasi ke `OWNER_ID` |
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
# Edit .env.local dengan credentials kamu

# Run local (polling mode)
npm run dev

# Deploy ke Vercel
vercel --prod
```

---

## Environment Variables

| Variable | Keterangan | Sumber |
|----------|-----------|--------|
| `BOT_TOKEN` | Token autentikasi bot | [@BotFather](https://t.me/BotFather) |
| `OWNER_ID` | Telegram ID admin | [@userinfobot](https://t.me/userinfobot) |
| `TELEGRAM_MODE` | `polling` atau `webhook` | `polling` untuk lokal |
| `WEBHOOK_SECRET` | Validasi webhook | `openssl rand -hex 16` |
| `SPREADSHEET_ID` | ID Google Sheets | URL: `.../spreadsheets/d/<ID>/edit` |
| `GOOGLE_API_KEY` | Akses Sheets API | Google Cloud Console |
| `GOOGLE_CLIENT_EMAIL` | Email service account | Service Account JSON |
| `GOOGLE_PRIVATE_KEY` | Private key service account | Service Account JSON *(jaga `\n`)* |
| `MONGODB_URI` | Koneksi MongoDB | MongoDB Atlas |
| `GROQ_API_KEY` | Inferensi AI | [Groq Cloud](https://console.groq.com) |

<details>
<summary>Contoh <code>.env.local</code></summary>

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

| Kolom | Isi |
|-------|-----|
| `F` | Currency (`Rp` / `USDT`) |
| `G` | Nama akun |
| `J` | Saldo setelah transaksi |

### Account Summary (Sheet1)

| Kolom | Isi |
|-------|-----|
| `S` | Nama akun |
| `T` | Saldo terbaru |
| `U` | Currency akun |

> Saldo dan currency diambil dari **transaksi terakhir** per akun.

<details>
<summary>Helper Formulas</summary>

**Saldo terbaru per akun:**
```excel
=IFERROR(INDEX(Sheet1!J:J;MAX(FILTER(ROW(Sheet1!G:G);Sheet1!G:G=S2)));0)
```

**Currency per akun:**
```excel
=IFERROR(INDEX(Sheet1!F:F;MAX(FILTER(ROW(Sheet1!G:G);Sheet1!G:G=S2)));"Rp")
```
</details>

---

## Design Principles

- Setiap akun hanya boleh menggunakan **satu currency**
- Saldo USDT dilacak **terpisah**, tidak ada auto-konversi ke Rp
- Google Sheets = **single source of truth**
- MongoDB = sessions, preferences, AI cache
- Groq AI = natural language commands & spending summary
- Semua command admin dibatasi via `OWNER_ID`

---

## Links

- [Live Demo](https://fjrtelebot.vercel.app)
- [Grammy.js Docs](https://grammy.dev)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Groq Cloud](https://console.groq.com)

---

> Built by [@fjrhub](https://github.com/fjrhub) · MIT License
