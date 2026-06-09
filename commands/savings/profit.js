import { google } from "googleapis";
import { InputFile } from "grammy"; // ✅ Tambahkan import InputFile dari grammy

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

const formatMargin = (profit, masuk) => {
  if (!masuk || masuk <= 0) return "0,00%";
  const margin = (profit / masuk) * 100;
  return `${margin.toFixed(2).replace(".", ",")}%`;
};

const getMarginEmoji = (profit, masuk) => {
  if (!masuk || masuk <= 0) return "";
  const margin = (profit / masuk) * 100;
  if (margin >= 4) return " ⚡";
  if (margin >= 2.5) return " ✅";
  if (margin < 0) return " ⚠️";
  return "";
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

    if (isNaN(createdAt.getTime())) return;
    
    if (kategori !== "Usaha" || subKategori !== "Penjualan") return;
    if (startDate && createdAt < startDate) return;
    if (endDate && createdAt > endDate) return;

    if (jenis === "Pemasukan") masuk += jumlah;
    if (jenis === "Pengeluaran") keluar += jumlah;
  });

  return { masuk, keluar, profit: masuk - keluar };
}

function generatePeriods(nowWIB, earliestDate) {
  const months = [];
  const weeks = [];
  const days = [];
  const optionsMonth = { month: "long", year: "2-digit" };
  const optionsDate = { day: "numeric", month: "numeric", year: "2-digit" };

  // Months
  let currentMonthStart = startOfMonth(earliestDate);
  const finalMonthStart = startOfMonth(nowWIB);
  while (currentMonthStart <= finalMonthStart) {
    const monthEnd = endOfMonth(currentMonthStart);
    months.push({
      label: currentMonthStart.toLocaleDateString("id-ID", optionsMonth),
      start: new Date(currentMonthStart),
      end: monthEnd > nowWIB ? new Date(nowWIB) : new Date(monthEnd)
    });
    currentMonthStart.setMonth(currentMonthStart.getMonth() + 1);
  }

  // Weeks
  let currentWeekStart = startOfWeek(earliestDate);
  const finalWeekStart = startOfWeek(nowWIB);
  while (currentWeekStart <= finalWeekStart) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    weeks.push({
      label: `${currentWeekStart.toLocaleDateString("id-ID", optionsDate)} - ${weekEnd.toLocaleDateString("id-ID", optionsDate)}`,
      start: new Date(currentWeekStart),
      end: weekEnd > nowWIB ? new Date(nowWIB) : new Date(weekEnd)
    });
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  // Days
  let currentDay = startOfDay(earliestDate);
  const finalDay = startOfDay(nowWIB);
  while (currentDay <= finalDay) {
    days.push({
      label: currentDay.toLocaleDateString("id-ID", optionsDate),
      start: new Date(currentDay),
      end: endOfDay(currentDay) > nowWIB ? new Date(nowWIB) : endOfDay(currentDay)
    });
    currentDay.setDate(currentDay.getDate() + 1);
  }

  return { months, weeks, days };
}

/* =========================
   COMMAND
========================= */
export default {
  name: "profit",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const rows = await fetchTransactions();
    if (!rows.length) return ctx.reply("📭 Belum ada data transaksi.");

    const args = ctx.message?.text?.split(" ") || [];
    const isAll = args.includes("-a");

    const relevantRows = rows.filter(r => r[1] === "Usaha" && r[2] === "Penjualan");
    let allTimeDateRange = "";
    let earliestDate = new Date();
    
    if (relevantRows.length > 0) {
      const dates = relevantRows
        .map(r => new Date(r[12]))
        .filter(d => !isNaN(d.getTime()));
      
      if (dates.length > 0) {
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        const opts = { day: "numeric", month: "numeric", year: "2-digit" };
        allTimeDateRange = ` (${minDate.toLocaleDateString("id-ID", opts)} - ${maxDate.toLocaleDateString("id-ID", opts)})`;
        earliestDate = minDate;
      }
    }

    const nowWIB = getWIBDate();

    // ✅ LOGIKA UNTUK /profit -a (Kirim sebagai .txt)
    if (isAll) {
      const periods = generatePeriods(nowWIB, earliestDate);
      let txt = `📊 RINGKASAN PROFIT USAHA PULSA (SEMUA WAKTU)\n`;
      txt += `🕒 Rentang:${allTimeDateRange}\n\n`;

      txt += "=== 📅 BULAN ===\n";
      periods.months.forEach(p => {
        const data = calculateProfit(rows, p.start, p.end);
        const margin = formatMargin(data.profit, data.masuk);
        const emoji = getMarginEmoji(data.profit, data.masuk);
        txt += `[${p.label}]\n`;
        txt += `🟢 Pemasukan : ${formatRupiah(data.masuk)}\n`;
        txt += `🔴 Pengeluaran : ${formatRupiah(data.keluar)}\n`;
        txt += `💰 Profit : ${formatRupiah(data.profit)} | ~${margin}${emoji}\n\n`;
      });

      txt += "\n=== 📆 MINGGU ===\n";
      periods.weeks.forEach(p => {
        const data = calculateProfit(rows, p.start, p.end);
        const margin = formatMargin(data.profit, data.masuk);
        const emoji = getMarginEmoji(data.profit, data.masuk);
        txt += `[${p.label}]\n`;
        txt += `🟢 Pemasukan : ${formatRupiah(data.masuk)}\n`;
        txt += `🔴 Pengeluaran : ${formatRupiah(data.keluar)}\n`;
        txt += `💰 Profit : ${formatRupiah(data.profit)} | ~${margin}${emoji}\n\n`;
      });

      txt += "\n=== 🗓️ HARI ===\n";
      periods.days.forEach(p => {
        const data = calculateProfit(rows, p.start, p.end);
        const margin = formatMargin(data.profit, data.masuk);
        const emoji = getMarginEmoji(data.profit, data.masuk);
        txt += `[${p.label}]\n`;
        txt += `🟢 Pemasukan : ${formatRupiah(data.masuk)}\n`;
        txt += `🔴 Pengeluaran : ${formatRupiah(data.keluar)}\n`;
        txt += `💰 Profit : ${formatRupiah(data.profit)} | ~${margin}${emoji}\n\n`;
      });

      // ✅ Kirim sebagai file .txt menggunakan InputFile dari GrammmY
      const buffer = Buffer.from(txt, "utf-8");
      return await ctx.replyWithDocument(new InputFile(buffer, "profit-all.txt"));
    }

    // ✅ LOGIKA NORMAL /profit
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

    const formatPeriod = (label, dateStr, data, showEmoji = true) => {
      const margin = formatMargin(data.profit, data.masuk);
      const emoji = showEmoji ? getMarginEmoji(data.profit, data.masuk) : "";
      return (
        `${label} (${dateStr})\n` +
        `🟢 Pemasukan : ${formatRupiah(data.masuk)}\n` +
        `🔴 Pengeluaran : ${formatRupiah(data.keluar)}\n` +
        `💰 Profit : ${formatRupiah(data.profit)} | ~${margin}${emoji}\n`
      );
    };

    const text =
      `📊 *RINGKASAN PROFIT USAHA PULSA*\n\n` +
      `🕒 SEMUA WAKTU${allTimeDateRange}\n` +
      `🟢 Pemasukan : ${formatRupiah(all.masuk)}\n` +
      `🔴 Pengeluaran : ${formatRupiah(all.keluar)}\n` +
      `💰 Profit : ${formatRupiah(all.profit)} | ~${formatMargin(all.profit, all.masuk)}\n\n` +

      formatPeriod("📅 BULAN LALU", startLastMonth.toLocaleDateString("id-ID", optionsMonth), lastMonth, false) + `\n` +
      formatPeriod("📅 BULAN INI", nowWIB.toLocaleDateString("id-ID", optionsMonth), thisMonth, false) + `\n` +
      formatPeriod("📆 MINGGU LALU", `${startLastWeek.toLocaleDateString("id-ID", optionsDate)} - ${endLastWeek.toLocaleDateString("id-ID", optionsDate)}`, lastWeek, false) + `\n` +
      formatPeriod("📆 MINGGU INI", `${startThisWeek.toLocaleDateString("id-ID", optionsDate)} - ${nowWIB.toLocaleDateString("id-ID", optionsDate)}`, thisWeek, false) + `\n` +
      formatPeriod("🗓️ HARI KEMARIN", startYesterday.toLocaleDateString("id-ID", optionsDate), yesterday) + `\n` +
      formatPeriod("🗓️ HARI INI", nowWIB.toLocaleDateString("id-ID", optionsDate), today);

    return ctx.reply(text, { parse_mode: "Markdown" });
  },
};
