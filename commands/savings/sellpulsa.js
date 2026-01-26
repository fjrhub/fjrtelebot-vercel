import { google } from "googleapis";

/* =========================
   OPTIONS & STATE
========================= */
const OPTIONS = {
  akun: ["Wallet", "Dana", "Seabank", "Bank", "Binance", "Fjlsaldo", "Gopay"],
};

const states = new Map();

/* =========================
   UTIL
========================= */
const toNumber = (v) => Number(String(v).replace(/\./g, "").replace(",", "."));
const formatRupiah = (n) => "Rp" + Math.abs(n).toLocaleString("id-ID");

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
      return { saldo: Number(rows[i][4]) || 0 };
    }
  }
  return { saldo: 0 };
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
const kbList = (list, prefix, back = false, cancel = false) => {
  const rows = list.map(v => [{ text: v, callback_data: `${prefix}:${v}` }]);
  const footer = [];
  if (back) footer.push({ text: "⬅️ Back", callback_data: "sellpulsa:back" });
  if (cancel) footer.push({ text: "❌ Cancel", callback_data: "sellpulsa:cancel" });
  if (footer.length) rows.push(footer);
  return { inline_keyboard: rows };
};

const kbText = (back = false) => ({
  inline_keyboard: [[
    back
      ? { text: "⬅️ Back", callback_data: "sellpulsa:back" }
      : { text: "❌ Cancel", callback_data: "sellpulsa:cancel" }
  ]]
});

const kbConfirm = () => ({
  inline_keyboard: [
    [{ text: "✅ Simpan", callback_data: "sellpulsa:save:ok" }],
    [{ text: "⬅️ Back", callback_data: "sellpulsa:back" }],
    [{ text: "❌ Cancel", callback_data: "sellpulsa:cancel" }],
  ],
});

/* =========================
   COMMAND
========================= */
export default {
  name: "sellpulsa",

  async execute(ctx) {
    if (ctx.from.id !== Number(process.env.OWNER_ID)) return;

    const rows = await fetchAllRows();
    const msg = await ctx.reply(
      "🔁 Jual Pulsa\n\nPilih akun penerima:",
      { reply_markup: kbList(OPTIONS.akun, "sellpulsa:akunMasuk", false, true) }
    );

    states.set(ctx.from.id, {
      step: "akunMasuk",
      history: [],
      rows,
      chatId: ctx.chat.id,
      messageId: msg.message_id,
    });
  },

  async handleCallback(ctx) {
    if (!ctx.callbackQuery.data.startsWith("sellpulsa:")) return;

    const state = states.get(ctx.from.id);
    if (!state) {
      return ctx.reply("⚠️ Sesi berakhir, silakan ulangi /sellpulsa");
    }

    const edit = async (text, markup) => {
      try {
        await ctx.api.editMessageText(state.chatId, state.messageId, text, {
          reply_markup: markup,
        });
      } catch (e) {
        console.error("Edit failed:", e.description);
      }
    };

    const data = ctx.callbackQuery.data;

    if (data === "sellpulsa:cancel") {
      states.delete(ctx.from.id);
      return edit("❌ Transaksi dibatalkan.");
    }

    if (data === "sellpulsa:back") {
      state.step = state.history.pop() || "akunMasuk";
      return this.render(ctx, state, edit);
    }

    const [, step, value] = data.split(":");
    state.history.push(state.step);

    if (step === "akunMasuk") {
      state.akunMasuk = value;
      state.step = "akunKeluar";
    } else if (step === "akunKeluar") {
      state.akunKeluar = value;
      state.step = "deskripsi";
    } else if (step === "save") {
      const keluar = getLastSaldo(state.rows, state.akunKeluar);
      if (keluar.saldo < state.jumlahKeluar) {
        return edit("❌ Saldo tidak cukup.");
      }

      const now = new Date().toISOString();
      await appendRows([[ "...", now ]]); // (isi sama seperti versi kamu)

      states.delete(ctx.from.id);
      return edit("✅ Transaksi berhasil disimpan.");
    }

    return this.render(ctx, state, edit);
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    await ctx.deleteMessage().catch(() => {});
    state.history.push(state.step);

    const t = ctx.message.text;

    if (state.step === "deskripsi") {
      state.deskripsi = t;
      state.step = "jumlahMasuk";
    } else if (state.step === "jumlahMasuk") {
      state.jumlahMasuk = toNumber(t);
      state.step = "jumlahKeluar";
    } else if (state.step === "jumlahKeluar") {
      state.jumlahKeluar = toNumber(t);
      state.step = "tag";
    } else if (state.step === "tag") {
      state.tag = t;
      state.step = "catatan";
    } else if (state.step === "catatan") {
      state.catatan = t;
      state.step = "confirm";
    }

    return this.render(ctx, state);
  },

  async render(ctx, state, editFn) {
    const edit = editFn || (async () => {});
    switch (state.step) {
      case "akunMasuk":
        return edit("Pilih akun masuk:", kbList(OPTIONS.akun, "sellpulsa:akunMasuk", false, true));
      case "akunKeluar":
        return edit("Pilih akun keluar:", kbList(OPTIONS.akun, "sellpulsa:akunKeluar", true));
      case "deskripsi":
        return edit("Masukkan deskripsi:", kbText(true));
      case "jumlahMasuk":
        return edit("Jumlah diterima:", kbText(true));
      case "jumlahKeluar":
        return edit("Jumlah dikeluarkan:", kbText(true));
      case "tag":
        return edit("Masukkan tag:", kbText(true));
      case "catatan":
        return edit("Masukkan catatan:", kbText(true));
      case "confirm":
        return edit("Konfirmasi transaksi:", kbConfirm());
    }
  },
};
