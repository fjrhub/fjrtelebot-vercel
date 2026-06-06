import { google } from "googleapis";

/* =========================
   GOOGLE SHEETS CLIENT
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

/* =========================
   UTIL
========================= */
const formatRp = (n) => "Rp" + Math.round(n).toLocaleString("id-ID");

function parseRp(value) {
  if (!value) return 0;
  const cleaned = String(value)
    .replace(/[^0-9,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

function getJakartaDate() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function getJakartaTime() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}.${min} WIB`;
}

/* =========================
   DATA
========================= */
async function getAccountsNormal() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet2!A2:B",
  });
  return res.data.values || [];
}

async function getAccountsFormatted() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet2!E2:F",
  });
  return res.data.values || [];
}

/* =========================
   CATEGORY LOGIC
========================= */
function categorizeAccount(accountName) {
  const name = accountName.toLowerCase().trim();

  // 🪙 BTC/Bitcoin → Hold (long-term investment)
  if (/\b(btc|bitcoin)\b/.test(name) && !/\busdt\b/.test(name)) {
    return "hold";
  }

  // 🎮 USDT → Trading (BTCUSDT spot only)
  if (/\busdt\b/.test(name)) {
    return "trading";
  }

  // 💧 Others → Liquid
  return "liquid";
}

/* =========================
   COMMAND
========================= */
export default {
  name: "balance",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const text = ctx.message?.text || "";
    const isAll = text.includes("-a");
    const isGoals = text.includes("-goals");

    // ── DEFAULT: List accounts (original behavior) ──
    if (!isGoals) {
      const rows = isAll
        ? await getAccountsFormatted()
        : await getAccountsNormal();

      if (!rows.length) {
        return ctx.reply("Tidak ada data akun.");
      }

      let totalRp = 0;

      const accountMessages = rows.map(([akun, rawSaldo]) => {
        let saldo;
        if (isAll) {
          saldo = parseRp(rawSaldo);
        } else {
          saldo = Number(rawSaldo);
          if (!rawSaldo || isNaN(saldo)) saldo = 0;
        }
        totalRp += saldo;
        return `🧾 Account : ${akun}\n💰 Balance: ${formatRp(saldo)}`;
      });

      const message = `
📊 Account Balances

${accountMessages.join("\n\n")}

━━━━━━━━━━━━
🔢 Total : ${formatRp(totalRp)}
📅 Last updated: ${getJakartaTime()}
`.trim();

      return ctx.reply(message);
    }

    // ── GOALS MODE: Summary view ──
    const TARGET = 10_000_000;
    const TRADING_RISK_PERCENT = 0.01;

    // Fetch both ranges to ensure we capture USDT/BTC even if formatted differently
    const [rowsNormal, rowsFormatted] = await Promise.all([
      getAccountsNormal(),
      getAccountsFormatted(),
    ]);

    // Merge & dedupe by account name (prefer formatted if exists)
    const accountMap = new Map();
    [...rowsNormal, ...rowsFormatted].forEach(([akun, rawSaldo]) => {
      if (!akun) return;
      const key = akun.toLowerCase().trim();
      // Prefer formatted value if available and parseable
      if (!accountMap.has(key) || rawSaldo?.includes("Rp")) {
        accountMap.set(key, [akun, rawSaldo]);
      }
    });

    let liquid = 0;
    let trading = 0;
    let hold = 0;

    for (const [akun, rawSaldo] of accountMap.values()) {
      let saldo;
      if (rawSaldo?.includes("Rp")) {
        saldo = parseRp(rawSaldo);
      } else {
        saldo = Number(rawSaldo);
        if (!rawSaldo || isNaN(saldo)) saldo = 0;
      }

      const category = categorizeAccount(akun);
      if (category === "hold") hold += saldo;
      else if (category === "trading") trading += saldo;
      else liquid += saldo;
    }

    const total = liquid + trading + hold;
    const remaining = Math.max(0, TARGET - total);
    const riskAmount = Math.round(trading * TRADING_RISK_PERCENT);

    const totalIcon = total >= TARGET ? "✅" : "▲";
    const liquidIcon = "🔄";
    const holdIcon = "▬";

    // Progress calculation
    const progressPercent = Math.min(100, (total / TARGET) * 100);
    const progressStr = progressPercent.toFixed(1) + '%';
    const filledBlocks = Math.min(10, Math.round(progressPercent / 10));
    const progressBar = '▰'.repeat(filledBlocks) + '▱'.repeat(10 - filledBlocks);

    const message = `
🎯 10 JUTA PERTAMA
Progress: ${progressBar} ${progressStr}
Total: ${formatRp(total)} ${totalIcon}
├─ 💧 Liquid: ${formatRp(liquid)} ${liquidIcon}
├─ 🎮 Trading: ${formatRp(trading)} (Risk: ${formatRp(riskAmount)})
└─ 🪙 BTC Hold: ${formatRp(hold)} ${holdIcon}

📅 ${getJakartaDate()} | Sisa: ${formatRp(remaining)}
`.trim();

    await ctx.reply(message);
  },
};
