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
   GOOGLE SHEETS CLIENT & UTIL
========================= */
function sheetsClient() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!process.env.GOOGLE_CLIENT_EMAIL || !privateKey) {
    throw new Error("Kredensial Google Sheets tidak lengkap di .env");
  }
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function fetchAllRows() {
  if (!process.env.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID tidak ditemukan di .env");
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: "Sheet1!A2:N" });
  return res.data.values || [];
}

function getLastFromCache(rows, akun) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][6] === akun) {
      const mataUang = rows[i][5] || "Rp";
      const saldo = sheetToAmount(rows[i][9], mataUang);
      return { mataUang, saldo };
    }
  }
  return { saldo: 0, mataUang: "Rp" };
}

async function appendTransaction(data) {
  const sheets = sheetsClient();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A:O",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        data.jenis, data.kategori, data.subKategori, data.deskripsi,
        amountToSheet(data.jumlah, data.mataUang), data.mataUang, data.akun, data.metode,
        amountToSheet(data.saldoSebelum, data.mataUang), amountToSheet(data.saldoSesudah, data.mataUang),
        data.tag, data.catatan, now, now
      ]],
    },
  });
}

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

const sheetToAmount = (value, currency) => currency === "USDT" ? Number(value || 0) / 1000 : Number(value || 0);
const amountToSheet = (amount, currency) => currency === "USDT" ? Math.round(Number(amount) * 1000) : Math.round(Number(amount));
const formatAmount = (amount, currency) => currency === "USDT" 
  ? `${Number(amount).toLocaleString("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} USDT`
  : `Rp${new Intl.NumberFormat("id-ID").format(Math.round(amount))}`;

/* =========================
   COMMAND: addbalancei
========================= */
export default {
  name: "addbalancei",
  async execute(ctx) {
    const ownerId = String(process.env.OWNER_ID).replace(/['"]+/g, "");
    if (String(ctx.from?.id) !== ownerId) return ctx.reply("⛔ Akses ditolak.");

    const text = ctx.message.text.replace(/^\/addbalancei\s*/i, "").trim();
    if (!text) {
      return ctx.reply("⚠️ *Format:* `/addbalancei jenis|kategori|subKategori|deskripsi|jumlah|akun|metode|tag|catatan`\n\n💡 *Contoh:* `/addbalancei Pemasukan|Investasi|Bunga Bank|Bunga Seabank|289|Seabank|Transfer|#bunga|-`", { parse_mode: "Markdown" });
    }

    // Split dan pastikan selalu ada 9 elemen, isi kekurangan dengan "-"
    const parts = text.split("|").map(p => p.trim());
    while (parts.length < 9) parts.push("-");

    const [jenis, kategori, subKategori, deskripsi, jumlahStr, akun, metode, tag = "-", catatan = "-"] = parts;

    // Validasi
    if (!OPTIONS.jenis.includes(jenis)) return ctx.reply(`⚠️ *Jenis* tidak valid. Pilih: ${OPTIONS.jenis.join(", ")}`, { parse_mode: "Markdown" });
    if (!OPTIONS.kategori[jenis].includes(kategori)) return ctx.reply(`⚠️ *Kategori* tidak valid.`, { parse_mode: "Markdown" });
    if (!OPTIONS.subKategori[jenis][kategori]?.includes(subKategori)) return ctx.reply(`⚠️ *Sub Kategori* tidak valid.`, { parse_mode: "Markdown" });
    if (!OPTIONS.akun.includes(akun)) return ctx.reply(`⚠️ *Akun* tidak valid. Pilih: ${OPTIONS.akun.join(", ")}`, { parse_mode: "Markdown" });
    if (!OPTIONS.metode.includes(metode)) return ctx.reply(`⚠️ *Metode* tidak valid.`, { parse_mode: "Markdown" });

    const jumlah = parseInputAmount(jumlahStr);
    if (isNaN(jumlah) || jumlah <= 0) return ctx.reply("⚠️ *Jumlah* tidak valid.", { parse_mode: "Markdown" });

    try {
      const rows = await fetchAllRows();
      const { saldo: saldoSebelum, mataUang } = getLastFromCache(rows, akun);
      const finalMataUang = mataUang || "Rp";
      const saldoSesudah = jenis === "Pemasukan" ? saldoSebelum + jumlah : saldoSebelum - jumlah;

      await appendTransaction({
        jenis, kategori, subKategori, deskripsi, jumlah,
        mataUang: finalMataUang, akun, metode, saldoSebelum, saldoSesudah,
        // PERBAIKAN: Simpan persis seperti input, jangan ubah "-" jadi ""
        tag: tag === "" ? "-" : tag,
        catatan: catatan === "" ? "-" : catatan,
      });

      return ctx.reply(
        `✅ *Transaksi berhasil disimpan!*\n\n` +
        `📌 *${jenis}* | ${kategori} > ${subKategori}\n📝 ${deskripsi}\n` +
        `💰 *${formatAmount(jumlah, finalMataUang)}*\n🏦 ${akun} (${metode})\n` +
        `🏷️ Tag: ${tag}\n📎 Catatan: ${catatan}\n` +
        `📊 Saldo: ${formatAmount(saldoSebelum, finalMataUang)} → *${formatAmount(saldoSesudah, finalMataUang)}*`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("💥 [ADDBALANCEI] CRASH:", error);
      return ctx.reply(`❌ Terjadi kesalahan: ${error.message}`);
    }
  },
};