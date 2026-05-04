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
   COMMAND
========================= */
export default {
  name: "bunga",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const rows = await fetchAllRows();

    const msg = await ctx.reply("Masukkan deskripsi bunga:", {
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "bunga:cancel" }]],
      },
    });

    states.set(ctx.from.id, {
      step: "deskripsi",
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
    const state = states.get(ctx.from.id);
    if (!state) return;

    if (ctx.callbackQuery.data === "bunga:cancel") {
      states.delete(ctx.from.id);
      return ctx.api.editMessageText(
        state.chatId,
        state.messageId,
        "❌ Dibatalkan.",
      );
    }
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    await ctx.deleteMessage().catch(() => {});

    if (state.step === "deskripsi") {
      state.deskripsi = ctx.message.text;
      state.step = "jumlah";

      return ctx.api.editMessageText(
        state.chatId,
        state.messageId,
        "Masukkan jumlah:",
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

      await appendTransaction(state);
      states.delete(ctx.from.id);

      return ctx.api.editMessageText(
        state.chatId,
        state.messageId,
        `✅ Transaksi berhasil disimpan!\n\n` +
          `Jenis: ${state.jenis}\n` +
          `Kategori: ${state.kategori}\n` +
          `Sub: ${state.subKategori}\n` +
          `Deskripsi: ${state.deskripsi}\n` +
          `Jumlah: ${formatAmount(state.jumlah, state.mataUang)}\n` +
          `Akun: ${state.akun}\n` +
          `Metode: ${state.metode}\n` +
          `Tag: ${state.tag}`,
      );
    }
  },
};