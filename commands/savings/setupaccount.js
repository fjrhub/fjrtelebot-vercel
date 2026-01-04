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
  if (currency === "Rp") {
    return `Rp${formatNumber(amount)}`;
  }
  return `${formatNumber(amount)} ${currency}`;
};

// ✅ Keyboard dengan opsi back/cancel
const kbList = (list, prefix, perRow = 2, showBack = false, showCancel = false) => {
  const keyboard = [];
  for (let i = 0; i < list.length; i += perRow) {
    keyboard.push(
      list.slice(i, i + perRow).map((v) => ({
        text: v,
        callback_data: `${prefix}:${v}`,
      }))
    );
  }
  const footer = [];
  if (showBack) footer.push({ text: "⬅️ Back", callback_data: "setupaccount:back" });
  if (showCancel) footer.push({ text: "❌ Cancel", callback_data: "setupaccount:cancel" });
  if (footer.length > 0) keyboard.push(footer);
  return { inline_keyboard: keyboard };
};

const kbText = (showBack = false) => {
  if (showBack) {
    return { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "setupaccount:back" }]] };
  }
  return { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "setupaccount:cancel" }]] };
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
          data.mataUang,
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
      "Pilih akun yang ingin diset saldo awalnya:",
      { reply_markup: kbList(OPTIONS.akun, "setupaccount:akun", 2, false, true) }
    );

    states.set(ctx.from.id, {
      step: "akun",
      history: [],
      rows,
      chatId: ctx.chat.id,
      messageId: msg.message_id,
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
        `✅ *Saldo awal berhasil disimpan*\n\nAkun       : ${state.akun}\nSaldo Awal : *${formatAmount(state.jumlah, state.mataUang)}*\nMata Uang  : ${state.mataUang}\nMetode     : System\nTag        : #Initial`,
        { inline_keyboard: [] }
      );
    }

    const [, step, value] = data.split(":");

    // Simpan riwayat sebelum ganti langkah
    state.history.push(state.step);

    if (step === "akun") {
      if (hasInitialBalance(state.rows, value)) {
        state.history.pop(); // undo push
        return ctx.answerCallbackQuery({
          text: "Akun ini sudah memiliki saldo awal.",
          show_alert: true,
        });
      }
      state.akun = value;
      state.step = "jumlah";
      return this.render(ctx, state);
    }

    if (step === "mataUang") {
      state.mataUang = value;
      state.step = "confirm";
      return this.render(ctx, state);
    }
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    await ctx.deleteMessage().catch(() => {});
    state.history.push(state.step);

    if (state.step === "jumlah") {
      state.jumlah = toNumber(ctx.message.text);
      state.step = "mataUang";
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
          "Pilih akun yang ingin diset saldo awalnya:",
          kbList(OPTIONS.akun, "setupaccount:akun", 2, false, true)
        );
      case "jumlah":
        return safeEdit(
          ctx,
          state.chatId,
          state.messageId,
          `Masukkan *saldo awal* untuk akun *${state.akun}*:\n\nFormat: 100000 atau 100.000`,
          kbText(true)
        );
      case "mataUang":
        return safeEdit(
          ctx,
          state.chatId,
          state.messageId,
          "Pilih mata uang:",
          kbList(OPTIONS.mataUang, "setupaccount:mataUang", 2, true, false)
        );
      case "confirm":
        return safeEdit(
          ctx,
          state.chatId,
          state.messageId,
          `🧾 *Konfirmasi Setup Akun*\n\nAkun       : ${state.akun}\nSaldo Awal : *${formatAmount(state.jumlah, state.mataUang)}*\nMata Uang  : ${state.mataUang}\n\nLanjutkan?`,
          kbConfirm()
        );
    }
  },
};