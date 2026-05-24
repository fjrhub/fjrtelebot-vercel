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

// ✅ NEW: Format margin dengan koma desimal (id-ID) + simbol %
const formatMargin = (profit, masuk) => {
  if (!masuk || masuk <= 0) return "~0,00%";
  const margin = (profit / masuk) * 100;
  return `~${margin.toFixed(2).replace(".", ",")}%`;
};

// ✅ NEW: Emoji indikator margin
const getMarginEmoji = (profit, masuk) => {
  if (!masuk || masuk <= 0) return "";
  const margin = (profit / masuk) * 100;
  if (margin >= 4) return " ⚡"; // Margin tinggi
  if (margin >= 2.5) return " ✅"; // Normal
  if (margin < 0) return " ⚠️"; // Rugi
  return ""; // Margin tipis
};

function getWIBDate(date = new Date()) {
  const d = new Date(date);
  d.setHours(d.getHours() + 7);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

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

    const nowWIB = getWIBDate();
    const startToday = startOfDay(nowWIB);
    const endToday = endOfDay(nowWIB);

    const startYesterday = new Date(nowWIB);
    startYesterday.setDate(nowWIB.getDate() - 1);
    startYesterday.setHours(0, 0, 0, 0);
    const endYesterday = new Date(nowWIB);
    endYesterday.setDate(nowWIB.getDate() - 1);
    endYesterday.setHours(23, 59, 59, 999);

    const startThisWeek = startOfWeek(nowWIB);
    const startLastWeek = new Date(startThisWeek);
    startLastWeek.setDate(startThisWeek.getDate() - 7);
    const endLastWeek = new Date(startThisWeek);
    endLastWeek.setDate(startThisWeek.getDate() - 1);
    endLastWeek.setHours(23, 59, 59, 999);

    const startThisMonth = startOfMonth(nowWIB);
    const startLastMonth = new Date(nowWIB);
    startLastMonth.setMonth(nowWIB.getMonth() - 1);
    startLastMonth.setDate(1);
    startLastMonth.setHours(0, 0, 0, 0);
    const endLastMonth = endOfMonth(startLastMonth);

    const all = calculateProfit(rows, null, null);
    const today = calculateProfit(rows, startToday, endToday);
    const yesterday = calculateProfit(rows, startYesterday, endYesterday);
    const thisWeek = calculateProfit(rows, startThisWeek, null);
    const lastWeek = calculateProfit(rows, startLastWeek, endLastWeek);
    const thisMonth = calculateProfit(rows, startThisMonth, null);
    const lastMonth = calculateProfit(rows, startLastMonth, endLastMonth);

    const optionsMonth = { month: "long", year: "2-digit" };
    const optionsDate = { day: "numeric", month: "numeric", year: "2-digit" };

    // ✅ Helper untuk format satu blok periode
    const formatPeriod = (label, data, dateStr, showEmoji = true) => {
      const margin = formatMargin(data.profit, data.masuk);
      const emoji = showEmoji ? getMarginEmoji(data.profit, data.masuk) : "";
      return (
        `${label}${dateStr ? ` (${dateStr})` : ""}\n` +
        `🟢 Pemasukan : ${formatRupiah(data.masuk)}\n` +
        `🔴 Pengeluaran : ${formatRupiah(data.keluar)}\n` +
        `💰 Profit : ${formatRupiah(data.profit)}\n` +
        `📊 Margin : ${margin}${emoji}\n`
      );
    };

    const text =
      `📊 *RINGKASAN PROFIT USAHA PULSA*\n\n` +
      `🕒 *SEMUA WAKTU*\n` +
      `🟢 Pemasukan : ${formatRupiah(all.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(all.keluar)}\n` +
      `💰 Profit : ${formatRupiah(all.profit)}\n` +
      `📊 Margin : ${formatMargin(all.profit, all.masuk)}\n\n` +

      `📅 *BULAN LALU*\n` +
      formatPeriod("", lastMonth, startLastMonth.toLocaleDateString("id-ID", optionsMonth), false) + `\n` +

      `📅 *BULAN INI*\n` +
      formatPeriod("", thisMonth, nowWIB.toLocaleDateString("id-ID", optionsMonth), false) + `\n` +

      `📆 *MINGGU LALU*\n` +
      formatPeriod("", lastWeek, `${startLastWeek.toLocaleDateString("id-ID", optionsDate)} - ${endLastWeek.toLocaleDateString("id-ID", optionsDate)}`, false) + `\n` +

      `📆 *MINGGU INI*\n` +
      formatPeriod("", thisWeek, `${startThisWeek.toLocaleDateString("id-ID", optionsDate)} - ${nowWIB.toLocaleDateString("id-ID", optionsDate)}`, false) + `\n` +

      `🗓️ *HARI KEMARIN*\n` +
      formatPeriod("", yesterday, startYesterday.toLocaleDateString("id-ID", optionsDate)) + `\n` +

      `🗓️ *HARI INI*\n` +
      formatPeriod("", today, nowWIB.toLocaleDateString("id-ID", optionsDate));

    return ctx.reply(text, { parse_mode: "Markdown" });
  },
};
