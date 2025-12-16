import { google } from "googleapis";

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

async function getLastNonZeroSaldo() {
  const sheets = sheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!S2:T",
  });

  const rows = res.data.values || [];

  // scan dari bawah → cari saldo terakhir yang > 0
  for (let i = rows.length - 1; i >= 0; i--) {
    const akun = rows[i][0];
    const saldo = Number(rows[i][1]) || 0;

    if (saldo > 0) {
      return { akun, saldo };
    }
  }

  return { akun: "-", saldo: 0 };
}

export default {
  name: "balance",
  async execute(ctx) {
    const { akun, saldo } = await getLastNonZeroSaldo();

    await ctx.reply(
      `Saldo terakhir:\n${akun}: ${saldo.toLocaleString("id-ID")}`
    );
  },
};
