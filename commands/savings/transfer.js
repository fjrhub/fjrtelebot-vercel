import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */
const OPTIONS = {
  akun: ["Wallet", "Dana", "Seabank", "Bank", "Binance", "Fjlsaldo", "Gopay"],
};

/* =========================
   STATE
========================= */
const states = new Map();

/* =========================
   UTIL
========================= */
const toNumber = (v) => Number(String(v).replace(/\./g, "").replace(",", "."));

const format = (n) => new Intl.NumberFormat("id-ID").format(n);

/* =========================
   GOOGLE SHEETS
========================= */
function sheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
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

function getLastSaldo(rows, akun) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][1] === akun) {
      return {
        mataUang: rows[i][0] || "Rp",
        saldo: Number(rows[i][4]) || 0,
      };
    }
  }
  return { mataUang: "Rp", saldo: 0 };
}

async function appendRows(values) {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A:O",
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/* =========================
   KEYBOARD
========================= */
const kbList = (list, prefix, showBack = false, showCancel = false) => {
  const buttons = list.map((v) => [
    { text: v, callback_data: `${prefix}:${v}` },
  ]);
  const footer = [];
  if (showBack)
    footer.push({ text: "⬅️ Back", callback_data: "transfer:back" });
  if (showCancel)
    footer.push({ text: "❌ Cancel", callback_data: "transfer:cancel" });
  if (footer.length > 0) buttons.push(footer);
  return { inline_keyboard: buttons };
};

const kbText = (showBack = false) => ({
  inline_keyboard: [
    showBack
      ? { text: "⬅️ Back", callback_data: "transfer:back" }
      : { text: "❌ Cancel", callback_data: "transfer:cancel" },
  ],
});

const kbConfirm = () => ({
  inline_keyboard: [
    [{ text: "✅ Save", callback_data: "transfer:save:ok" }],
    [{ text: "⬅️ Back", callback_data: "transfer:back" }],
    [{ text: "❌ Cancel", callback_data: "transfer:cancel" }],
  ],
});

/* =========================
   COMMAND
========================= */
export default {
  name: "transfer",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const args = ctx.match?.trim();
    const isAdmin = args === "admin";

    const rows = await fetchAllRows();
    const msg = await ctx.reply(
      "🔁 Transfer Between Accounts\n\nSelect source account:",
      {
        reply_markup: kbList(OPTIONS.akun, "transfer:akunAsal", false, true),
      },
    );

    states.set(ctx.from.id, {
      step: "akunAsal",
      history: [],
      rows,
      isAdmin,
      adminFee: 0,
      chatId: ctx.chat.id,
      messageId: msg.message_id,
    });
  },

  async handleCallback(ctx) {
    await ctx.answerCallbackQuery().catch(() => {});
    const state = states.get(ctx.from.id);
    if (!state) return;

    const edit = (text, markup) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        reply_markup: markup,
      });

    const data = ctx.callbackQuery.data;

    if (data === "transfer:cancel") {
      states.delete(ctx.from.id);
      return edit("❌ Transfer cancelled.");
    }

    if (data === "transfer:back") {
      state.step = state.history.pop() || "akunAsal";
      return this.render(ctx, state);
    }

    const [, step, value] = data.split(":");
    state.history.push(state.step);

    if (step === "akunAsal") {
      state.akunAsal = value;
      state.step = "akunTujuan";
      return this.render(ctx, state);
    }

    if (step === "akunTujuan") {
      if (value === state.akunAsal) {
        state.history.pop();
        return edit(
          "❌ Source and destination cannot be the same.",
          kbList(OPTIONS.akun, "transfer:akunTujuan", true, false),
        );
      }
      state.akunTujuan = value;
      state.step = "deskripsi";
      return this.render(ctx, state);
    }

    if (step === "save") {
      const now = new Date().toISOString();
      const asal = getLastSaldo(state.rows, state.akunAsal);
      const tujuan = getLastSaldo(state.rows, state.akunTujuan);

      const totalDeduction = state.jumlah + state.adminFee;

      if (asal.saldo < totalDeduction) {
        return edit("❌ Insufficient balance.");
      }

      const newAsalSaldo = asal.saldo - totalDeduction;
      const newTujuanSaldo = tujuan.saldo + state.jumlah;

      const rowsToInsert = [
        [
          "Pengeluaran",
          "Transfer",
          "Antar Akun",
          state.deskripsi,
          state.jumlah,
          asal.mataUang,
          state.akunAsal,
          "Transfer",
          asal.saldo,
          newAsalSaldo,
          state.tag,
          state.catatan,
          now,
          now,
        ],
        [
          "Pemasukan",
          "Transfer",
          "Antar Akun",
          state.deskripsi,
          state.jumlah,
          tujuan.mataUang,
          state.akunTujuan,
          "Transfer",
          tujuan.saldo,
          newTujuanSaldo,
          state.tag,
          state.catatan,
          now,
          now,
        ],
      ];

      if (state.adminFee > 0) {
        rowsToInsert.push([
          "Pengeluaran",
          "Biaya",
          "Admin Transfer",
          "Transfer Admin Fee",
          state.adminFee,
          asal.mataUang,
          state.akunAsal,
          "Transfer",
          asal.saldo - state.jumlah,
          newAsalSaldo,
          state.tag,
          state.catatan,
          now,
          now,
        ]);
      }

      await appendRows(rowsToInsert);
      states.delete(ctx.from.id);

      return edit(
        `✅ TRANSFER SUCCESS

Amount: ${asal.mataUang}${format(state.jumlah)}
Admin Fee: ${asal.mataUang}${format(state.adminFee)}

From: ${state.akunAsal}
To: ${state.akunTujuan}

Time: ${new Date().toLocaleString("id-ID")}`,
      );
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
    } else if (state.step === "jumlah") {
      state.jumlah = toNumber(ctx.message.text);
      state.step = state.isAdmin ? "admin" : "tag";
    } else if (state.step === "admin") {
      state.adminFee = toNumber(ctx.message.text) || 0;
      state.step = "tag";
    } else if (state.step === "tag") {
      state.tag = ctx.message.text;
      state.step = "catatan";
    } else if (state.step === "catatan") {
      state.catatan = ctx.message.text;
      state.step = "confirm";
    }

    return this.render(ctx, state);
  },

  async render(ctx, state) {
    const edit = (text, markup) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        reply_markup: markup,
      });

    const asal = getLastSaldo(state.rows, state.akunAsal);
    const tujuan = getLastSaldo(state.rows, state.akunTujuan);

    switch (state.step) {
      case "akunAsal":
        return edit(
          "🔁 Transfer Between Accounts\n\nSelect source account:",
          kbList(OPTIONS.akun, "transfer:akunAsal", false, true),
        );
      case "akunTujuan":
        return edit(
          "Select destination account:",
          kbList(OPTIONS.akun, "transfer:akunTujuan", true, false),
        );
      case "deskripsi":
        return edit("Enter transfer description:", kbText(true));
      case "jumlah":
        return edit("Enter transfer amount:", kbText(true));
      case "admin":
        return edit("Enter admin fee:", kbText(true));
      case "tag":
        return edit("Enter tag:", kbText(true));
      case "catatan":
        return edit("Enter note:", kbText(true));
      case "confirm":
        return edit(
          `CONFIRM TRANSFER

Amount: ${asal.mataUang}${format(state.jumlah)}
Admin Fee: ${asal.mataUang}${format(state.adminFee)}

From: ${state.akunAsal}
Balance: ${format(asal.saldo)} → ${format(
            asal.saldo - (state.jumlah + state.adminFee),
          )}

To: ${state.akunTujuan}
Balance: ${format(tujuan.saldo)} → ${format(tujuan.saldo + state.jumlah)}

Proceed?`,
          kbConfirm(),
        );
    }
  },
};
