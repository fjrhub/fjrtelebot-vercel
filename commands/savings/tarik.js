import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */

const OPTIONS = {
  // Menambahkan "Cash" ke dalam opsi agar bisa dipilih sebagai akun keluar
  akun: ["Cash", "Wallet", "Dana", "Seabank", "Bank", "Fjlsaldo", "Gopay"],
};

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
    [{ text: "⬅️ Back", callback_data: "tarik:back" }],
    [{ text: "❌ Cancel", callback_data: "tarik:cancel" }],
  ],
});

/* =========================
   COMMAND
========================= */

export default {
  name: "tarik",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const rows = await fetchAllRows();

    const msg = await ctx.reply("🔁 TARIK\n\nPilih akun penerima pembayaran (Pemasukan):", {
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

    const parts = data.split(":");
    const step = parts[1];
    const value = parts.slice(2).join(":");
    state.history.push(state.step);

    if (step === "akunMasuk") {
      state.akunMasuk = value;
      state.step = "akunKeluar";
      return this.render(ctx, state);
    }

    if (step === "akunKeluar") {
      state.akunKeluar = value;
      state.step = "deskripsi";
      return this.render(ctx, state);
    }

    if (step === "save") {
      const now = new Date().toISOString();

      if (state.akunMasuk === state.akunKeluar) {
        return edit("❌ Akun masuk dan keluar tidak boleh sama.");
      }

      const akunMasukInfo = getLastSaldo(state.rows, state.akunMasuk);
      const akunKeluarInfo = getLastSaldo(state.rows, state.akunKeluar);

      if (akunKeluarInfo.saldo < state.jumlahKeluar) {
        return edit("❌ Saldo dompet tidak mencukupi.");
      }

      const saldoMasukSebelum = akunMasukInfo.saldo;
      const saldoMasukSesudah = saldoMasukSebelum + state.jumlahMasuk;
      const saldoKeluarSebelum = akunKeluarInfo.saldo;
      const saldoKeluarSesudah = saldoKeluarSebelum - state.jumlahKeluar;

      // Logika dinamis untuk menentukan metode pembayaran
      const methodMasuk = state.akunMasuk.toLowerCase() === "cash" ? "Cash" : "Transfer";
      const methodKeluar = state.akunKeluar.toLowerCase() === "cash" ? "Cash" : "Transfer";

      const entries = [
        [
          "Pengeluaran",
          "Usaha",
          "Penjualan",
          state.deskripsi,
          state.jumlahKeluar,
          "Rp",
          state.akunKeluar,
          methodKeluar,
          saldoKeluarSebelum,
          saldoKeluarSesudah,
          state.tag,
          state.catatan,
          now,
          now,
        ],
        [
          "Pemasukan",
          "Usaha",
          "Penjualan",
          state.deskripsi,
          state.jumlahMasuk,
          "Rp",
          state.akunMasuk,
          methodMasuk,
          saldoMasukSebelum,
          saldoMasukSesudah,
          state.tag,
          state.catatan,
          now,
          now,
        ],
      ];

      await appendRows(entries);

      const keuntungan = state.jumlahMasuk - state.jumlahKeluar;
      let warning = "";
      if (keuntungan < 0) warning += "\n⚠️ Transaksi rugi.";

      const saldoLines = [
        formatSaldoLine(state.akunKeluar, saldoKeluarSebelum, saldoKeluarSesudah, true),
        formatSaldoLine(state.akunMasuk, saldoMasukSebelum, saldoMasukSesudah, false),
      ].join("\n");

      const successText = `✅ Transaksi tarik berhasil disimpan!

🧾 DETAIL:
Deskripsi: ${state.deskripsi}
Diterima (${state.akunMasuk}): ${formatRupiah(state.jumlahMasuk)}
Dikeluarkan (${state.akunKeluar}): ${formatRupiah(state.jumlahKeluar)}
Keuntungan: ${formatRupiah(keuntungan)}

Akun Masuk: ${state.akunMasuk}
Akun Keluar: ${state.akunKeluar}

${saldoLines}

Tag: ${state.tag}
Catatan: ${state.catatan}${warning}`;

      states.delete(ctx.from.id);
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
      const trimmed = ctx.message.text.trim();
      const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
      state.tag = firstWord ? `#${firstWord}` : "-";
      state.catatan = "-";
      state.step = "jumlahMasuk";
      return this.render(ctx, state);
    } 
    
    // Step input nominal yang diterima (Fleksibel)
    else if (state.step === "jumlahMasuk") {
      const val = parseAmount(ctx.message.text);
      if (isNaN(val)) {
        return this.renderError(ctx, state, "❌ Format salah.\n\nContoh: 200K atau 100000");
      }
      state.jumlahMasuk = val;
      state.step = "jumlahKeluar";
      return this.render(ctx, state);
    } 
    
    // Step input nominal yang dikeluarkan (Fleksibel)
    else if (state.step === "jumlahKeluar") {
      const val = parseAmount(ctx.message.text);
      if (isNaN(val)) {
        return this.renderError(ctx, state, "❌ Format salah.\n\nContoh: 195K atau 100000");
      }
      state.jumlahKeluar = val;
      state.step = "confirm";
      return this.render(ctx, state);
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
        return edit(
          "🔁 TARIK\n\nPilih akun penerima pembayaran (Pemasukan):",
          kbList(OPTIONS.akun, "tarik:akunMasuk", false, true),
        );

      case "akunKeluar":
        return edit(
          "Pilih akun pengeluaran (Pengeluaran):",
          kbList(OPTIONS.akun, "tarik:akunKeluar", true, false),
        );

      case "deskripsi":
        return edit(
          "Masukkan deskripsi transaksi.\n\nContoh:\nJual pulsa 200K",
          kbText(true),
        );

      case "jumlahMasuk":
        return edit(
          `Masukkan nominal yang DITERIMA (Pemasukan).

💡 Akun masuk: ${state.akunMasuk}
Contoh: 200K`,
          kbText(true),
        );

      case "jumlahKeluar":
        return edit(
          `Masukkan nominal yang DIKELUARKAN (Pengeluaran).

💡 Akun keluar: ${state.akunKeluar}
💡 Pemasukan: ${formatRupiah(state.jumlahMasuk)}
Contoh: 195K`,
          kbText(true),
        );

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
        if (state.akunMasuk === state.akunKeluar) {
          warning += "\n⬅️ Akun masuk dan keluar sama!";
        }
        if (saldoKeluarSesudah < 0) {
          warning += "\n⚠️ Saldo keluar tidak mencukupi!";
        }

        const saldoLines = [
          formatSaldoLine(state.akunKeluar, saldoKeluarSebelum, saldoKeluarSesudah, true),
          formatSaldoLine(state.akunMasuk, saldoMasukSebelum, saldoMasukSesudah, false),
        ].join("\n");

        const confirmText = `🧾 KONFIRMASI TARIK

Deskripsi: ${state.deskripsi}
Diterima (${state.akunMasuk}): ${formatRupiah(state.jumlahMasuk)}
Dikeluarkan (${state.akunKeluar}): ${formatRupiah(state.jumlahKeluar)}
Keuntungan: ${formatRupiah(keuntungan)}

Akun Masuk: ${state.akunMasuk}
Akun Keluar: ${state.akunKeluar}

${saldoLines}

Tag: ${state.tag}
Catatan: ${state.catatan}${warning}

Lanjutkan?`;

        return edit(confirmText, kbConfirm());
      }
    }
  },
};