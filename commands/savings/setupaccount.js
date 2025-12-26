import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */
const OPTIONS = {
  akun: ["Wallet", "Dana", "Seabank", "Bank", "Binance", "Fjlsaldo", "Gopay"],
  mataUang: ["Rp", "USDT"],
};

/* =========================
   STATE
========================= */
const states = new Map();

/* =========================
   GOOGLE SHEETS
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
   FETCH DATA
========================= */
async function fetchAllRows() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:J",
  });

  const rows = res.data.values || [];
  return rows.map((r) => ({
    jenis: r[0],
    akun: r[6],
  }));
}

function hasOpeningBalance(rows, akun) {
  return rows.some((r) => r.jenis === "Opening Balance" && r.akun === akun);
}

/* =========================
   APPEND DATA
========================= */
async function appendOpeningBalance(data) {
  const sheets = sheetsClient();
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A:O",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          "Initial",
          "Setup",
          "Balance",
          "Initial balance",
          data.jumlah,
          data.mataUang,
          data.akun,
          "System",
          0,
          data.jumlah,
          "#initial",
          "Initial balance",
          now,
          now,
        ],
      ],
    },
  });
}

/* =========================
   KEYBOARD
========================= */
const kbList = (list, prefix) => ({
  inline_keyboard: [
    ...list.map((v) => [{ text: v, callback_data: `${prefix}:${v}` }]),
    [{ text: "❌ Cancel", callback_data: "setupaccount:cancel" }],
  ],
});

/* =========================
   COMMAND
========================= */
export default {
  name: "setupaccount",

  async execute(ctx) {
    const rows = await fetchAllRows();

    const msg = await ctx.reply(
      "🛠 *Setup Account*\n\nPilih akun untuk mengisi saldo awal:",
      {
        parse_mode: "Markdown",
        reply_markup: kbList(OPTIONS.akun, "setupaccount:akun"),
      }
    );

    states.set(ctx.from.id, {
      step: "akun",
      rows,
      chatId: ctx.chat.id,
      messageId: msg.message_id,
      akun: null,
      jumlah: null,
      mataUang: null,
    });
  },

  async handleCallback(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    const data = ctx.callbackQuery.data;
    const edit = (text, kb = null) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });

    if (data === "setupaccount:cancel") {
      states.delete(ctx.from.id);
      await ctx.answerCallbackQuery();
      return edit("❌ Setup akun dibatalkan.");
    }

    if (data === "setupaccount:save") {
      await appendOpeningBalance(state);
      states.delete(ctx.from.id);
      await ctx.answerCallbackQuery();

      return edit("✅ *Saldo awal berhasil disimpan!*");
    }

    const [, step, value] = data.split(":");

    if (step === "akun") {
      if (hasOpeningBalance(state.rows, value)) {
        return ctx.answerCallbackQuery({
          text: "Akun ini sudah memiliki saldo awal.",
          show_alert: true,
        });
      }

      state.akun = value;
      state.step = "jumlah";
      await ctx.answerCallbackQuery();

      return edit(
        `Masukkan *saldo awal* untuk akun *${value}*:\n\nContoh: 100000`
      );
    }

    if (step === "mataUang") {
      state.mataUang = value;
      state.step = "confirm";
      await ctx.answerCallbackQuery();

      return edit(
        `🔎 *Konfirmasi*\n
Akun       : *${state.akun}*
Saldo Awal : *${state.jumlah} ${state.mataUang}*

Lanjutkan?`,
        {
          inline_keyboard: [
            [{ text: "✅ Simpan", callback_data: "setupaccount:save" }],
            [{ text: "❌ Cancel", callback_data: "setupaccount:cancel" }],
          ],
        }
      );
    }
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state || state.step !== "jumlah") return;

    await ctx.deleteMessage().catch(() => {});
    const jumlah = Number(ctx.message.text.replace(/[^\d]/g, ""));
    if (!jumlah || jumlah <= 0) {
      return ctx.reply("❌ Jumlah tidak valid.");
    }

    state.jumlah = jumlah;
    state.step = "mataUang";

    return ctx.api.editMessageText(
      state.chatId,
      state.messageId,
      "Pilih mata uang:",
      { reply_markup: kbList(OPTIONS.mataUang, "setupaccount:mataUang") }
    );
  },
};
