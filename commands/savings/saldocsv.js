import { google } from "googleapis";
import { InputFile } from "grammy";

/* =========================
   CONFIG
========================= */
const TARGET_ACCOUNTS = ["Wallet", "Seabank", "Dana", "Bank", "Fjlsaldo", "Gopay"];

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
const getDateString = (iso) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
};

/* =========================
   CORE LOGIC
========================= */
function processDailyData(rows) {
  const dailyMap = new Map();

  rows.forEach((r) => {
    const dateStr = getDateString(r[12]); 
    if (!dateStr) return;

    const timestamp = new Date(r[12]).getTime();
    const akun = r[6]; 
    const saldoSesudah = Number(r[9]) || 0; 

    if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, {});
    const dateData = dailyMap.get(dateStr);

    if (!dateData[akun] || timestamp > dateData[akun].timestamp) {
      dateData[akun] = { timestamp, saldoSesudah };
    }
  });

  const allDates = Array.from(dailyMap.keys()).sort();
  if (allDates.length === 0) return [];

  const minDate = allDates[0];
  const maxDate = allDates[allDates.length - 1];

  const continuousDates = [];
  let current = new Date(minDate);
  const end = new Date(maxDate);
  while (current <= end) {
    continuousDates.push(current.toISOString().split("T")[0]);
    current = new Date(current.getTime() + 86400000); 
  }

  const accountBalances = {};
  TARGET_ACCOUNTS.forEach((acc) => (accountBalances[acc] = 0));

  const results = [];
  for (const dateStr of continuousDates) {
    const dateData = dailyMap.get(dateStr) || {};
    const dayResult = { date: dateStr, accounts: {}, total: 0 };

    TARGET_ACCOUNTS.forEach((acc) => {
      if (dateData[acc]) {
        accountBalances[acc] = dateData[acc].saldoSesudah;
      }
      dayResult.accounts[acc] = accountBalances[acc];
      dayResult.total += accountBalances[acc];
    });

    results.push(dayResult);
  }

  return results;
}

/* =========================
   GENERATE CSV
========================= */
function generateCSV(rows) {
  const dailyResults = processDailyData(rows);
  if (!dailyResults.length) return "Date,Total\n";

  let csv = "Date,Total\n";
  dailyResults.forEach((day) => {
    csv += `${day.date},${day.total}\n`;
  });

  return csv;
}

/* =========================
   COMMAND
========================= */
export default {
  name: "saldo_csv", // Nama command baru untuk CSV

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    try {
      await ctx.reply("⏳ Generating CSV file...");
      const rows = await fetchTransactions();

      if (!rows.length) return ctx.reply("📭 Belum ada transaksi.");

      const csv = generateCSV(rows);
      const buffer = Buffer.from(csv, "utf-8");
      const filename = `saldo_total_${Date.now()}.csv`;

      await ctx.replyWithDocument(new InputFile(buffer, filename), {
        caption: `📊 Total Saldo Harian\nUrutan: Terlama → Terbaru\nFormat siap import ke Chart/Excel`,
      });
    } catch (error) {
      console.error("Error generating CSV file:", error);
      await ctx.reply("❌ Gagal generate file CSV.");
    }
  },
};