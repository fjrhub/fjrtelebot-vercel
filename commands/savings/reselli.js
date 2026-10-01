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
  if (num >= 1000000) {
    const val = (num / 1000000).toString().replace('.', ',');
    return val.replace(/,0$/, '') + 'jt';
  }
  if (num >= 1000) {
    const val = (num / 1000).toString().replace('.', ',');
    return val.replace(/,0$/, '') + 'K';
  }
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

      const dateRows = allRows
        .map((r, idx) => ({ row: r, idx }))
        .filter(({ row }) => {
          if (!row || !row[12]) return false;
          const rowDateStr = row[12].split('T')[0];
          return rowDateStr === targetDate;
        });

      if (dateRows.length === 0) {
        return ctx.reply(`❌ Tidak ditemukan transaksi apa pun untuk tanggal: ${targetDate}`);
      }

      const processedIdx = new Set();
      const entries = [];

      const byDesc = {};
      for (const item of dateRows) {
        const desc = item.row[3] || `__nonedesc_${item.idx}`;
        if (!byDesc[desc]) byDesc[desc] = [];
        byDesc[desc].push(item);
      }

      // 1. Handle Pasangan Selli
      for (const desc in byDesc) {
        const group = byDesc[desc];
        const pengeluaran = group.find(i => i.row[0] === 'Pengeluaran' && i.row[1] === 'Usaha' && i.row[2] === 'Penjualan');
        const pemasukan = group.find(i => i.row[0] === 'Pemasukan' && i.row[1] === 'Usaha' && i.row[2] === 'Penjualan');

        if (pengeluaran && pemasukan) {
          const time = new Date(pemasukan.row[12]).getTime();
          const akunKeluar = pengeluaran.row[6] || "TidakDiketahui";
          const akunMasuk = pemasukan.row[6] || "TidakDiketahui";
          const jmlKeluar = formatToShort(pengeluaran.row[4]);
          const jmlMasuk = formatToShort(pemasukan.row[4]);
          const cleanDesc = desc.replace(/\|/g, "-").replace(/"/g, "'");
          
          entries.push({
            time,
            command: `/selli ${akunKeluar} ${akunMasuk} ${jmlKeluar} ${jmlMasuk} -desc "${cleanDesc}"`
          });
          processedIdx.add(pengeluaran.idx);
          processedIdx.add(pemasukan.idx);
        }
      }

      // 2. Handle Pasangan Transfer Antar Akun (TANPA PIPE)
      for (const desc in byDesc) {
        const group = byDesc[desc];
        const pengeluaranTransfer = group.find(i => i.row[0] === 'Pengeluaran' && i.row[1] === 'Transfer' && i.row[2] === 'Antar Akun');
        const pemasukanTransfer = group.find(i => i.row[0] === 'Pemasukan' && i.row[1] === 'Transfer' && i.row[2] === 'Antar Akun');

        if (pengeluaranTransfer && pemasukanTransfer) {
          const time = new Date(pemasukanTransfer.row[12]).getTime();
          
          const akunAsal = pengeluaranTransfer.row[6] || "TidakDiketahui";
          const akunTujuan = pemasukanTransfer.row[6] || "TidakDiketahui";
          
          const jumlahKirim = pengeluaranTransfer.row[4] || "0";
          const jumlahTerima = pemasukanTransfer.row[4] || "0";
          
          const rawDesc = pengeluaranTransfer.row[3] || "";
          const cleanDesc = rawDesc.replace(/\|/g, "-").replace(/"/g, "'");
          const defaultDesc = `Transfer ${akunAsal} ke ${akunTujuan}`;
          const finalDesc = (cleanDesc && cleanDesc !== defaultDesc) ? cleanDesc : defaultDesc;

          let command = `/transferi ${akunAsal} ${akunTujuan} ${jumlahKirim}`;
          if (jumlahKirim !== jumlahTerima) {
            command += ` ${jumlahTerima}`;
          }
          command += ` -desc "${finalDesc}"`;

          entries.push({ time, command });
          
          processedIdx.add(pengeluaranTransfer.idx);
          processedIdx.add(pemasukanTransfer.idx);
        }
      }

      // 3. Handle Transaksi Biasa (addbalancei)
      for (const item of dateRows) {
        if (processedIdx.has(item.idx)) continue;
        const row = item.row;
        
        const jenis = row[0] || 'Pemasukan';
        const kategori = row[1] || 'Lainnya';
        const subKategori = row[2] || 'Lainnya';
        const desc = (row[3] || 'Tanpa Deskripsi').replace(/\|/g, "-");
        const jumlah = row[4] || '0';
        const akun = row[6] || 'TidakDiketahui';
        const metode = row[7] || 'Transfer';
        const tag = (row[10] !== undefined && row[10].trim() !== "") ? row[10].trim() : "-";
        const catatan = (row[11] !== undefined && row[11].trim() !== "") ? row[11].trim() : "-";
        const time = new Date(row[12]).getTime();

        if (jenis === 'Pemasukan' || jenis === 'Pengeluaran') {
          entries.push({ 
            time, 
            command: `/addbalancei ${jenis}|${kategori}|${subKategori}|${desc}|${jumlah}|${akun}|${metode}|${tag}|${catatan}` 
          });
        }
      }

      // 4. Urutkan SEMUA berdasarkan waktu (kronologis)
      entries.sort((a, b) => a.time - b.time);

      // 5. Format Output (enter normal, tanpa pemisahan kategori)
      let resultText = `📅 **Transaksi pada: ${targetDate}**\n\n`;
      entries.forEach((e) => {
        resultText += `\`${e.command}\`\n`;
      });

      return ctx.reply(resultText.trim(), { parse_mode: "Markdown" });

    } catch (error) {
      console.error("💥 [RESELLI] CRASH:", error);
      ctx.reply(`❌ Terjadi kesalahan sistem: ${error.message}`).catch(console.error);
    }
  },
};