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

async function fetchAllRows() {
  if (!process.env.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID tidak ditemukan di .env");
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:N",
  });
  return res.data.values || [];
}

/* =========================
   UTIL
========================= */
// Mengubah angka ke format singkat (misal: 20000 -> 20K, 1500000 -> 1.5jt)
const formatToShort = (n) => {
  const num = Number(n);
  if (Number.isNaN(num)) return "0"; // Fallback aman jika data bukan angka
  if (num >= 1000000) return `${(num / 1000000).toString().replace(/\.0$/, '')}jt`;
  if (num >= 1000) return `${(num / 1000).toString().replace(/\.0$/, '')}K`;
  return String(num);
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

      const args = (ctx.message?.text || "").split(/\s+/);
      const targetDate = args[1];

      // Jika ada argumen tanggal, cari semua transaksi di tanggal tersebut
      if (targetDate) {
        console.log(`🔄 [RESELLI] Mencari transaksi untuk tanggal: ${targetDate}`);
        const allRows = await fetchAllRows();
        
        // Filter baris yang mengandung tanggal (cek kolom indeks 12 [dibuatPada] atau 0 [jenis/tanggal])
        const matchedRows = allRows.filter(r => {
          const col0 = String(r[0] || "").toLowerCase();
          const col12 = String(r[12] || "").toLowerCase();
          const searchDate = targetDate.toLowerCase();
          return col0.includes(searchDate) || col12.includes(searchDate);
        });

        if (matchedRows.length === 0) {
          return ctx.reply(`❌ Tidak ditemukan transaksi untuk tanggal: ${targetDate}`);
        }

        const pengeluaranRows = matchedRows.filter(r => String(r[0]).toLowerCase() === "pengeluaran");
        const pemasukanRows = matchedRows.filter(r => String(r[0]).toLowerCase() === "pemasukan");

        if (pengeluaranRows.length === 0 && pemasukanRows.length === 0) {
          return ctx.reply(`❌ Ditemukan data pada tanggal ${targetDate}, tetapi bukan transaksi Pengeluaran/Pemasukan.`);
        }

        let resultText = `📅 **Transaksi pada tanggal: ${targetDate}**\n\n`;
        const maxPairs = Math.max(pengeluaranRows.length, pemasukanRows.length);
        
        for (let i = 0; i < maxPairs; i++) {
          const rowKeluar = pengeluaranRows[i];
          const rowMasuk = pemasukanRows[i];

          if (rowKeluar && rowMasuk) {
            const akunKeluar = rowKeluar[6] || "TidakDiketahui";
            const akunMasuk = rowMasuk[6] || "TidakDiketahui";
            const jumlahKeluar = formatToShort(rowKeluar[4]);
            const jumlahMasuk = formatToShort(rowMasuk[4]);
            const deskripsi = rowKeluar[3] || rowMasuk[3] || "Tanpa Deskripsi";
            const commandString = `/selli ${akunKeluar} ${akunMasuk} ${jumlahKeluar} ${jumlahMasuk} -desc "${deskripsi}"`;
            resultText += `**Pasangan ${i + 1}:**\n\`${commandString}\`\n\n`;
          } else if (rowKeluar) {
            const akunKeluar = rowKeluar[6] || "TidakDiketahui";
            const jumlahKeluar = formatToShort(rowKeluar[4]);
            const deskripsi = rowKeluar[3] || "Tanpa Deskripsi";
            resultText += `**Pengeluaran ${i + 1}:**\n\`/expense ${akunKeluar} ${jumlahKeluar} -desc "${deskripsi}"\`\n\n`;
          } else if (rowMasuk) {
            const akunMasuk = rowMasuk[6] || "TidakDiketahui";
            const jumlahMasuk = formatToShort(rowMasuk[4]);
            const deskripsi = rowMasuk[3] || "Tanpa Deskripsi";
            resultText += `**Pemasukan ${i + 1}:**\n\`/income ${akunMasuk} ${jumlahMasuk} -desc "${deskripsi}"\`\n\n`;
          }
        }

        return ctx.reply(resultText.trim(), { parse_mode: "Markdown" });
      }

      // Fallback: Perilaku asli (ambil 2 data terbaru)
      console.log("🔄 [RESELLI] Mengambil 2 data transaksi terbaru...");
      const latestRows = await fetchLatestTwoRows();

      if (latestRows.length < 2) {
        return ctx.reply("❌ Tidak cukup data. Minimal harus ada 2 baris transaksi di Google Sheets.");
      }

      // Cari pasangan Pengeluaran dan Pemasukan
      const rowKeluar = latestRows.find(r => String(r[0]).toLowerCase() === "pengeluaran");
      const rowMasuk = latestRows.find(r => String(r[0]).toLowerCase() === "pemasukan");

      // PERBAIKAN: Beritahu secara spesifik mana yang tidak ada
      if (!rowKeluar && !rowMasuk) {
        return ctx.reply("❌ Tidak ditemukan data Pengeluaran maupun Pemasukan di 2 transaksi terbaru.");
      }
      if (!rowKeluar) {
        return ctx.reply("❌ Tidak ditemukan data Pengeluaran di 2 transaksi terbaru (hanya ada Pemasukan).");
      }
      if (!rowMasuk) {
        return ctx.reply("❌ Tidak ditemukan data Pemasukan di 2 transaksi terbaru (hanya ada Pengeluaran).");
      }

      // Mapping index dengan fallback aman jika kolom kosong
      const akunKeluar = rowKeluar[6] || "TidakDiketahui";
      const akunMasuk = rowMasuk[6] || "TidakDiketahui";
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