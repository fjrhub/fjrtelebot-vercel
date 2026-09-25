import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */
const OPTIONS = {
  jenis: ["Pemasukan", "Pengeluaran"],

  kategori: {
    Pengeluaran: ["Konsumsi", "Transportasi", "Hiburan", "Utilitas", "Pendidikan", "Administrasi", "Belanja", "Investasi", "Hutang", "Keluarga", "Amal", "Penyesuaian", "Lainnya"],
    Pemasukan: ["Gaji", "Usaha", "Investasi", "Hadiah", "Refund", "Hutang", "Keluarga", "Donasi", "Penyesuaian", "Lainnya"],
  },

  subKategori: {
    Pengeluaran: {
      Konsumsi: ["Makan Berat", "Jajan", "Kopi", "Minuman"],
      Transportasi: ["Bensin", "Ojol", "Parkir", "Servis", "Darurat"],
      Hiburan: ["Game", "Streaming"],
      Utilitas: ["Internet", "Listrik", "Pulsa"],
      Pendidikan: ["Buku", "Fotokopi", "ATK", "Print", "Foto Dokumen", "Modul", "Iuran Sekolah"],
      Administrasi: ["SKCK", "KTP", "SIM", "STNK", "Paspor", "Materai", "Foto Dokumen", "Fotokopi", "Pajak", "BPJS", "Biaya Pemerintah"],
      Belanja: ["Online", "Offline", "Langganan"],
      Investasi: ["Crypto", "Saham", "Emas", "Reksa Dana"],
      Hutang: ["Bayar Hutang", "Cicilan", "Potongan Hutang"],
      Keluarga: ["Uang Bulanan Ortu", "Biaya Kesehatan Ortu", "Kebutuhan Harian Ortu", "Oleh-oleh", "Bantuan Keluarga Lain"],
      Amal: ["Sedekah", "Zakat", "Infaq", "Sumbangan", "Kotak Amal"],
      Penyesuaian: ["Penyesuaian Bank", "Biaya Admin Bank", "Koreksi Saldo", "Rounding"],
      Lainnya: ["Uang Kas", "Kewajiban", "Pengeluaran Rutin", "Pengeluaran Lain"],
    },
    Pemasukan: {
      Gaji: ["Gaji Bulanan", "Bonus", "THR"],
      Usaha: ["Penjualan", "Jasa", "Komisi"],
      Investasi: ["Crypto", "Saham", "Emas", "Dividen", "Bunga Bank"],
      Hadiah: ["Uang Saku", "Hadiah", "Donasi"],
      Refund: ["Refund Belanja", "Cashback"],
      Hutang: ["Pinjaman Ibu", "Pinjaman Teman", "Talangan", "Utang Baru"],
      Keluarga: ["Uang Saku dari Ortu", "Bantuan Darurat", "Hibah"],
      Donasi: ["Donasi Masuk", "Bantuan", "Crowdfunding"],
      Penyesuaian: ["Penyesuaian Bank", "Koreksi Bunga", "Bonus Saldo", "Rounding Positif"],
      Lainnya: ["Uang Saku", "Bantuan", "Pemasukan Lain"],
    },
  },

  akun: ["Wallet", "Dana", "Gopay", "Seabank", "Bank", "Binance", "Fjlsaldo", "Jago"],
  metode: ["Cash", "Transfer", "QRIS", "Debit", "Virtual Account"],
  mataUang: ["Rp", "USDT"],
};

/* =========================
   UTIL
========================= */
const parseInputAmount = (text) => {
  if (!text) return 0;
  let str = String(text).trim().toLowerCase().replace(/\./g, "").replace(",", ".");
  str = str.replace(/^rp/, "");
  
  const match = str.match(/^([\d.]+)\s*(k|rb|ribu|m|jt|juta|b|miliar|mil|t|triliun)?/);
  if (!match) return Number(str) || 0;
  
  let value = parseFloat(match[1]);
  const suffix = match[2] || "";
  if (isNaN(value)) return 0;
  
  switch (suffix) {
    case "k": case "rb": case "ribu": value *= 1000; break;
    case "m": case "jt": case "juta": value *= 1000000; break;
    case "b": case "miliar": case "mil": value *= 1000000000; break;
    case "t": case "triliun": value *= 1000000000000; break;
  }
  return Math.round(value * 100) / 100;
};

const sheetToAmount = (value, currency) => {
  if (currency === "USDT") return Number(value || 0) / 1000;
  return Number(value || 0);
};

const amountToSheet = (amount, currency) => {
  if (currency === "USDT") return Math.round(Number(amount) * 1000);
  return Math.round(Number(amount));
};

const formatAmount = (amount, currency) => {
  if (currency === "USDT") {
    return `${Number(amount).toLocaleString("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} USDT`;
  }
  if (currency === "Rp") {
    return `Rp${new Intl.NumberFormat("id-ID").format(Math.round(amount))}`;
  }
  return `${amount} ${currency}`;
};

/* =========================
   GOOGLE SHEETS
========================= */
function sheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: "service_account",
      project_id: process.env.GOOGLE_PROJECT_ID,
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function fetchAllRows() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!F2:J",
  });
  return res.data.values || [];
}

function getLastFromCache(rows, akun) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][1] === akun) {
      const mataUang = rows[i][0] || null;
      const saldo = sheetToAmount(rows[i][4], mataUang);
      return { mataUang, saldo };
    }
  }
  return { saldo: 0, mataUang: null };
}

async function appendTransaction(data) {
  const sheets = sheetsClient();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A:O",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          data.jenis,
          data.kategori,
          data.subKategori,
          data.deskripsi,
          amountToSheet(data.jumlah, data.mataUang),
          data.mataUang,
          data.akun,
          data.metode,
          amountToSheet(data.saldoSebelum, data.mataUang),
          amountToSheet(data.saldoSesudah, data.mataUang),
          data.tag,
          data.catatan,
          now,
          now,
        ],
      ],
    },
  });
}

/* =========================
   COMMAND: addbalancei (Input Langsung)
========================= */
export default {
  name: "addbalancei",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const text = ctx.message.text.replace(/^\/addbalancei\s*/i, "").trim();
    
    if (!text) {
      return ctx.reply(
        "⚠️ Format: `/addbalancei jenis|kategori|subKategori|deskripsi|jumlah|akun|metode|tag|catatan`\n\n" +
        "Contoh:\n" +
        "`/addbalancei Pengeluaran|Konsumsi|Makan Berat|Makan siang|50k|Dana|QRIS|-|Lapar`\n" +
        "`/addbalancei Pemasukan|Gaji|Gaji Bulanan|Gaji bulan ini|5jt|Jago|Transfer|Gaji|Bonus`\n\n" +
        "💡 Gunakan `-` untuk tag/catatan jika tidak ada.\n" +
        "💡 Jumlah bisa pakai singkatan: `100k`, `1.5jt`, `50rb`."
      );
    }

    const parts = text.split("|").map((p) => p.trim());
    if (parts.length < 7) {
      return ctx.reply("⚠️ Minimal 7 argumen dipisahkan dengan `|`.\nFormat: `jenis|kategori|subKategori|deskripsi|jumlah|akun|metode|tag|catatan`");
    }

    const [jenis, kategori, subKategori, deskripsi, jumlahStr, akun, metode, tag = "-", catatan = "-"] = parts;

    // Validasi Input
    if (!OPTIONS.jenis.includes(jenis)) {
      return ctx.reply(`⚠️ Jenis tidak valid. Pilih: ${OPTIONS.jenis.join(", ")}`);
    }
    if (!OPTIONS.kategori[jenis].includes(kategori)) {
      return ctx.reply(`⚠️ Kategori tidak valid. Pilih: ${OPTIONS.kategori[jenis].join(", ")}`);
    }
    if (!OPTIONS.subKategori[jenis][kategori]?.includes(subKategori)) {
      return ctx.reply(`⚠️ Sub Kategori tidak valid. Pilih: ${OPTIONS.subKategori[jenis][kategori].join(", ")}`);
    }
    if (!OPTIONS.akun.includes(akun)) {
      return ctx.reply(`⚠️ Akun tidak valid. Pilih: ${OPTIONS.akun.join(", ")}`);
    }
    if (!OPTIONS.metode.includes(metode)) {
      return ctx.reply(`⚠️ Metode tidak valid. Pilih: ${OPTIONS.metode.join(", ")}`);
    }

    const jumlah = parseInputAmount(jumlahStr);
    if (isNaN(jumlah) || jumlah < 0) {
      return ctx.reply("⚠️ Jumlah tidak valid. Gunakan angka atau singkatan (contoh: 100k, 1.5jt).");
    }

    try {
      const rows = await fetchAllRows();
      const { saldo: saldoSebelum, mataUang } = getLastFromCache(rows, akun);
      const finalMataUang = mataUang || "Rp";

      const saldoSesudah = jenis === "Pemasukan" ? saldoSebelum + jumlah : saldoSebelum - jumlah;

      await appendTransaction({
        jenis,
        kategori,
        subKategori,
        deskripsi,
        jumlah,
        mataUang: finalMataUang,
        akun,
        metode,
        saldoSebelum,
        saldoSesudah,
        tag: tag === "-" ? "" : tag,
        catatan: catatan === "-" ? "" : catatan,
      });

      return ctx.reply(
        `✅ Transaksi berhasil disimpan!\n\n` +
          `📌 ${jenis} | ${kategori} > ${subKategori}\n` +
          `📝 ${deskripsi}\n` +
          `💰 ${formatAmount(jumlah, finalMataUang)}\n` +
          `🏦 ${akun} (${metode})\n` +
          `🏷️ Tag: ${tag}\n` +
          `📎 Catatan: ${catatan}\n` +
          `📊 Saldo: ${formatAmount(saldoSebelum, finalMataUang)} → ${formatAmount(saldoSesudah, finalMataUang)}`
      );
    } catch (error) {
      console.error("Error addbalancei:", error);
      return ctx.reply("❌ Terjadi kesalahan saat menyimpan transaksi.");
    }
  },
};