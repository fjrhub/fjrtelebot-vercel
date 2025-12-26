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
   UTIL
========================= */
const toNumber = (v) =>
  Number(String(v).replace(/\./g, "").replace(",", "."));

const formatNumber = (n) =>
  new Intl.NumberFormat("id-ID").format(n);

const formatAmount = (amount, currency) => {
  if (currency === "Rp") return `Rp${formatNumber(amount)}`;
  return `${amount} ${currency}`;
};

const kbList = (list, prefix) => ({
  inline_keyboard: list.map((v) => [
    { text: v, callback_data: `${prefix}:${v}` },
  ]),
});

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

async function fetchAllRows() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:J",
  });
  return res.data.values || [];
}

function hasInitialBalance(rows, akun) {
  return rows.some(
    (r) => r[0] === "Initial" && r[6] === akun
  );
}

async function appendInitialBalance(data) {
  const sheets = sheetsClient();
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A:O",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          "Initial",              // Jenis
          "Setup",                // Kategori
          "Balance",              // Sub Kategori
          "Initial balance",      // Deskripsi
          data.jumlah,            // Jumlah
          data.mataUang,          // Mata uang
          data.akun,              // Akun
          "System",               // Metode
          0,                      // Saldo sebelum
          data.jumlah,            // Saldo sesudah
          "#initial",             // Tag
          "Initial balance",      // Catatan
          now,
          now,
        ],
      ],
    },
  });
}

/* =========================
   COMMAND
========================= */
export default {
  name: "setupaccount",

  async execute(ctx) {
    const rows = await fetchAllRows();

    const msg = await ctx.reply("Pilih akun yang ingin diset saldo awalnya:", {
      reply_markup: kbList(OPTIONS.akun, "setupaccount:akun"),
    });

    states.set(ctx.from.id, {
      step: "akun",
      rows,
      chatId: ctx.chat.id,
      messageId: msg.message_id,
    });
  },

  async handleCallback(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return ctx.answerCallbackQuery();

    const data = ctx.callbackQuery.data;
    const edit = (text, kb) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });

    // CANCEL
    if (data === "setupaccount:cancel") {
      states.delete(ctx.from.id);
      await ctx.answerCallbackQuery();
      return edit("❌ Setup akun dibatalkan.");
    }

    // SAVE
    if (data === "setupaccount:save") {
      await appendInitialBalance(state);
      states.delete(ctx.from.id);
      await ctx.answerCallbackQuery();

      return edit(
        `✅ *Saldo awal berhasil disimpan*

Akun       : ${state.akun}
Saldo Awal : *${formatAmount(state.jumlah, state.mataUang)}*
Mata Uang  : ${state.mataUang}
Metode     : System
Tag        : #initial`
      );
    }

    const [, step, value] = data.split(":");
    state[step] = value;

    // STEP: AKUN
    if (step === "akun") {
      if (hasInitialBalance(state.rows, value)) {
        return ctx.answerCallbackQuery({
          text: "Akun ini sudah memiliki saldo awal.",
          show_alert: true,
        });
      }

      state.step = "jumlah";
      await ctx.answerCallbackQuery();
      return edit(
        `Masukkan *saldo awal* untuk akun *${value}*:`,
        { inline_keyboard: [] }
      );
    }

    // STEP: MATA UANG
    if (step === "mataUang") {
      state.step = "confirm";
      await ctx.answerCallbackQuery();
      return this.render(ctx, state);
    }
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    await ctx.deleteMessage().catch(() => {});

    if (state.step === "jumlah") {
      state.jumlah = toNumber(ctx.message.text);
      state.step = "mataUang";

      return ctx.api.editMessageText(
        state.chatId,
        state.messageId,
        "Pilih mata uang:",
        { reply_markup: kbList(OPTIONS.mataUang, "setupaccount:mataUang") }
      );
    }
  },

  async render(ctx, state) {
    const edit = (text, kb) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });

    if (state.step === "confirm") {
      return edit(
        `🧾 *Konfirmasi Setup Akun*

Akun       : ${state.akun}
Saldo Awal : *${formatAmount(state.jumlah, state.mataUang)}*
Mata Uang  : ${state.mataUang}

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
};
