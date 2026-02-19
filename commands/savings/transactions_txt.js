import { google } from "googleapis";
import { InputFile } from "grammy";
import { Buffer } from "buffer";

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

async function fetchTransactions() {
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
const formatNumber = (n) => 
  new Intl.NumberFormat("id-ID").format(Number(n) || 0);

const formatDate = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getHeaderIcon = (jenis) => {
  switch (jenis) {
    case "Pemasukan": return "🟢";
    case "Pengeluaran": return "🔴";
    case "Initial": return "🔵";
    default: return "⚪";
  }
};

/* =========================
   GENERATE FULL TEXT
========================= */
function generateFullText(rows, sortType) {
  let text = `📒 DAFTAR SEMUA TRANSAKSI (${sortType.toUpperCase()})\n`;
  text += `Jumlah: ${rows.length} transaksi\n`;
  text += `Tanggal Ekspor: ${formatDate(new Date().toISOString())}\n\n`;
  
  rows.forEach((r, i) => {
    const [
      jenis, kategori, subKategori, deskripsi, jumlah, mataUang, 
      akun, metode, saldoSebelum, saldoSesudah, tag, catatan, dibuatPada
    ] = r;

    const headerIcon = getHeaderIcon(jenis);
    const nomor = sortType === "desc" ? rows.length - i : i + 1;

    text += 
      `===== TRANSAKSI #${nomor} =====\n` +
      `${headerIcon} ${jenis} | ${akun} | ${metode}\n` +
      `${kategori} › ${subKategori}\n` +
      `Deskripsi: ${deskripsi}\n` +
      `Catatan: ${catatan || "-"}\n` +
      `Jumlah: ${mataUang}${formatNumber(jumlah)}\n` +
      `Saldo: ${formatNumber(saldoSebelum)} → ${formatNumber(saldoSesudah)}\n` +
      `Tag: ${tag || "-"}\n` +
      `Waktu: ${formatDate(dibuatPada)}\n\n`;
  });
  
  return text;
}

/* =========================
   COMMAND UNTUK GRAMMY
========================= */
export default {
  name: "transactions_txt", // Nama command berubah di sini
  
  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) {
      return ctx.reply("❌ Anda tidak memiliki izin untuk menggunakan command ini.");
    }

    // Parse argumen command
    const args = ctx.message.text.split(" ");
    const sortType = args[1]?.toLowerCase() === "desc" ? "desc" : "asc";

    const rows = await fetchTransactions();
    if (!rows.length) {
      return ctx.reply("📭 Belum ada transaksi dalam database.");
    }

    // Sorting berdasarkan tanggal (index 12)
    const orderedRows = [...rows].sort((a, b) => {
      const dateA = new Date(a[12] || 0).getTime();
      const dateB = new Date(b[12] || 0).getTime();
      return sortType === "desc" ? dateB - dateA : dateA - dateB;
    });

    // Generate teks lengkap
    const fullText = generateFullText(orderedRows, sortType);
    
    // Kirim sebagai file .txt
    const buffer = Buffer.from(fullText, "utf-8");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `transaksi_${sortType}_${timestamp}.txt`;
    
    await ctx.reply("📄 File transaksi sedang diproses...", {
      reply_to_message_id: ctx.msgId,
    });
    
    await ctx.replyWithDocument(
      new InputFile(buffer, filename),
      { 
        caption: `✅ File transaksi berhasil dibuat!\n• Total: ${orderedRows.length} transaksi\n• Urutan: ${sortType === "desc" ? "Terbaru dulu" : "Terlama dulu"}` 
      }
    );
  }
};