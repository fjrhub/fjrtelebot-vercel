import { google } from "googleapis";

/* =========================
   GOOGLE SHEETS CLIENT
========================= */
function sheetsClient() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!process.env.GOOGLE_CLIENT_EMAIL || !privateKey) {
    throw new Error("Kredensial Google Sheets (CLIENT_EMAIL / PRIVATE_KEY) tidak lengkap di .env");
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function fetchLatestTwoRows() {
  if (!process.env.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID tidak ditemukan di .env");
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:N",
  });
  const rows = res.data.values || [];
  return rows.slice(-2); // Ambil 2 baris paling bawah (terbaru)
}

/* =========================
   UTIL
========================= */
// Mengubah angka kembali ke format singkat (misal: 20000 -> 20K, 1500000 -> 1.5jt)
const formatToShort = (n) => {
  const num = Number(n);
  if (num >= 1000000 && num % 1000000 === 0) return `${num / 1000000}jt`;
  if (num >= 1000 && num % 1000 === 0) return `${num / 1000}K`;
  return String(num); // Jika tidak bulat, kembalikan angka asli
};

/* =========================
   COMMAND
========================= */
export default {
  name: "reselli",

  async execute(ctx) {
    console.log("🚀 [RESELLI] Command diterima.");
    try {
      const ownerId = String(process.env.OWNER_ID).replace(/['"]+/g, '');
      if (String(ctx.from?.id) !== ownerId) {
        return ctx.reply("⛔ Akses ditolak. Hanya owner yang dapat menggunakan perintah ini.");
      }

      console.log("🔄 [RESELLI] Mengambil 2 data transaksi terbaru...");
      const latestRows = await fetchLatestTwoRows();

      if (latestRows.length < 2) {
        return ctx.reply("❌ Tidak cukup data. Minimal harus ada 2 baris transaksi di Google Sheets.");
      }

      // Cari pasangan Pengeluaran dan Pemasukan
      const rowKeluar = latestRows.find(r => r[0] === "Pengeluaran");
      const rowMasuk = latestRows.find(r => r[0] === "Pemasukan");

      if (!rowKeluar || !rowMasuk) {
        return ctx.reply("❌ 2 data terbaru bukan merupakan pasangan transaksi Selli (Pengeluaran & Pemasukan).");
      }

      // Mapping index berdasarkan struktur Sheet Anda:
      // 0: jenis, 1: kategori, 2: subKategori, 3: deskripsi, 4: jumlah, 5: mataUang, 
      // 6: akun, 7: metode, 8: saldoSebelum, 9: saldoSesudah, 10: tag, 11: catatan
      const akunKeluar = rowKeluar[6];
      const akunMasuk = rowMasuk[6];
      const jumlahKeluar = formatToShort(rowKeluar[4]);
      const jumlahMasuk = formatToShort(rowMasuk[4]);
      const deskripsi = rowKeluar[3] || rowMasuk[3] || "Tanpa Deskripsi";

      // Buat string command yang siap di-copy
      const commandString = `/selli ${akunKeluar} ${akunMasuk} ${jumlahKeluar} ${jumlahMasuk} -desc "${deskripsi}"`;

      return ctx.reply(
        `📋 **Format /selli dari 2 transaksi terbaru:**\n\n` +
        `Anda bisa menyalin (copy) teks di dalam kotak di bawah ini, mengeditnya jika perlu, lalu kirim sebagai perintah baru:\n\n` +
        `\`${commandString}\``,
        { parse_mode: "Markdown" }
      );

    } catch (error) {
      console.error("💥 [RESELLI] CRASH:", error);
      ctx.reply(`❌ Terjadi kesalahan sistem: ${error.message}`).catch(console.error);
    }
  },
};