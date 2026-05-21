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
        return ctx.reply("Harus memasukkan 8 angka sesuai urutan pecahan.");
      }

      const pecahan = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];

      let totalCash = 0;

      for (let i = 0; i < pecahan.length; i++) {
        totalCash += pecahan[i] * numbers[i];
      }

      // ambil saldo wallet/b2
      const walletBalance = await getWalletBalance();

      // selisih
      const difference = walletBalance - totalCash;

const hasil = `
<b>💸 CASH CHECK</b>

💵 100K × ${numbers[0]} = <code>${formatRp(100000 * numbers[0])}</code>
💴 50K × ${numbers[1]} = <code>${formatRp(50000 * numbers[1])}</code>
💶 20K × ${numbers[2]} = <code>${formatRp(20000 * numbers[2])}</code>
🧾 10K × ${numbers[3]} = <code>${formatRp(10000 * numbers[3])}</code>
📘 5K × ${numbers[4]} = <code>${formatRp(5000 * numbers[4])}</code>
📗 2K × ${numbers[5]} = <code>${formatRp(2000 * numbers[5])}</code>
📕 1K × ${numbers[6]} = <code>${formatRp(1000 * numbers[6])}</code>
🪙 500 × ${numbers[7]} = <code>${formatRp(500 * numbers[7])}</code>

━━━━━━━━━━━━━━

💰 Cash   : <code>${formatRp(totalCash)}</code>
🏦 Wallet : <code>${formatRp(walletBalance)}</code>
📊 Selisih: <code>${difference >= 0 ? "+" : "-"}${formatRp(Math.abs(difference))}</code>

${
  difference > 0
    ? "⚠️ Wallet lebih besar"
    : difference < 0
      ? "⚠️ Cash lebih besar"
      : "✅ Balance sesuai"
}
`.trim();

await ctx.reply(hasil, {
  parse_mode: "HTML",
});
    } catch (err) {
      console.error(err);
      await ctx.reply("Terjadi error saat menghitung uang.");
    }
  },
};
