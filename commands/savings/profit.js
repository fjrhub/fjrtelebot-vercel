import { google } from "googleapis";

/* =========================
   GOOGLE SHEETS
========================= */
function sheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
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
const formatRupiah = (n) =>
  "Rp" + new Intl.NumberFormat("id-ID").format(n || 0);

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  if (day !== 1) d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function calculateProfit(rows, mode = "all") {
  let masuk = 0;
  let keluar = 0;

  const now = new Date();
  const startWeek = startOfWeek(now);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  rows.forEach((r) => {
    const jenis = r[0];
    const kategori = r[1];
    const subKategori = r[2];
    const jumlah = Number(r[4]) || 0;
    const createdAt = new Date(r[12]);

    // hanya hitung usaha penjualan
    if (kategori !== "Usaha" || subKategori !== "Penjualan") return;

    if (mode === "week" && createdAt < startWeek) return;
    if (mode === "month" && createdAt < startMonth) return;

    if (jenis === "Pemasukan") masuk += jumlah;
    if (jenis === "Pengeluaran") keluar += jumlah;
  });

  return {
    masuk,
    keluar,
    profit: masuk - keluar,
  };
}

/* =========================
   COMMAND
========================= */
export default {
  name: "profit",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const rows = await fetchTransactions();

    if (!rows.length) {
      return ctx.reply("📭 Belum ada data transaksi.");
    }

    const all = calculateProfit(rows, "all");
    const month = calculateProfit(rows, "month");
    const week = calculateProfit(rows, "week");

    const text =
      `📊 *RINGKASAN PROFIT USAHA PULSA*\n\n` +
      `🕒 *SEMUA WAKTU*\n` +
      `🟢 Pemasukan : ${formatRupiah(all.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(all.keluar)}\n` +
      `💰 Profit : ${formatRupiah(all.profit)}\n\n` +
      `📅 *BULAN INI*\n` +
      `🟢 Pemasukan : ${formatRupiah(month.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(month.keluar)}\n` +
      `💰 Profit : ${formatRupiah(month.profit)}\n\n` +
      `📆 *MINGGU INI*\n` +
      `🟢 Pemasukan : ${formatRupiah(week.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(week.keluar)}\n` +
      `💰 Profit : ${formatRupiah(week.profit)}`;

    return ctx.reply(text, { parse_mode: "Markdown" });
  },
};
