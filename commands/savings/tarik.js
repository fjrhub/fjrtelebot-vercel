import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */

const OPTIONS = {
  akun: ["Wallet", "Dana", "Seabank", "Bank", "Fjlsaldo", "Gopay"],
};

const AKUN_LIST = OPTIONS.akun.map(a => a.toLowerCase());

/* =========================
   STATE
========================= */

const states = new Map();

/* =========================
   UTIL
========================= */

const parseAmount = (v) => {
  const str = String(v).trim();
  const match = str.match(/(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)?/i);
  if (!match) return NaN;
  let amount = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  const suffix = match[2]?.toLowerCase();
  if (["k", "rb", "ribu"].includes(suffix)) amount *= 1000;
  if (["jt", "juta"].includes(suffix)) amount *= 1000000;
  return Math.round(amount);
};

const formatRupiah = (n) => {
  const abs = Math.abs(n).toLocaleString("id-ID");
  return n < 0 ? `-Rp${abs}` : `Rp${abs}`;
};

const formatSaldoLine = (akun, before, after, isKeluar) => {
  const icon = isKeluar ? "💸" : "💰";
  return `${icon} ${akun}: ${formatRupiah(before)} → ${formatRupiah(after)}`;
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
    if (err.description?.includes("message is not modified")) return;
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
      return { mataUang: "Rp", saldo: Number(rows[i][4]) || 0 };
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
  if (showBack) footer.push({ text: "⬅️ Back", callback_data: "tarik:back" });
  if (showCancel) footer.push({ text: "❌ Cancel", callback_data: "tarik:cancel" });
  if (footer.length > 0) buttons.push(footer);
  return { inline_keyboard: buttons };
};

const kbText = (showBack = false) => {
  if (showBack) {
    return {
      inline_keyboard: [
        [{ text: "⬅️ Back", callback_data: "tarik:back" }],
      ],
    };
  }
  return {
    inline_keyboard: [
      [{ text: "❌ Cancel", callback_data: "tarik:cancel" }],
    ],
  };
};

const kbConfirm = () => ({
  inline_keyboard: [
    [{ text: "✅ Simpan", callback_data: "tarik:save:ok" }],
    [{ text: "❌ Cancel", callback_data: "tarik:cancel" }],
  ],
});

/* =========================
   SAVE TRANSACTION
========================= */

async function saveTransaction(ctx, state) {
  const now = new Date().toISOString();
  const akunMasukInfo = getLastSaldo(state.rows, state.akunMasuk);
  const akunKeluarInfo = getLastSaldo(state.rows, state.akunKeluar);

  if (akunKeluarInfo.saldo < state.jumlahKeluar) {
    return "❌ Saldo akun sumber tidak mencukupi.";
  }

  const saldoMasukSebelum = akunMasukInfo.saldo;
  const saldoMasukSesudah = saldoMasukSebelum + state.jumlahMasuk;
  const saldoKeluarSebelum = akunKeluarInfo.saldo;
  const saldoKeluarSesudah = saldoKeluarSebelum - state.jumlahKeluar;

  const keuntungan = state.jumlahMasuk - state.jumlahKeluar;

  const entries = [
    [
      "Pengeluaran", "Usaha", "Tarik", state.deskripsi,
      state.jumlahKeluar, "Rp", state.akunKeluar, "Transfer",
      saldoKeluarSebelum, saldoKeluarSesudah, state.tag, state.catatan, now, now,
    ],
    [
      "Pemasukan", "Usaha", "Tarik", state.deskripsi,
      state.jumlahMasuk, "Rp", state.akunMasuk, "Cash",
      saldoMasukSebelum, saldoMasukSesudah, state.tag, state.catatan, now, now,
    ],
  ];

  await appendRows(entries);

  let warning = "";
  if (keuntungan < 0) warning += "\n⚠️ Transaksi rugi.";

  const saldoLines = [
    formatSaldoLine(state.akunKeluar, saldoKeluarSebelum, saldoKeluarSesudah, true),
    formatSaldoLine(state.akunMasuk, saldoMasukSebelum, saldoMasukSesudah, false),
  ].join("\n");

  return `✅ Transaksi tarik berhasil disimpan!

🧾 DETAIL:
Diterima di ${state.akunMasuk}: ${formatRupiah(state.jumlahMasuk)}
Dikeluarkan dari ${state.akunKeluar}: ${formatRupiah(state.jumlahKeluar)}
Keuntungan: ${formatRupiah(keuntungan)}

${saldoLines}

Tag: ${state.tag}
Catatan: ${state.catatan}${warning}`;
}

/* =========================
   PARSE ONE-LINE
========================= */

function parseOneLine(text) {
  const parts = text.split(/\s+/).filter(p => p.length > 0);
  for (let i = 0; i <= parts.length - 4; i++) {
    const s1 = parts[i];
    const s2 = parts[i + 1];
    if (s1.startsWith('/')) continue;
    const received = parseAmount(parts[i + 2]);
    const paid = parseAmount(parts[i + 3]);
    if (!isNaN(received) && !isNaN(paid) && 
        AKUN_LIST.includes(s1.toLowerCase()) && 
        AKUN_LIST.includes(s2.toLowerCase())) {
      const akunKeluar = OPTIONS.akun.find(a => a.toLowerCase() === s1.toLowerCase());
      const akunMasuk = OPTIONS.akun.find(a => a.toLowerCase() === s2.toLowerCase());
      return {
        akunKeluar,
        akunMasuk,
        jumlahMasuk: received,
        jumlahKeluar: paid,
        deskripsi: `Tarik ${parts[i + 2]}`,
        tag: "#tarik",
        catatan: "-",
      };
    }
  }
  return null;
}

async function showConfirmation(ctx, state) {
  const keuntungan = state.jumlahMasuk - state.jumlahKeluar;
  const masukInfo = getLastSaldo(state.rows, state.akunMasuk);
  const keluarInfo = getLastSaldo(state.rows, state.akunKeluar);

  let warning = "";
  if (keuntungan < 0) warning += "\n⚠️ Transaksi rugi.";
  if (state.akunMasuk === state.akunKeluar) warning += "\n⬅️ Akun tujuan dan sumber sama!";
  if (keluarInfo.saldo < state.jumlahKeluar) warning += "\n⚠️ Saldo sumber tidak mencukupi!";

  const saldoLines = [
    formatSaldoLine(state.akunKeluar, keluarInfo.saldo, keluarInfo.saldo - state.jumlahKeluar, true),
    formatSaldoLine(state.akunMasuk, masukInfo.saldo, masukInfo.saldo + state.jumlahMasuk, false),
  ].join("\n");

  const confirmText = `🧾 KONFIRMASI TARIK

Diterima di ${state.akunMasuk}: ${formatRupiah(state.jumlahMasuk)}
Dikeluarkan dari ${state.akunKeluar}: ${formatRupiah(state.jumlahKeluar)}
Keuntungan: ${formatRupiah(keuntungan)}

${saldoLines}

Tag: ${state.tag}
Catatan: ${state.catatan}${warning}

Lanjutkan?`;

  const msg = await ctx.reply(confirmText, kbConfirm());
  state.messageId = msg.message_id;
  states.set(ctx.from.id, state);
  return msg;
}

/* =========================
   COMMAND
========================= */

export default {
  name: "tarik",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const text = (ctx.message?.text || ctx.update?.message?.text || "").trim();

    // Handle one-line command: /tarik dana wallet 100K 95K
    const parsed = parseOneLine(text);
    if (parsed) {
      const rows = await fetchAllRows();
      const state = { ...parsed, rows, chatId: ctx.chat.id, step: "confirm" };
      return showConfirmation(ctx, state);
    }

    // Interactive mode
    const rows = await fetchAllRows();
    const msg = await ctx.reply("🔁 TARIK\n\nPilih akun TUJUAN (menerima uang):", {
      reply_markup: kbList(OPTIONS.akun, "tarik:akunMasuk", false, true),
    });

    states.set(ctx.from.id, {
      step: "akunMasuk",
      history: [],
      rows,
      chatId: ctx.chat.id,
      messageId: msg.message_id,
    });
  },

  async handleCallback(ctx) {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!ctx.callbackQuery?.data?.startsWith("tarik:")) return;

    const state = states.get(ctx.from.id);
    if (!state) return;

    const edit = (text, markup) =>
      safeEdit(ctx, state.chatId, state.messageId, text, markup);

    const data = ctx.callbackQuery.data;

    if (data === "tarik:cancel") {
      states.delete(ctx.from.id);
      return edit("❌ Transaksi dibatalkan.");
    }

    if (data === "tarik:back") {
      state.step = state.history.pop() || "akunMasuk";
      return this.render(ctx, state);
    }

    if (data === "tarik:save:ok") {
      const result = await saveTransaction(ctx, state);
      states.delete(ctx.from.id);
      return edit(result);
    }

    const [, step, value] = data.split(":");
    state.history.push(state.step);

    if (step === "akunMasuk") {
      state.akunMasuk = value;
      state.step = "akunKeluar";
      return this.render(ctx, state);
    }

    if (step === "akunKeluar") {
      state.akunKeluar = value;
      state.step = "jumlahMasuk";
      return this.render(ctx, state);
    }
  },

  async handleText(ctx) {
    const text = ctx.message?.text || "";

    // Handle one-line command in text mode
    const parsed = parseOneLine(text);
    if (parsed) {
      const rows = await fetchAllRows();
      const state = { ...parsed, rows, chatId: ctx.chat.id, step: "confirm" };
      return showConfirmation(ctx, state);
    }

    // Interactive mode
    const state = states.get(ctx.from.id);
    if (!state) return;

    await ctx.deleteMessage().catch(() => {});
    state.history.push(state.step);

    if (state.step === "jumlahMasuk") {
      const val = parseAmount(ctx.message.text);
      if (isNaN(val)) {
        return this.renderError(ctx, state, "❌ Format salah.\n\nContoh: 205K atau 205000");
      }
      state.jumlahMasuk = val;
      state.deskripsi = `Tarik ${ctx.message.text}`;
      state.tag = "#tarik";
      state.catatan = "-";
      state.step = "jumlahKeluar";
      return this.render(ctx, state);
    }

    if (state.step === "jumlahKeluar") {
      const val = parseAmount(ctx.message.text);
      if (isNaN(val)) {
        return this.renderError(ctx, state, "❌ Format salah.\n\nContoh: 200K atau 200000");
      }
      state.jumlahKeluar = val;
      state.step = "confirm";
    }

    return this.render(ctx, state);
  },

  async renderError(ctx, state, text) {
    return safeEdit(ctx, state.chatId, state.messageId, text, kbText(true));
  },

  async render(ctx, state) {
    const edit = (text, markup) =>
      safeEdit(ctx, state.chatId, state.messageId, text, markup);

    switch (state.step) {
      case "akunMasuk":
        return edit("🔁 TARIK\n\nPilih akun TUJUAN (menerima uang):",
          kbList(OPTIONS.akun, "tarik:akunMasuk", false, true));

      case "akunKeluar":
        return edit("Pilih akun SUMBER (mengeluarkan uang):",
          kbList(OPTIONS.akun, "tarik:akunKeluar", true, false));

      case "jumlahMasuk":
        return edit(
          `Masukkan jumlah yang DITERIMA di ${state.akunMasuk}.\n\nContoh: 205K atau 205000`,
          kbText(true));

      case "jumlahKeluar":
        return edit(
          `Masukkan jumlah yang DIKELUARKAN dari ${state.akunKeluar}.\n\n💡 Info:\nDiterima: ${formatRupiah(state.jumlahMasuk)}`,
          kbText(true));

      case "confirm": {
        const keuntungan = state.jumlahMasuk - state.jumlahKeluar;
        const masukInfo = getLastSaldo(state.rows, state.akunMasuk);
        const keluarInfo = getLastSaldo(state.rows, state.akunKeluar);
        const saldoMasukSebelum = masukInfo.saldo;
        const saldoMasukSesudah = saldoMasukSebelum + state.jumlahMasuk;
        const saldoKeluarSebelum = keluarInfo.saldo;
        const saldoKeluarSesudah = saldoKeluarSebelum - state.jumlahKeluar;

        let warning = "";
        if (keuntungan < 0) warning += "\n⚠️ Kayaknya rugi, cek lagi.";
        if (state.akunMasuk === state.akunKeluar) warning += "\n⬅️ Akun tujuan dan sumber sama!";
        if (saldoKeluarSesudah < 0) warning += "\n⚠️ Saldo sumber tidak mencukupi!";

        const saldoLines = [
          formatSaldoLine(state.akunKeluar, saldoKeluarSebelum, saldoKeluarSesudah, true),
          formatSaldoLine(state.akunMasuk, saldoMasukSebelum, saldoMasukSesudah, false),
        ].join("\n");

        const confirmText = `🧾 KONFIRMASI TARIK

Diterima di ${state.akunMasuk}: ${formatRupiah(state.jumlahMasuk)}
Dikeluarkan dari ${state.akunKeluar}: ${formatRupiah(state.jumlahKeluar)}
Keuntungan: ${formatRupiah(keuntungan)}

${saldoLines}

Tag: ${state.tag}
Catatan: ${state.catatan}${warning}

Lanjutkan?`;

        return edit(confirmText, kbConfirm());
      }
    }
  },
};