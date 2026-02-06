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

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function calculateProfit(rows, startDate, endDate) {
  let masuk = 0;
  let keluar = 0;

  rows.forEach((r) => {
    const jenis = r[0];
    const kategori = r[1];
    const subKategori = r[2];
    const jumlah = Number(r[4]) || 0;
    const createdAt = new Date(r[12]);

    // hanya hitung usaha penjualan
    if (kategori !== "Usaha" || subKategori !== "Penjualan") return;

    if (startDate && createdAt < startDate) return;
    if (endDate && createdAt > endDate) return;

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

    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(now);
    endToday.setHours(23, 59, 59, 999);

    const startYesterday = new Date(now);
    startYesterday.setDate(now.getDate() - 1);
    startYesterday.setHours(0, 0, 0, 0);
    const endYesterday = new Date(now);
    endYesterday.setDate(now.getDate() - 1);
    endYesterday.setHours(23, 59, 59, 999);

    const startThisWeek = startOfWeek(now);
    const startLastWeek = new Date(startThisWeek);
    startLastWeek.setDate(startThisWeek.getDate() - 7);
    const endLastWeek = new Date(startThisWeek);
    endLastWeek.setDate(startThisWeek.getDate() - 1);
    endLastWeek.setHours(23, 59, 59, 999);

    const startThisMonth = startOfMonth(now);
    const startLastMonth = new Date(now);
    startLastMonth.setMonth(now.getMonth() - 1);
    startLastMonth.setDate(1);
    startLastMonth.setHours(0, 0, 0, 0);
    const endLastMonth = endOfMonth(startLastMonth);

    const all = calculateProfit(rows, null, null); // semua waktu
    const today = calculateProfit(rows, startToday, endToday);
    const yesterday = calculateProfit(rows, startYesterday, endYesterday);
    const thisWeek = calculateProfit(rows, startThisWeek, null);
    const lastWeek = calculateProfit(rows, startLastWeek, endLastWeek);
    const thisMonth = calculateProfit(rows, startThisMonth, null);
    const lastMonth = calculateProfit(rows, startLastMonth, endLastMonth);

    const optionsMonth = { month: "long", year: "2-digit" };
    const optionsDate = { day: "numeric", month: "numeric", year: "2-digit" };

    const text =
      `📊 *RINGKASAN PROFIT USAHA PULSA*\n\n` +
      `🕒 *SEMUA WAKTU*\n` +
      `🟢 Pemasukan : ${formatRupiah(all.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(all.keluar)}\n` +
      `💰 Profit : ${formatRupiah(all.profit)}\n\n` +

      `📅 *BULAN LALU (${startLastMonth.toLocaleDateString("id-ID", optionsMonth)})*\n` +
      `🟢 Pemasukan : ${formatRupiah(lastMonth.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(lastMonth.keluar)}\n` +
      `💰 Profit : ${formatRupiah(lastMonth.profit)}\n\n` +

      `📅 *BULAN INI (${now.toLocaleDateString("id-ID", optionsMonth)})*\n` +
      `🟢 Pemasukan : ${formatRupiah(thisMonth.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(thisMonth.keluar)}\n` +
      `💰 Profit : ${formatRupiah(thisMonth.profit)}\n\n` +

      `📆 *MINGGU LALU (${startLastWeek.toLocaleDateString("id-ID", optionsDate)} - ${endLastWeek.toLocaleDateString("id-ID", optionsDate)})*\n` +
      `🟢 Pemasukan : ${formatRupiah(lastWeek.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(lastWeek.keluar)}\n` +
      `💰 Profit : ${formatRupiah(lastWeek.profit)}\n\n` +

      `📆 *MINGGU INI (${startThisWeek.toLocaleDateString("id-ID", optionsDate)} - ${now.toLocaleDateString("id-ID", optionsDate)})*\n` +
      `🟢 Pemasukan : ${formatRupiah(thisWeek.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(thisWeek.keluar)}\n` +
      `💰 Profit : ${formatRupiah(thisWeek.profit)}\n\n` +

      `🗓️ *HARI KEMARIN (${startYesterday.toLocaleDateString("id-ID", optionsDate)})*\n` +
      `🟢 Pemasukan : ${formatRupiah(yesterday.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(yesterday.keluar)}\n` +
      `💰 Profit : ${formatRupiah(yesterday.profit)}\n\n` +

      `🗓️ *HARI INI (${startToday.toLocaleDateString("id-ID", optionsDate)})*\n` +
      `🟢 Pemasukan : ${formatRupiah(today.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(today.keluar)}\n` +
      `💰 Profit : ${formatRupiah(today.profit)}`;

    return ctx.reply(text, { parse_mode: "Markdown" });
  },
};