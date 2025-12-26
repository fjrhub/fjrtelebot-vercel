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

/* =========================
   FETCH (ONLY REQUIRED COLS)
========================= */
async function fetchInitialRows() {
  const sheets = sheetsClient();

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: process.env.SPREADSHEET_ID,
    ranges: [
      "Sheet1!A2:A", // Jenis
      "Sheet1!G2:G", // Akun
    ],
  });

  const jenisCol = res.data.valueRanges[0].values || [];
  const akunCol = res.data.valueRanges[1].values || [];

  return jenisCol.map((j, i) => ({
    jenis: j[0],
    akun: akunCol[i]?.[0] ?? null,
  }));
}

function hasInitialBalance(rows, akun) {
  return rows.some(
    (r) => r.jenis === "Initial" && r.akun === akun
  );
}

/* =========================
   APPEND INITIAL BALANCE
========================= */
async function appendInitialBalance(state) {
  const sheets = sheetsClient();
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A:O",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          "Initial",            // Jenis
          "Setup",              // Kategori
          "Balance",            // Sub Kategori
          "Initial balance",    // Deskripsi
          state.jumlah,         // Jumlah
          state.mataUang,       // Mata uang
          state.akun,           // Akun
          "System",             // Metode
          0,                    // Saldo sebelum
          state.jumlah,         // Saldo sesudah
          "#initial",           // Tag
          "Initial balance",    // Catatan
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
    const rows = await fetchInitialRows();

    const msg = await ctx.reply(
      "Select the account to set the initial balance:",
      { reply_markup: kbList(OPTIONS.akun, "setupaccount:akun") }
    );

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

    /* CANCEL */
    if (data === "setupaccount:cancel") {
      states.delete(ctx.from.id);
      await ctx.answerCallbackQuery();
      return edit("❌ Setup cancelled.");
    }

    /* SAVE */
    if (data === "setupaccount:save") {
      await appendInitialBalance(state);
      states.delete(ctx.from.id);
      await ctx.answerCallbackQuery();

      return edit(
        `✅ *Initial balance saved*

Account: ${state.akun}
Balance: *${formatAmount(state.jumlah, state.mataUang)}*
Currency: ${state.mataUang}
Method: System
Tag: #initial`
      );
    }

    const [, step, value] = data.split(":");
    state[step] = value;

    /* STEP: ACCOUNT */
    if (step === "akun") {
      if (hasInitialBalance(state.rows, value)) {
        return ctx.answerCallbackQuery({
          text: "This account already has an initial balance.",
          show_alert: true,
        });
      }

      state.step = "jumlah";
      await ctx.answerCallbackQuery();

      return edit(
        `Enter the *initial balance* for *${value}*:`,
        { inline_keyboard: [] }
      );
    }

    /* STEP: CURRENCY */
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
        "Select currency:",
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
        `🧾 *Confirm Initial Balance*

Account     : ${state.akun}
Balance     : *${formatAmount(state.jumlah, state.mataUang)}*
Currency    : ${state.mataUang}

Continue?`,
        {
          inline_keyboard: [
            [{ text: "✅ Save", callback_data: "setupaccount:save" }],
            [{ text: "❌ Cancel", callback_data: "setupaccount:cancel" }],
          ],
        }
      );
    }
  },
};
