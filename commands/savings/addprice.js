import { google } from "googleapis";

function toNumber(val) {
  return Number(String(val).replace(",", ".").trim());
}

const userState = new Map();

export default {
  name: "addprice",

  /* =========================
     /addprice
  ========================= */
  async execute(ctx) {
    const userId = ctx.from.id;
    userState.set(userId, { step: 1 });
    return ctx.reply("📦 Masukkan *Nama Barang*:", { parse_mode: "Markdown" });
  },

  /* =========================
     HANDLE TEXT
  ========================= */
  async handleText(ctx) {
    const userId = ctx.from.id;
    const state = userState.get(userId);
    if (!state) return;

    const text = ctx.message.text.trim();

    /* STEP 1 */
    if (state.step === 1) {
      state.namaBarang = text;
      state.step = 2;
      return ctx.reply("🔢 Masukkan *Jumlah*:");
    }

    /* STEP 2 */
    if (state.step === 2) {
      state.jumlah = toNumber(text);
      if (state.jumlah <= 0) return ctx.reply("❌ Jumlah tidak valid");
      state.step = 3;
      return ctx.reply("💰 Masukkan *Total Harga*:");
    }

    /* STEP 3 */
    if (state.step === 3) {
      state.totalHarga = toNumber(text);
      if (state.totalHarga <= 0) return ctx.reply("❌ Total harga tidak valid");
      state.step = 4;
      return ctx.reply("📦 Masukkan *Isi Dus*:");
    }

    /* STEP 4 → KONFIRMASI */
    if (state.step === 4) {
      state.isiDus = toNumber(text);
      if (state.isiDus <= 0) return ctx.reply("❌ Isi dus tidak valid");

      state.step = "confirm";

      return ctx.reply(
        `🧾 *Konfirmasi Data*\n\n` +
        `Nama   : ${state.namaBarang}\n` +
        `Jumlah : ${state.jumlah}\n` +
        `Total  : ${state.totalHarga}\n` +
        `IsiDus : ${state.isiDus}\n\n` +
        `Lanjutkan?`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Konfirmasi", callback_data: "addprice:yes" },
                { text: "❌ Batal", callback_data: "addprice:no" },
              ],
            ],
          },
        }
      );
    }
  },

  /* =========================
     HANDLE CALLBACK
  ========================= */
  async handleCallback(ctx) {
    const userId = ctx.from.id;
    const state = userState.get(userId);
    if (!state || state.step !== "confirm") return;

    if (ctx.callbackQuery.data === "addprice:no") {
      userState.delete(userId);
      await ctx.answerCallbackQuery();
      return ctx.editMessageText("❌ Proses dibatalkan");
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

        /* APPEND */
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

        /* AMBIL DATA TERBARU (TERMASUK RUMUS) */
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: "Sheet5!A:F",
        });

        const rows = res.data.values.filter(r => r[0]);
        const last = rows[rows.length - 1];

        userState.delete(userId);
        await ctx.answerCallbackQuery();

        return ctx.editMessageText(
          `✅ *Data berhasil disimpan*\n\n` +
          `Nama   : ${last[1]}\n` +
          `Jumlah : ${last[0]}\n` +
          `Total  : ${last[2]}\n` +
          `IsiDus : ${last[4]}\n` +
          `PerDus : ${last[3]}\n` +
          `Satuan : ${Number(last[5]).toFixed(3)}`,
          { parse_mode: "Markdown" }
        );

      } catch (err) {
        userState.delete(userId);
        await ctx.answerCallbackQuery();
        return ctx.editMessageText(`❌ Error: ${err.message}`);
      }
    }
  },
};
