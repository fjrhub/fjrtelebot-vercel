import { google } from "googleapis";

/* =========================
   STATE
========================= */
const states = new Map();

/* =========================
   UTIL
========================= */
const parseInputAmount = (text) => {
  if (!text) return 0;
  const cleanedText = String(text).replace(/\./g, "").replace(",", ".");
  return Number(cleanedText);
};

const amountToSheet = (amount, currency) => {
  if (currency === "USDT") {
    return Math.round(Number(amount) * 1000);
  }
  return Math.round(Number(amount));
};

const formatAmount = (amount, currency) => {
  if (currency === "USDT") {
    return `${Number(amount).toLocaleString("id-ID", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    })} USDT`;
  }
  return `Rp${new Intl.NumberFormat("id-ID").format(Math.round(amount))}`;
};

const sheetToAmount = (value, currency) => {
  if (currency === "USDT") return Number(value || 0) / 1000;
  return Number(value || 0);
};

/* =========================
   SAFE EDIT
========================= */
async function safeEdit(ctx, chatId, messageId, text, markup) {
  try {
    return await ctx.api.editMessageText(chatId, messageId, text, {
      reply_markup: markup,
    });
  } catch (err) {
    if (err.description?.includes("message is not modified")) {
      return;
    }
    console.error("❌ editMessageText error:", err);
    throw err;
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
    range: "Sheet1!F2:J",
  });
  return res.data.values || [];
}

function getLastFromCache(rows, akun) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][1] === akun) {
      const mataUang = rows[i][0] || "Rp";
      const saldo = sheetToAmount(rows[i][4], mataUang);
      return { mataUang, saldo };
    }
  }
  return { saldo: 0, mataUang: "Rp" };
}

async function appendTransaction(data) {
  const sheets = sheetsClient();
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A:O",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          data.jenis,
          data.kategori,
          data.subKategori,
          data.deskripsi,
          amountToSheet(data.jumlah, data.mataUang),
          data.mataUang,
          data.akun,
          data.metode,
          amountToSheet(data.saldoSebelum, data.mataUang),
          amountToSheet(data.saldoSesudah, data.mataUang),
          data.tag,
          data.catatan,
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
const kbText = (showBack = false) => {
  if (showBack) {
    return {
      inline_keyboard: [
        [{ text: "⬅️ Back", callback_data: "bunga:back" }],
      ],
    };
  }
  return {
    inline_keyboard: [
      [{ text: "❌ Cancel", callback_data: "bunga:cancel" }],
    ],
  };
};

const kbConfirm = () => ({
  inline_keyboard: [
    [{ text: "✅ Simpan", callback_data: "bunga:save:ok" }],
    [{ text: "⬅️ Back", callback_data: "bunga:back" }],
    [{ text: "❌ Cancel", callback_data: "bunga:cancel" }],
  ],
});

/* =========================
   COMMAND
========================= */
export default {
  name: "bunga",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const rows = await fetchAllRows();

    const msg = await ctx.reply("Masukkan deskripsi bunga:", {
      reply_markup: kbText(false),
    });

    states.set(ctx.from.id, {
      step: "deskripsi",
      history: [],
      rows,
      chatId: ctx.chat.id,
      messageId: msg.message_id,

      // 🔥 PRESET OTOMATIS
      jenis: "Pemasukan",
      kategori: "Investasi",
      subKategori: "Bunga Bank",
      akun: "Seabank",
      metode: "Transfer",
      tag: "#bunga",
      catatan: "-",
    });
  },

  async handleCallback(ctx) {
    await ctx.answerCallbackQuery().catch(() => {});

    const state = states.get(ctx.from.id);
    if (!state) return;

    const data = ctx.callbackQuery?.data;
    if (!data?.startsWith("bunga:")) return;

    const edit = (text, markup) =>
      safeEdit(ctx, state.chatId, state.messageId, text, markup);

    if (data === "bunga:cancel") {
      states.delete(ctx.from.id);
      return edit("❌ Dibatalkan.");
    }

    if (data === "bunga:back") {
      state.step = state.history.pop() || "deskripsi";
      return this.render(ctx, state);
    }

    if (data === "bunga:save:ok") {
      await appendTransaction(state);
      states.delete(ctx.from.id);

      const successText = `✅ Transaksi berhasil disimpan!\n\n` +
        `Jenis: ${state.jenis}\n` +
        `Kategori: ${state.kategori}\n` +
        `Sub: ${state.subKategori}\n` +
        `Deskripsi: ${state.deskripsi}\n` +
        `Jumlah: ${formatAmount(state.jumlah, state.mataUang)}\n` +
        `Akun: ${state.akun}\n` +
        `Metode: ${state.metode}\n` +
        `Tag: ${state.tag}\n` +
        `Saldo Sebelum: ${formatAmount(state.saldoSebelum, state.mataUang)}\n` +
        `Saldo Sesudah: ${formatAmount(state.saldoSesudah, state.mataUang)}`;

      return edit(successText);
    }
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    await ctx.deleteMessage().catch(() => {});
    state.history.push(state.step);

    if (state.step === "deskripsi") {
      state.deskripsi = ctx.message.text;
      state.step = "jumlah";

      return ctx.api.editMessageText(
        state.chatId,
        state.messageId,
        "Masukkan jumlah:",
        { reply_markup: kbText(true) },
      );
    }

    if (state.step === "jumlah") {
      state.jumlah = parseInputAmount(ctx.message.text);

      const { saldo, mataUang } = getLastFromCache(
        state.rows,
        state.akun,
      );

      state.saldoSebelum = saldo;
      state.mataUang = mataUang;
      state.saldoSesudah = saldo + state.jumlah;

      state.step = "confirm";
      return this.render(ctx, state);
    }
  },

  async render(ctx, state) {
    const edit = (text, markup) =>
      safeEdit(ctx, state.chatId, state.messageId, text, markup);

    switch (state.step) {
      case "deskripsi":
        return edit("Masukkan deskripsi bunga:", kbText(false));

      case "jumlah":
        return edit(
          `Masukkan jumlah:\n\n💡 Otomatis:\nAkun: ${state.akun}\nTag: ${state.tag}`,
          kbText(true),
        );

      case "confirm": {
        const confirmText = `🧾 KONFIRMASI BUNGA

Jenis: ${state.jenis}
Kategori: ${state.kategori}
Sub: ${state.subKategori}
Deskripsi: ${state.deskripsi}
Jumlah: ${formatAmount(state.jumlah, state.mataUang)}

Akun: ${state.akun}
Metode: ${state.metode}
Tag: ${state.tag}
Catatan: ${state.catatan}

Saldo Sebelum: ${formatAmount(state.saldoSebelum, state.mataUang)}
Saldo Sesudah: ${formatAmount(state.saldoSesudah, state.mataUang)}

Lanjutkan?`;

        return edit(confirmText, kbConfirm());
      }

      default:
        return edit("⚠️ Langkah tidak dikenal.", kbText(true));
    }
  },
};