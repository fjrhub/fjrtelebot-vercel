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
const formatToShort = (n) => {
  const num = Number(n);
  if (Number.isNaN(num)) return "0";
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

      if (!targetDate) {
        return ctx.reply("⚠️ Format salah. Gunakan: `/reselli <YYYY-MM-DD>`\nContoh: `/reselli 2026-09-17`", { parse_mode: "Markdown" });
      }

      console.log(`🔄 [RESELLI] Mencari transaksi untuk tanggal: ${targetDate}`);
      const allRows = await fetchAllRows();
      
      // Filter baris berdasarkan tanggal (kolom indeks 12 adalah timestamp)
      const dateRows = allRows.filter(r => {
        if (!r || !r[12]) return false;
        const rowDateStr = r[12].split('T')[0]; // Ambil "2026-09-17" dari "2026-09-17T19:24:43.578Z"
        return rowDateStr === targetDate;
      });

      if (dateRows.length === 0) {
        return ctx.reply(`❌ Tidak ditemukan transaksi apa pun untuk tanggal: ${targetDate}`);
      }

      // Pisahkan: Usaha > Penjualan vs Lainnya
      const usahaRows = dateRows.filter(r => r[1] === 'Usaha' && r[2] === 'Penjualan');
      const otherRows = dateRows.filter(r => !(r[1] === 'Usaha' && r[2] === 'Penjualan'));

      // 1. Proses Pasangan Usaha > Penjualan (Grouping by Deskripsi)
      const pairs = [];
      const processedDescs = new Set();

      for (const row of usahaRows) {
        const desc = row[3];
        if (processedDescs.has(desc)) continue;
        
        const pengeluaran = usahaRows.find(r => r[3] === desc && r[0] === 'Pengeluaran');
        const pemasukan = usahaRows.find(r => r[3] === desc && r[0] === 'Pemasukan');

        if (pengeluaran && pemasukan) {
          pairs.push({
            desc,
            pengeluaran,
            pemasukan,
            time: new Date(pemasukan[12]).getTime() // Untuk sorting
          });
          processedDescs.add(desc);
        }
      }

      // Urutkan pasangan berdasarkan waktu (ascending)
      pairs.sort((a, b) => a.time - b.time);

      // 2. Proses Transaksi Lainnya (Urutkan berdasarkan waktu)
      const others = otherRows.map(r => ({
        type: r[0],
        akun: r[6] || 'TidakDiketahui',
        jumlah: formatToShort(r[4]),
        desc: r[3] || 'Tanpa Deskripsi',
        time: new Date(r[12]).getTime()
      })).sort((a, b) => a.time - b.time);

      // 3. Bangun Output String
      let resultText = `📅 **Transaksi Usaha > Penjualan pada: ${targetDate}**\n\n`;
      
      if (pairs.length === 0) {
        resultText += "_Tidak ada transaksi Usaha > Penjualan pada tanggal ini._\n";
      } else {
        pairs.forEach((pair, i) => {
          const akunKeluar = pair.pengeluaran[6] || "TidakDiketahui";
          const akunMasuk = pair.pemasukan[6] || "TidakDiketahui";
          const jmlKeluar = formatToShort(pair.pengeluaran[4]);
          const jmlMasuk = formatToShort(pair.pemasukan[4]);
          const cmd = `/selli ${akunKeluar} ${akunMasuk} ${jmlKeluar} ${jmlMasuk} -desc "${pair.desc}"`;
          resultText += `**${i + 1}.** \`${cmd}\`\n`;
        });
      }

      if (others.length > 0) {
        resultText += `\n➖➖➖➖➖➖➖➖➖➖➖➖\n`;
        resultText += `📌 **Transaksi Lainnya (Non-Penjualan):**\n\n`;
        others.forEach((item, i) => {
          const cmd = item.type === 'Pemasukan' 
            ? `/addbalance ${item.akun} ${item.jumlah} -desc "${item.desc}"`
            : `/expense ${item.akun} ${item.jumlah} -desc "${item.desc}"`;
          resultText += `**${i + 1}.** \`${cmd}\`\n`;
        });
      }

      return ctx.reply(resultText.trim(), { parse_mode: "Markdown" });

    } catch (error) {
      console.error("💥 [RESELLI] CRASH:", error);
      ctx.reply(`❌ Terjadi kesalahan sistem: ${error.message}`).catch(console.error);
    }
  },
};