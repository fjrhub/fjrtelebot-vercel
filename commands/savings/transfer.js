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

const kbText = (showBack = false) => {
  if (showBack) {
    return {
      inline_keyboard: [[{ text: "⬅️ Back", callback_data: "transfer:back" }]],
    };
  }
  return {
    inline_keyboard: [
      [{ text: "❌ Cancel", callback_data: "transfer:cancel" }],
    ],
  };
};

const kbConfirm = () => ({
  inline_keyboard: [
    [{ text: "✅ Simpan", callback_data: "transfer:save:ok" }],
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
    const rows = await fetchAllRows();
    const msg = await ctx.reply("🔁 Transfer Antar Akun\n\nPilih akun asal:", {
      reply_markup: kbList(OPTIONS.akun, "transfer:akunAsal", false, true),
    });

    states.set(ctx.from.id, {
      step: "akunAsal",
      history: [],
      rows,
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
      return edit("❌ Transfer dibatalkan.");
    }

    if (data === "transfer:back") {
      state.step = state.history.pop() || "akunAsal";
      return this.render(ctx, state);
    }

    const [, step, value] = data.split(":");

    // Simpan riwayat sebelum ganti langkah
    state.history.push(state.step);

    if (step === "akunAsal") {
      state.akunAsal = value;
      state.step = "akunTujuan";
      return this.render(ctx, state);
    }

    if (step === "akunTujuan") {
      if (value === state.akunAsal) {
        // Tidak perlu push history lagi karena tetap di langkah ini
        state.history.pop(); // undo push sebelumnya
        return edit(
          "❌ Akun asal dan tujuan tidak boleh sama.\n\nPilih akun tujuan:",
          kbList(OPTIONS.akun, "transfer:akunTujuan", true, false)
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

      if (asal.saldo < state.jumlah) {
        return edit("❌ Saldo akun asal tidak mencukupi.");
      }

      await appendRows([
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
          asal.saldo - state.jumlah,
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
          tujuan.saldo + state.jumlah,
          state.tag,
          state.catatan,
          now,
          now,
        ],
      ]);

      states.delete(ctx.from.id);
      return edit(
        `✅ TRANSFER BERHASIL DISIMPAN

🧾 DETAIL TRANSFER

Deskripsi: ${state.deskripsi}
Jumlah: ${asal.mataUang}${format(state.jumlah)}

Dari: ${state.akunAsal}
Saldo: ${format(asal.saldo)} → ${format(asal.saldo - state.jumlah)}

Ke: ${state.akunTujuan}
Saldo: ${format(tujuan.saldo)} → ${format(tujuan.saldo + state.jumlah)}

Tag: ${state.tag}
Catatan: ${state.catatan}

🕒 ${new Date().toLocaleString("id-ID")}`
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
          "🔁 Transfer Antar Akun\n\nPilih akun asal:",
          kbList(OPTIONS.akun, "transfer:akunAsal", false, true)
        );
      case "akunTujuan":
        return edit(
          "Pilih akun tujuan:",
          kbList(OPTIONS.akun, "transfer:akunTujuan", true, false)
        );
      case "deskripsi":
        return edit("Masukkan deskripsi transfer:", kbText(true));
      case "jumlah":
        return edit("Masukkan jumlah transfer:", kbText(true));
      case "tag":
        return edit("Masukkan tag:", kbText(true));
      case "catatan":
        return edit("Masukkan catatan:", kbText(true));
      case "confirm":
        return edit(
          `🧾 KONFIRMASI TRANSFER

Deskripsi: ${state.deskripsi}
Jumlah: ${asal.mataUang}${format(state.jumlah)}

Dari: ${state.akunAsal}
Saldo: ${format(asal.saldo)} → ${format(asal.saldo - state.jumlah)}

Ke: ${state.akunTujuan}
Saldo: ${format(tujuan.saldo)} → ${format(tujuan.saldo + state.jumlah)}

Tag: ${state.tag}
Catatan: ${state.catatan}

Lanjutkan?`,
          kbConfirm()
        );
    }
  },
};
