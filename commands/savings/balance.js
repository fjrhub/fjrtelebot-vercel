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
const formatRp = (n) =>
  "Rp" + Math.round(n).toLocaleString("id-ID");

const formatUSDT = (n) =>
  Number(n).toFixed(2) + " USDT";

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
async function getAllAccounts() {
  const sheets = sheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!S2:U", // S=Account | T=Saldo | U=MataUang
  });

  return res.data.values || [];
}

/* =========================
   COMMAND
========================= */
export default {
  name: "balance",

  async execute(ctx) {
    const rows = await getAllAccounts();

    if (!rows.length) {
      return ctx.reply("Tidak ada data akun.");
    }

    let totalRp = 0;
    let totalUSDT = 0;

    const accountMessages = rows.map(([akun, rawSaldo, mataUang]) => {
      let saldo = Number(rawSaldo);

      // #N/A, kosong, invalid → 0
      if (!rawSaldo || isNaN(saldo)) saldo = 0;

      const currency = (mataUang || "Rp").toUpperCase();

      if (currency === "USDT") {
        totalUSDT += saldo;
        return `🧾 Account : ${akun}\n💰 Balance: ${formatUSDT(saldo)}`;
      }

      // default Rp
      totalRp += saldo;
      return `🧾 Account : ${akun}\n💰 Balance: ${formatRp(saldo)}`;
    });

    const message = `
📊 Account Balances

${accountMessages.join("\n\n")}

━━━━━━━━━━━━
🔢 Total IDR : ${formatRp(totalRp)}
🔢 Total USDT: ${formatUSDT(totalUSDT)}
📅 Last updated: ${getJakartaTime()}
`.trim();

    await ctx.reply(message);
  },
};
