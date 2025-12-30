import { google } from "googleapis";

function toNumber(value) {
  if (!value) return 0;
  return parseFloat(String(value).replace(",", "."));
}

async function formatSheetData() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID,
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = process.env.SPREADSHEET_ID;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet5!A2:H999",
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      return "Tidak ada data.";
    }

    const output = rows
      .map((row) => {
        const nama = row[1] || "-";
        const perdus = row[3] || "0";
        const satuanValue = toNumber(row[5]);

        return `${nama}
PER DUS : ${perdus}K
SATUAN : ${satuanValue.toFixed(3)}
`;
      })
      .join("\n");

    return output;

  } catch (err) {
    return `Error: ${err.message}`;
  }
}

export default {
  name: "pricelist",
  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;
    const data = await formatSheetData();

    // pastikan tidak melebihi limit Telegram 4096 char
    if (data.length > 4096) {
      // pecah pesan
      const chunks = data.match(/[\s\S]{1,3500}/g);
      for (const c of chunks) {
        await ctx.reply(c);
      }
      return;
    }

    await ctx.reply(data);
  },
};
