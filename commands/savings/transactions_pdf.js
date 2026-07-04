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
const formatNumber = (n) => new Intl.NumberFormat("id-ID").format(Number(n) || 0);

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

const getDateString = (iso) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
};

/* =========================
   CORE LOGIC (Shared by TXT & CSV)
========================= */
function processDailyData(rows) {
  const dailyMap = new Map();

  // 1. Group latest transaction per account per day
  rows.forEach((r) => {
    const dateStr = getDateString(r[12]); // index 12 = Dibuat pada
    if (!dateStr) return;

    const timestamp = new Date(r[12]).getTime();
    const akun = r[6]; // index 6 = Akun
    const saldoSesudah = Number(r[9]) || 0; // index 9 = Saldo Setelah

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

  // 2. Generate continuous dates (Fill Gaps)
  const continuousDates = [];
  let current = new Date(minDate);
  const end = new Date(maxDate);
  while (current <= end) {
    continuousDates.push(current.toISOString().split("T")[0]);
    current = new Date(current.getTime() + 86400000); // +1 day
  }

  // 3. Carry Forward Logic
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
      // If no transaction today, keep previous balance (automatic carry forward)
      dayResult.accounts[acc] = accountBalances[acc];
      dayResult.total += accountBalances[acc];
    });

    results.push(dayResult);
  }

  return results;
}

/* =========================
   GENERATE TXT
========================= */
function generateTxt(rows) {
  const dailyResults = processDailyData(rows);
  if (!dailyResults.length) return "📭 Belum ada data.";

  // Reverse for newest-first display
  dailyResults.reverse();

  let txt = "📊 SALDO HARIAN PER AKUN\n";
  txt += `Total Hari: ${dailyResults.length}\n`;
  txt += `Generated: ${formatDate(new Date().toISOString())}\n`;
  txt += "═".repeat(40) + "\n\n";

  dailyResults.forEach((day) => {
    txt += `📅 ${day.date}\n`;
    TARGET_ACCOUNTS.forEach((acc) => {
      txt += `${acc}: Rp${formatNumber(day.accounts[acc])}\n`;
    });
    txt += "─".repeat(40) + "\n";
    txt += `💰 TOTAL: Rp${formatNumber(day.total)}\n`;
    txt += "═".repeat(40) + "\n\n";
  });

  return txt;
}

/* =========================
   GENERATE CSV (Date & Total Only)
========================= */
function generateCSV(rows) {
  const dailyResults = processDailyData(rows);
  if (!dailyResults.length) return "Date,Total\n";

  let csv = "Date,Total\n";
  // Keep ascending order (Jan → Now) for chart import
  dailyResults.forEach((day) => {
    csv += `${day.date},${day.total}\n`;
  });

  return csv;
}

/* =========================
   COMMAND
========================= */
export default {
  name: "transactions_pdf",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    try {
      const args = ctx.message.text.split(" ");
      const isCSV = args[1]?.toLowerCase() === "-csv";

      await ctx.reply("⏳ Generating file...");
      const rows = await fetchTransactions();

      if (!rows.length) return ctx.reply("📭 Belum ada transaksi.");

      if (isCSV) {
        const csv = generateCSV(rows);
        const buffer = Buffer.from(csv, "utf-8");
        const filename = `saldo_total_${Date.now()}.csv`;

        await ctx.replyWithDocument(new InputFile(buffer, filename), {
          caption: `📊 Total Saldo Harian\nUrutan: Terlama → Terbaru\nFormat siap import ke Chart/Excel`,
        });
      } else {
        const txt = generateTxt(rows);
        const buffer = Buffer.from(txt, "utf-8");
        const filename = `saldo_harian_${Date.now()}.txt`;

        await ctx.replyWithDocument(new InputFile(buffer, filename), {
          caption: `📊 Saldo Harian Detail\nFormat: Text Report`,
        });
      }
    } catch (error) {
      console.error("Error generating file:", error);
      await ctx.reply("❌ Gagal generate file.");
    }
  },
};