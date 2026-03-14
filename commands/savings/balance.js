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
   COMMAND
========================= */
export default {
  name: "balance",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const text = ctx.message?.text || "";
    const isAll = text.includes("-a");

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

    await ctx.reply(message);
  },
};