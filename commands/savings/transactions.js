import { google } from "googleapis";

/* =========================
   CONFIG
========================= */
const LIMIT = 15;
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

async function fetchTransactions() {
  const sheets = sheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:N",
  });

  return res.data.values || [];
}

/* =========================
   UTIL
========================= */
const formatNumber = (n) =>
  new Intl.NumberFormat("id-ID").format(Number(n) || 0);

const formatDate = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getHeaderIcon = (jenis) => {
  switch (jenis) {
    case "Pemasukan":
      return "🟢";
    case "Pengeluaran":
      return "🔴";
    case "Initial":
      return "🔵";
    default:
      return "⚪";
  }
};

/* =========================
   PAGINATION UI
========================= */
function paginationKeyboard(page, total) {
  const buttons = [];

  if (page > 0) {
    buttons.push({
      text: "⬅️ Sebelumnya",
      callback_data: "transactions:prev",
    });
  }

  if ((page + 1) * LIMIT < total) {
    buttons.push({
      text: "➡️ Selanjutnya",
      callback_data: "transactions:next",
    });
  }

  return {
    inline_keyboard: buttons.length ? [buttons] : [],
  };
}

/* =========================
   RENDER PAGE
========================= */
function renderPage(state) {
  const start = state.page * LIMIT;
  const end = start + LIMIT;

  const pageRows = state.rows.slice(start, end);

  let text = `📒 Transaksi (${state.sortType.toUpperCase()}) ${
    start + 1
  }-${Math.min(end, state.rows.length)} dari ${state.rows.length}\n\n`;

  pageRows.forEach((r, i) => {
    const [
      jenis,
      kategori,
      subKategori,
      deskripsi,
      jumlah,
      mataUang,
      akun,
      metode,
      saldoSebelum,
      saldoSesudah,
      tag,
      catatan,
      dibuatPada,
    ] = r;

    const headerIcon = getHeaderIcon(jenis);

    // Nomor dinamis
    let nomor;
    if (state.sortType === "desc") {
      nomor = state.rows.length - (start + i);
    } else {
      nomor = start + i + 1;
    }

    text +=
      `${nomor}. ${headerIcon} ${jenis} | ${akun} | ${metode}\n` +
      `${kategori} › ${subKategori}\n` +
      `${deskripsi} | ${catatan || "-"}\n` +
      `${mataUang}${formatNumber(jumlah)} | ${formatNumber(
        saldoSebelum,
      )} → ${formatNumber(saldoSesudah)}\n` +
      `🏷 ${tag || "-"}\n` +
      `🕒 ${formatDate(dibuatPada)}\n\n`;
  });

  return {
    text,
    reply_markup: paginationKeyboard(state.page, state.rows.length),
  };
}

/* =========================
   COMMAND
========================= */
export default {
  name: "transactions",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const rows = await fetchTransactions();

    if (!rows.length) {
      return ctx.reply("📭 Belum ada transaksi.");
    }

    // Ambil argumen sort
    const args = ctx.message.text.split(" ");
    const sortType = args[1]?.toLowerCase() === "desc" ? "desc" : "asc";

    // Sorting berdasarkan tanggal (index 12 = dibuatPada)
    const orderedRows = [...rows].sort((a, b) => {
      const dateA = new Date(a[12]).getTime();
      const dateB = new Date(b[12]).getTime();

      return sortType === "desc" ? dateB - dateA : dateA - dateB;
    });

    const state = {
      page: 0,
      rows: orderedRows,
      sortType,
    };

    const view = renderPage(state);

    const msg = await ctx.reply(view.text, {
      reply_markup: view.reply_markup,
    });

    states.set(ctx.from.id, {
      ...state,
      chatId: ctx.chat.id,
      messageId: msg.message_id,
    });
  },

  async handleCallback(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    const action = ctx.callbackQuery.data;

    if (action === "transactions:next") {
      state.page++;
    }

    if (action === "transactions:prev") {
      state.page--;
    }

    const view = renderPage(state);

    return ctx.api.editMessageText(state.chatId, state.messageId, view.text, {
      reply_markup: view.reply_markup,
    });
  },
};
