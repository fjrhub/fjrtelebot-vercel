import { google } from "googleapis";

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

const formatAmount = (amount, currency = "IDR") => {
  if (currency === "Rp" || currency === "IDR") {
    return `Rp${formatNumber(amount)}`;
  }
  return `${formatNumber(amount)} ${currency}`;
};

// ✅ Keyboard teks dengan opsi back/cancel
const kbText = (showBack = false) => {
  const row = [];
  if (showBack) row.push({ text: "⬅️ Back", callback_data: "setupaccount:back" });
  row.push({ text: "❌ Cancel", callback_data: "setupaccount:cancel" });
  return { inline_keyboard: [row] };
};

const kbConfirm = () => ({
  inline_keyboard: [
    [{ text: "✅ Simpan", callback_data: "setupaccount:save" }],
    [{ text: "⬅️ Back", callback_data: "setupaccount:back" }],
    [{ text: "❌ Cancel", callback_data: "setupaccount:cancel" }],
  ],
});

// ✅ SAFE EDIT
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
          "IDR", // Default ke IDR
          data.akun,
          "System",
          0,
          data.jumlah,
          "#Initial",
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
      "Ketik nama akun yang ingin diset saldo awalnya:",
      { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "setupaccount:cancel" }]] } }
    );

    states.set(ctx.from.id, {
      step: "akun",
      history: [],
      rows,
      chatId: ctx.chat.id,
      messageId: msg.message_id,
      mataUang: "IDR",
    });
  },

  async handleCallback(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return ctx.answerCallbackQuery();

    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    if (data === "setupaccount:cancel") {
      states.delete(ctx.from.id);
      return safeEdit(ctx, state.chatId, state.messageId, "❌ Setup akun dibatalkan.", {
        inline_keyboard: [],
      });
    }

    if (data === "setupaccount:back") {
      state.step = state.history.pop() || "akun";
      return this.render(ctx, state);
    }

    if (data === "setupaccount:save") {
      await appendInitialBalance(state);
      states.delete(ctx.from.id);
      return safeEdit(
        ctx,
        state.chatId,
        state.messageId,
        `✅ *Saldo awal berhasil disimpan*\n\nAkun       : ${state.akun}\nSaldo Awal : *${formatAmount(state.jumlah, "IDR")}*\nMata Uang  : IDR\nMetode     : System\nTag        : #Initial`,
        { inline_keyboard: [] }
      );
    }
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    await ctx.deleteMessage().catch(() => {});
    state.history.push(state.step);

    if (state.step === "akun") {
      const akunName = ctx.message.text.trim();
      if (hasInitialBalance(state.rows, akunName)) {
        state.history.pop(); // undo push
        return safeEdit(
          ctx,
          state.chatId,
          state.messageId,
          `❌ Akun *${akunName}* sudah memiliki saldo awal.\n\nKetik nama akun lain:`,
          { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "setupaccount:cancel" }]] }
        );
      }
      state.akun = akunName;
      state.step = "jumlah";
      return this.render(ctx, state);
    }

    if (state.step === "jumlah") {
      const num = toNumber(ctx.message.text);
      if (isNaN(num) || num <= 0) {
        state.history.pop();
        return safeEdit(
          ctx,
          state.chatId,
          state.messageId,
          `❌ Format salah! Masukkan *saldo awal* untuk akun *${state.akun}*:\n\nFormat: 100000 atau 100.000`,
          kbText(true)
        );
      }
      state.jumlah = num;
      state.step = "confirm";
      return this.render(ctx, state);
    }
  },

  async render(ctx, state) {
    switch (state.step) {
      case "akun":
        return safeEdit(
          ctx,
          state.chatId,
          state.messageId,
          "Ketik nama akun yang ingin diset saldo awalnya:",
          { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "setupaccount:cancel" }]] }
        );
      case "jumlah":
        return safeEdit(
          ctx,
          state.chatId,
          state.messageId,
          `Masukkan *saldo awal* untuk akun *${state.akun}*:\n\nFormat: 100000 atau 100.000`,
          kbText(true)
        );
      case "confirm":
        return safeEdit(
          ctx,
          state.chatId,
          state.messageId,
          `🧾 *Konfirmasi Setup Akun*\n\nAkun       : ${state.akun}\nSaldo Awal : *${formatAmount(state.jumlah, "IDR")}*\nMata Uang  : IDR\n\nLanjutkan?`,
          kbConfirm()
        );
    }
  },
};