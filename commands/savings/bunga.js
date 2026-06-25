import { google } from "googleapis";

/* =========================
   CONFIG & CONSTANTS
========================= */
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const OWNER_ID = Number(process.env.OWNER_ID);
const SHEET_RANGE_DATA = "Sheet1!F2:J"; // Untuk membaca saldo terakhir
const SHEET_RANGE_APPEND = "Sheet1!A:O"; // Untuk menulis transaksi

/* =========================
   STATE MANAGEMENT
========================= */
const states = new Map();

const getState = (userId) => states.get(userId);
const setState = (userId, state) => states.set(userId, state);
const clearState = (userId) => states.delete(userId);

/* =========================
   UTILITIES
========================= */
const parseInputAmount = (text) => {
  if (!text) return 0;
  const cleaned = String(text).replace(/\./g, "").replace(",", ".");
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
};

const amountToSheet = (amount, currency) => {
  const val = Number(amount);
  return currency === "USDT" ? Math.round(val * 1000) : Math.round(val);
};

const formatAmount = (amount, currency) => {
  const val = Number(amount);
  if (currency === "USDT") {
    return `${val.toLocaleString("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} USDT`;
  }
  return `Rp${new Intl.NumberFormat("id-ID").format(Math.round(val))}`;
};

const sheetToAmount = (value, currency) => {
  const num = Number(value || 0);
  return currency === "USDT" ? num / 1000 : num;
};

/* =========================
   GOOGLE SHEETS SERVICE
========================= */
let sheetsInstance = null;

const getSheetsClient = () => {
  if (!sheetsInstance) {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID,
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheetsInstance = google.sheets({ version: "v4", auth });
  }
  return sheetsInstance;
};

const fetchLastBalance = async (akun) => {
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_RANGE_DATA,
    });
    
    const rows = res.data.values || [];
    // Cari dari bawah ke atas untuk mendapatkan entri terbaru
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][1] === akun) { // Kolom F (index 1 dalam range F:J) adalah Akun
        const mataUang = rows[i][0] || "Rp"; // Kolom F index 0 adalah Mata Uang
        const saldo = sheetToAmount(rows[i][4], mataUang); // Kolom J (index 4) adalah Saldo
        return { mataUang, saldo };
      }
    }
  } catch (error) {
    console.error("❌ Error fetching balance:", error);
  }
  return { saldo: 0, mataUang: "Rp" };
};

const appendTransaction = async (data) => {
  const sheets = getSheetsClient();
  const now = new Date().toISOString();

  const rowValues = [
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
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_RANGE_APPEND,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [rowValues] },
  });
};

/* =========================
   TELEGRAM HELPERS
========================= */
const safeEdit = async (ctx, chatId, messageId, text, markup) => {
  try {
    return await ctx.api.editMessageText(chatId, messageId, text, {
      reply_markup: markup,
      parse_mode: "HTML", // Tambahkan parse mode jika perlu formatting
    });
  } catch (err) {
    if (err.description?.includes("message is not modified")) return;
    console.error("❌ Edit message error:", err);
    throw err;
  }
};

const kbCancel = () => ({
  inline_keyboard: [[{ text: "❌ Cancel", callback_data: "bunga:cancel" }]],
});

const kbBack = () => ({
  inline_keyboard: [[{ text: "⬅️ Back", callback_data: "bunga:back" }]],
});

const kbConfirm = () => ({
  inline_keyboard: [
    [{ text: "✅ Simpan", callback_data: "bunga:save:ok" }],
    [{ text: "⬅️ Back", callback_data: "bunga:back" }],
    [{ text: "❌ Cancel", callback_data: "bunga:cancel" }],
  ],
});

/* =========================
   MAIN MODULE
========================= */
export default {
  name: "bunga",

  async execute(ctx) {
    if (ctx.from?.id !== OWNER_ID) return;

    const args = (ctx.message.text || "").split(" ").slice(1);
    const nominalInput = args[0];
    const parsedAmount = parseInputAmount(nominalInput);

    const msg = await ctx.reply("⏳ Memproses...");

    const initialState = {
      step: parsedAmount > 0 ? "confirm" : "jumlah",
      history: [],
      chatId: ctx.chat.id,
      messageId: msg.message_id,
      // Default values
      jenis: "Pemasukan",
      kategori: "Investasi",
      subKategori: "Bunga Bank",
      deskripsi: "Bunga Seabank",
      akun: "Seabank",
      metode: "Transfer",
      tag: "#bunga",
      catatan: "-",
      jumlah: parsedAmount,
      mataUang: "Rp",
      saldoSebelum: 0,
      saldoSesudah: 0,
    };

    setState(ctx.from.id, initialState);

    if (initialState.step === "confirm") {
      const { saldo, mataUang } = await fetchLastBalance(initialState.akun);
      initialState.mataUang = mataUang;
      initialState.saldoSebelum = saldo;
      initialState.saldoSesudah = saldo + initialState.jumlah;
    }

    return this.render(ctx, getState(ctx.from.id));
  },

  async handleCallback(ctx) {
    await ctx.answerCallbackQuery().catch(() => {});

    const userId = ctx.from.id;
    const state = getState(userId);
    if (!state) return;

    const data = ctx.callbackQuery?.data;
    if (!data?.startsWith("bunga:")) return;

    const edit = (text, markup) => safeEdit(ctx, state.chatId, state.messageId, text, markup);

    if (data === "bunga:cancel") {
      clearState(userId);
      return edit("❌ Dibatalkan.");
    }

    if (data === "bunga:back") {
      if (state.history.length > 0) {
        state.step = state.history.pop();
        return this.render(ctx, state);
      }
      clearState(userId);
      return edit("❌ Dibatalkan.");
    }

    if (data === "bunga:save:ok") {
      try {
        await appendTransaction(state);
        clearState(userId);

        const successText = 
          `<b>✅ Transaksi Berhasil!</b>\n\n` +
          `<b>Jumlah:</b> ${formatAmount(state.jumlah, state.mataUang)}\n` +
          `<b>Akun:</b> ${state.akun}\n` +
          `<b>Saldo Akhir:</b> ${formatAmount(state.saldoSesudah, state.mataUang)}`;

        return edit(successText);
      } catch (error) {
        console.error("Save error:", error);
        return edit("⚠️ Gagal menyimpan transaksi. Coba lagi.");
      }
    }
  },

  async handleText(ctx) {
    const userId = ctx.from.id;
    const state = getState(userId);
    if (!state) return;

    await ctx.deleteMessage().catch(() => {});
    state.history.push(state.step);

    if (state.step === "jumlah") {
      const amount = parseInputAmount(ctx.message.text);
      if (amount <= 0) {
        state.history.pop(); // Hapus langkah invalid dari history
        return safeEdit(ctx, state.chatId, state.messageId, "⚠️ Jumlah tidak valid. Masukkan angka positif.", kbBack());
      }

      state.jumlah = amount;
      
      // Fetch balance only when needed
      const { saldo, mataUang } = await fetchLastBalance(state.akun);
      state.mataUang = mataUang;
      state.saldoSebelum = saldo;
      state.saldoSesudah = saldo + amount;

      state.step = "confirm";
      return this.render(ctx, state);
    }
  },

  async render(ctx, state) {
    const edit = (text, markup) => safeEdit(ctx, state.chatId, state.messageId, text, markup);

    switch (state.step) {
      case "jumlah":
        return edit(
          `💰 <b>Masukkan Jumlah Bunga</b>\n\n` +
          `Default:\n` +
          `• Akun: ${state.akun}\n` +
          `• Deskripsi: ${state.deskripsi}\n` +
          `• Tag: ${state.tag}`,
          kbBack()
        );

      case "confirm": {
        const confirmText = 
          `<b>🧾 Konfirmasi Transaksi</b>\n\n` +
          `<b>Jenis:</b> ${state.jenis}\n` +
          `<b>Kategori:</b> ${state.kategori} > ${state.subKategori}\n` +
          `<b>Deskripsi:</b> ${state.deskripsi}\n\n` +
          `<b>Jumlah:</b> ${formatAmount(state.jumlah, state.mataUang)}\n` +
          `<b>Akun:</b> ${state.akun}\n` +
          `<b>Metode:</b> ${state.metode}\n\n` +
          `<b>Saldo Sebelum:</b> ${formatAmount(state.saldoSebelum, state.mataUang)}\n` +
          `<b>Saldo Sesudah:</b> ${formatAmount(state.saldoSesudah, state.mataUang)}\n\n` +
          `Lanjutkan?`;

        return edit(confirmText, kbConfirm());
      }

      default:
        return edit("⚠️ Langkah tidak dikenal.", kbBack());
    }
  },
};
