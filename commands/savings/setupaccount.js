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

// ✅ SUPPORT: 29.881 / 29,881 / 29881
const toNumber = (v) =>
  Number(String(v).replace(/\./g, "").replace(",", "."));

const formatNumber = (n) =>
  new Intl.NumberFormat("id-ID").format(n);

// ✅ FIX UTAMA (USDT PAKAI PEMISAH RIBUAN)
const formatAmount = (amount, currency) => {
  if (currency === "Rp") {
    return `Rp${formatNumber(amount)}`;
  }
  return `${formatNumber(amount)} ${currency}`;
};

// Keyboard generator
const kbList = (list, prefix, perRow = 2) => {
  const keyboard = [];
  for (let i = 0; i < list.length; i += perRow) {
    keyboard.push(
      list.slice(i, i + perRow).map((v) => ({
        text: v,
        callback_data: `${prefix}:${v}`,
      }))
    );
  }
  return { inline_keyboard: keyboard };
};

// ✅ SAFE EDIT (ANTI ERROR "message is not modified")
async function safeEdit(ctx, chatId, messageId, text, kb) {
  try {
    await ctx.api.editMessageText(chatId, messageId, text, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  } catch (e) {
    if (!String(e).includes("message is not modified")) throw e;
  }
}

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
  return rows.some((r) => r[0] === "Initial" && r[6] === akun);
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
   COMMAND
========================= */
export default {
  name: "setupaccount",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const rows = await fetchAllRows();
    const msg = await ctx.reply(
      "Pilih akun yang ingin diset saldo awalnya:",
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

    // CANCEL
    if (data === "setupaccount:cancel") {
      states.delete(ctx.from.id);
      await ctx.answerCallbackQuery();
      return safeEdit(
        ctx,
        state.chatId,
        state.messageId,
        "❌ Setup akun dibatalkan.",
        { inline_keyboard: [] }
      );
    }

    // SAVE
    if (data === "setupaccount:save") {
      await appendInitialBalance(state);
      states.delete(ctx.from.id);
      await ctx.answerCallbackQuery();

      return safeEdit(
        ctx,
        state.chatId,
        state.messageId,
        `✅ *Saldo awal berhasil disimpan*

Akun       : ${state.akun}
Saldo Awal : *${formatAmount(state.jumlah, state.mataUang)}*
Mata Uang  : ${state.mataUang}
Metode     : System
Tag        : #initial`,
        { inline_keyboard: [] }
      );
    }

    const [, step, value] = data.split(":");
    state[step] = value;

    // AKUN
    if (step === "akun") {
      if (hasInitialBalance(state.rows, value)) {
        return ctx.answerCallbackQuery({
          text: "Akun ini sudah memiliki saldo awal.",
          show_alert: true,
        });
      }

      state.step = "jumlah";
      await ctx.answerCallbackQuery();

      return safeEdit(
        ctx,
        state.chatId,
        state.messageId,
        `Masukkan *saldo awal* untuk akun *${value}*:`,
        { inline_keyboard: [] }
      );
    }

    // MATA UANG
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

      return safeEdit(
        ctx,
        state.chatId,
        state.messageId,
        "Pilih mata uang:",
        kbList(OPTIONS.mataUang, "setupaccount:mataUang")
      );
    }
  },

  async render(ctx, state) {
    if (state.step !== "confirm") return;

    return safeEdit(
      ctx,
      state.chatId,
      state.messageId,
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
  },
};
