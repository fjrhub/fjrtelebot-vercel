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
function formatRp(n) {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

/* =========================
   GET WALLET/B2 BALANCE
========================= */
async function getWalletBalance() {
  const sheets = sheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet2!A2:B",
  });

  const rows = res.data.values || [];

  let total = 0;

  for (const [account, balance] of rows) {
    if (!account) continue;

    const name = account.toLowerCase().trim();

    // hanya ambil Wallet atau B2
    if (name === "wallet" || name === "b2") {
      const saldo = Number(balance);

      if (!isNaN(saldo)) {
        total += saldo;
      }
    }
  }

  return total;
}

/* =========================
   COMMAND
========================= */
export default {
  name: "cashc",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    try {
      const text = ctx.message.text.replace("/cashc", "").trim();

      if (!text) {
        return ctx.reply(
          `Masukkan jumlah lembar uang untuk setiap pecahan:

Format:
/cashc 4 2 1 5 7 1 1 2`,
        );
      }

      const numbers = text
        .split(/[\s,]+/)
        .map((v) => Number(v))
        .filter((v) => !isNaN(v));

      if (numbers.length !== 8) {
        return ctx.reply(
          "Harus memasukkan 8 angka sesuai urutan pecahan.",
        );
      }

      const pecahan = [
        100000,
        50000,
        20000,
        10000,
        5000,
        2000,
        1000,
        500,
      ];

      let totalCash = 0;

      for (let i = 0; i < pecahan.length; i++) {
        totalCash += pecahan[i] * numbers[i];
      }

      // ambil saldo wallet/b2
      const walletBalance = await getWalletBalance();

      // selisih
      const difference = walletBalance - totalCash;

      const hasil = `
💵 Cash Counter

100.000 : ${numbers[0]}
50.000  : ${numbers[1]}
20.000  : ${numbers[2]}
10.000  : ${numbers[3]}
5.000   : ${numbers[4]}
2.000   : ${numbers[5]}
1.000   : ${numbers[6]}
500     : ${numbers[7]}

━━━━━━━━━━━━━━━━━━
💰 Cash      : ${formatRp(totalCash)}
🏦 Wallet    : ${formatRp(walletBalance)}
📊 Selisih   : ${formatRp(difference)}
`.trim();

      await ctx.reply(hasil);
    } catch (err) {
      console.error(err);
      await ctx.reply("Terjadi error saat menghitung uang.");
    }
  },
};