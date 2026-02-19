import { google } from "googleapis";

function toNumber(val) {
  return Number(String(val).replace(",", ".").trim());
}

const userState = new Map();

export default {
  name: "addprice",

  // ======================
  // COMMAND /addprice
  // ======================
  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;
    const userId = ctx.from.id;

    const msg = await ctx.reply("📝 Masukkan nama barang:");

    userState.set(userId, {
      step: 1,
      botMessageId: msg.message_id,
    });
  },

  // ======================
  // HANDLE TEXT INPUT
  // ======================
  async handleText(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;
    const userId = ctx.from.id;
    const state = userState.get(userId);
    if (!state) return;

    const text = ctx.message.text.trim();

    // hapus pesan user agar tidak spam
    try {
      await ctx.deleteMessage();
    } catch {}

    // STEP 1 — Nama Barang
    if (state.step === 1) {
      state.namaBarang = text;
      state.step = 2;

      return ctx.api.editMessageText(
        ctx.chat.id,
        state.botMessageId,
        "📊 Masukkan jumlah:",
      );
    }

    // STEP 2 — Jumlah
    if (state.step === 2) {
      state.jumlah = toNumber(text);
      if (state.jumlah <= 0) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          state.botMessageId,
          "❌ Jumlah tidak valid\n\n📊 Masukkan jumlah:",
        );
      }

      state.step = 3;
      return ctx.api.editMessageText(
        ctx.chat.id,
        state.botMessageId,
        "💰 Masukkan total harga:",
      );
    }

    // STEP 3 — Total Harga
    if (state.step === 3) {
      state.totalHarga = toNumber(text);
      if (state.totalHarga <= 0) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          state.botMessageId,
          "❌ Total harga tidak valid\n\n💰 Masukkan total harga:",
        );
      }

      state.step = 4;
      return ctx.api.editMessageText(
        ctx.chat.id,
        state.botMessageId,
        "📦 Masukkan isi dus:",
      );
    }

    // STEP 4 — Isi Dus
    if (state.step === 4) {
      state.isiDus = toNumber(text);
      if (state.isiDus <= 0) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          state.botMessageId,
          "❌ Isi dus tidak valid\n\n📦 Masukkan isi dus:",
        );
      }

      state.step = "confirm";

      return ctx.api.editMessageText(
        ctx.chat.id,
        state.botMessageId,
        `🧾 *Konfirmasi Data*

📦 Nama Barang: ${state.namaBarang}
📊 Jumlah: ${state.jumlah}
💰 Total Harga: ${state.totalHarga}
📦 Isi Dus: ${state.isiDus}

Lanjutkan?`,
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
        },
      );
    }
  },

  // ======================
  // HANDLE CALLBACK
  // ======================
  async handleCallback(ctx) {
    const userId = ctx.from.id;
    const state = userState.get(userId);
    if (!state || state.step !== "confirm") return;

    await ctx.answerCallbackQuery();

    // BATAL
    if (ctx.callbackQuery.data === "addprice:no") {
      userState.delete(userId);
      return ctx.editMessageText("❌ Proses dibatalkan");
    }

    // KONFIRMASI
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
            values: [
              [
                state.jumlah,
                state.namaBarang,
                state.totalHarga,
                "",
                state.isiDus,
                "",
              ],
            ],
          },
        });

        userState.delete(userId);
        return ctx.editMessageText("✅ Data berhasil ditambahkan");
      } catch (err) {
        userState.delete(userId);
        return ctx.editMessageText(`❌ Error: ${err.message}`);
      }
    }
  },
};
