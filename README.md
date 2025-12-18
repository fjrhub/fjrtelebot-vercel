# Personal Finance Telegram Bot

Bot Telegram sederhana untuk **mencatat dan memantau keuangan pribadi**
menggunakan **Google Sheets sebagai database utama**.

Project ini ditujukan untuk penggunaan **pribadi**, dengan fokus pada
kejelasan data, transparansi, dan kemudahan maintenance.

---

## ✨ Fitur Utama

### ✅ Pencatatan Transaksi
- Pemasukan
- Pengeluaran
- Transfer antar akun
- Kategori & sub-kategori
- Multi akun (Wallet, Bank, E-Wallet, Binance, dll)
- Multi mata uang (IDR & USDT)

### 📊 Cek Saldo (`/balance`)
- Menampilkan saldo **per akun**
- Mendukung **IDR & USDT**
- Total saldo **dipisah per mata uang**
- Aman jika data masih kosong (`#N/A` otomatis dianggap 0)
- Timestamp menggunakan **WIB (Asia/Jakarta)**

---

## 🧱 Struktur Data (Google Sheets)

### Sheet Transaksi (`Sheet1`)

| Kolom | Keterangan |
|-----|-----------|
| F | Mata Uang (`IDR` / `USDT`) |
| G | Akun |
| J | Saldo setelah transaksi |

### Sheet Ringkasan Akun

| Kolom | Isi |
|-----|----|
| S | Nama Akun |
| T | Saldo Terakhir |
| U | Mata Uang Akun |

> Saldo dan mata uang diambil dari **transaksi terakhir** tiap akun.

---

## 🔁 Rumus Google Sheets

### Saldo Terakhir Akun
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

### Mata Uang Akun
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
  "IDR"
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

## 📌 Catatan Desain

- Satu akun hanya menggunakan satu mata uang
- USDT tidak dikonversi otomatis ke IDR
- Google Sheets adalah sumber data utama
- Bot hanya membaca dan menampilkan data

---

## 🚀 Pengembangan Selanjutnya

- `/last` → transaksi terakhir
- `/history` → riwayat singkat
- `/summary` → ringkasan bulanan
- Highlight saldo minus
