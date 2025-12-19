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
const formatIDR = (n) =>
  "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));

function getJakartaTime() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
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
async function getAllSaldo() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!S2:T", // S = Akun, T = Saldo
  });

  return res.data.values || [];
}

/* =========================
   COMMAND
========================= */
export default {
  name: "balance",

  async execute(ctx) {
    const rows = await getAllSaldo();

    if (!rows.length) {
      return ctx.reply("❌ Tidak ada data saldo.");
    }

    let total = 0;

    const akunList = rows
      .map(([akun, rawSaldo]) => {
        const saldo = Number(rawSaldo);
        if (!akun || isNaN(saldo)) return null;

        total += saldo;

        return `🏦 ${akun}\n💰 ${formatIDR(saldo)}`;
      })
      .filter(Boolean);

    const message = `
📊 *Saldo Per Akun*

${akunList.join("\n\n")}

━━━━━━━━━━━━
💼 *Total:* ${formatIDR(total)}
📅 *Last update:* ${getJakartaTime()}
`.trim();

    await ctx.reply(message, { parse_mode: "Markdown" });
  },
};
