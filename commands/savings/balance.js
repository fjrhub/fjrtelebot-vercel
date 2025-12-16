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

async function getAllSaldo() {
  const sheets = sheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!S2:T",
  });

  return res.data.values || [];
}

export default {
  name: "balance",
  async execute(ctx) {
    const rows = await getAllSaldo();

    if (!rows.length) {
      return ctx.reply("Tidak ada data saldo.");
    }

    const message = rows
      .map(([akun, saldo]) => `${akun}\t${Number(saldo).toLocaleString("id-ID")}`)
      .join("\n");

    await ctx.reply(message);
  },
};
