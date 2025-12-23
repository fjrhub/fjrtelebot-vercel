import { google } from "googleapis";

function toNumber(val) {
  return Number(String(val).replace(",", ".").trim());
}

const userState = new Map();

export default {
  name: "addprice",

  async execute(ctx) {
    const userId = ctx.from.id;
    userState.set(userId, { step: 1 });
    return ctx.reply("Masukkan nama barang:");
  },

  async handleText(ctx) {
    const userId = ctx.from.id;
    const state = userState.get(userId);
    if (!state) return;

    const text = ctx.message.text.trim();

    if (state.step === 1) {
      state.namaBarang = text;
      state.step = 2;
      return ctx.reply("Masukkan jumlah:");
    }

    if (state.step === 2) {
      state.jumlah = toNumber(text);
      if (state.jumlah <= 0) return ctx.reply("Jumlah tidak valid");
      state.step = 3;
      return ctx.reply("Masukkan total harga:");
    }

    if (state.step === 3) {
      state.totalHarga = toNumber(text);
      if (state.totalHarga <= 0) return ctx.reply("Total harga tidak valid");
      state.step = 4;
      return ctx.reply("Masukkan isi dus:");
    }

    if (state.step === 4) {
      state.isiDus = toNumber(text);
      if (state.isiDus <= 0) return ctx.reply("Isi dus tidak valid");

      state.step = "confirm";

      return ctx.reply(
        `Konfirmasi data:\n\n` +
        `Nama barang : ${state.namaBarang}\n` +
        `Jumlah      : ${state.jumlah}\n` +
        `Total harga : ${state.totalHarga}\n` +
        `Isi dus     : ${state.isiDus}\n\n` +
        `Lanjutkan?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Konfirmasi", callback_data: "addprice:yes" },
                { text: "Batal", callback_data: "addprice:no" },
              ],
            ],
          },
        }
      );
    }
  },

  async handleCallback(ctx) {
    const userId = ctx.from.id;
    const state = userState.get(userId);
    if (!state || state.step !== "confirm") return;

    if (ctx.callbackQuery.data === "addprice:no") {
      userState.delete(userId);
      await ctx.answerCallbackQuery();
      return ctx.editMessageText("Proses dibatalkan");
    }

    if (ctx.callbackQuery.data === "addprice:yes") {
      try {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            type: "service_account",
            project_id: process.env.GOOGLE_PROJECT_ID,
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
          },
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: "Sheet5!A:F",
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[
              state.jumlah,
              state.namaBarang,
              state.totalHarga,
              "",
              state.isiDus,
              ""
            ]],
          },
        });

        userState.delete(userId);
        await ctx.answerCallbackQuery();

        return ctx.editMessageText(
          "Data berhasil ditambahkan"
        );

      } catch (err) {
        userState.delete(userId);
        await ctx.answerCallbackQuery();
        return ctx.editMessageText(`Error: ${err.message}`);
      }
    }
  },
};
