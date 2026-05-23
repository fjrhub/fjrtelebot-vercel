import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */

const OPTIONS = {
  akun: ["Wallet", "Dana", "Seabank", "Bank", "Fjlsaldo", "Gopay"],
};

const TOKEN_FEE = 3000;

/* =========================
   STATE
========================= */

const states = new Map();

/* =========================
   UTIL
========================= */

const toNumber = (v) =>
  Number(String(v).replace(/\./g, "").replace(",", "."));

const formatRupiah = (n) => {
  const abs = Math.abs(n).toLocaleString("id-ID");
  return n < 0 ? `-Rp${abs}` : `Rp${abs}`;
};

// 🔥 Helper format saldo change dengan ikon + spasi di panah
const formatSaldoLine = (akun, before, after, isKeluar) => {
  const icon = isKeluar ? "💸" : "💰";
  return `${icon} ${akun}: ${formatRupiah(before)} → ${formatRupiah(after)}`;
};

function parseSellText(text) {
  const trimmed = text.trim();
  const firstWord = trimmed.split(" ")[0].toLowerCase();

  const amountMatch = trimmed.match(
    /(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)?/i,
  );

  if (!amountMatch) return null;

  let amount = parseFloat(
    amountMatch[1]
      .replace(/\./g, "")
      .replace(",", "."),
  );

  const suffix = amountMatch[2]?.toLowerCase();

  if (["k", "rb", "ribu"].includes(suffix)) amount *= 1000;
  if (["jt", "juta"].includes(suffix)) amount *= 1000000;

  return {
    nominal: Math.round(amount),
    tag: `#${firstWord}`,
  };
}

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
  if (showBack) footer.push({ text: "⬅️ Back", callback_data: "sell:back" });
  if (showCancel) footer.push({ text: "❌ Cancel", callback_data: "sell:cancel" });
  if (footer.length > 0) buttons.push(footer);
  return { inline_keyboard: buttons };
};

const kbText = (showBack = false) => {
  if (showBack) {
    return {
      inline_keyboard: [
        [{ text: "⬅️ Back", callback_data: "sell:back" }],
      ],
    };
  }
  return {
    inline_keyboard: [
      [{ text: "❌ Cancel", callback_data: "sell:cancel" }],
    ],
  };
};

const kbConfirm = () => ({
  inline_keyboard: [
    [{ text: "✅ Simpan", callback_data: "sell:save:ok" }],
    [{ text: "⬅️ Back", callback_data: "sell:back" }],
    [{ text: "❌ Cancel", callback_data: "sell:cancel" }],
  ],
});

/* =========================
   COMMAND
========================= */

export default {
  name: "sell",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const rows = await fetchAllRows();

    const msg = await ctx.reply("🔁 SELL\n\nPilih akun penerima pembayaran:", {
      reply_markup: kbList(OPTIONS.akun, "sell:akunMasuk", false, true),
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

    if (!ctx.callbackQuery?.data?.startsWith("sell:")) return;

    const state = states.get(ctx.from.id);
    if (!state) return;

    const edit = (text, markup) =>
      safeEdit(ctx, state.chatId, state.messageId, text, markup);

    const data = ctx.callbackQuery.data;

    if (data === "sell:cancel") {
      states.delete(ctx.from.id);
      return edit("❌ Transaksi dibatalkan.");
    }

    if (data === "sell:back") {
      state.step = state.history.pop() || "akunMasuk";
      return this.render(ctx, state);
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

      const entries = [
        [
          "Pengeluaran",
          "Usaha",
          "Penjualan",
          state.deskripsi,
          state.jumlahKeluar,
          "Rp",
          state.akunKeluar,
          "Transfer",
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
          "Cash",
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

      // 🔥 Saldo lines untuk success message
      const saldoLines = [
        formatSaldoLine(state.akunKeluar, saldoKeluarSebelum, saldoKeluarSesudah, true),
        formatSaldoLine(state.akunMasuk, saldoMasukSebelum, saldoMasukSesudah, false),
      ].join("\n");

      const successText = `✅ Transaksi jual pulsa berhasil disimpan!

🧾 DETAIL:
Deskripsi: ${state.deskripsi}
Pembeli bayar: ${formatRupiah(state.jumlahMasuk)}
Kamu keluarkan: ${formatRupiah(state.jumlahKeluar)}
Keuntungan: ${formatRupiah(keuntungan)}

Akun Masuk: ${state.akunMasuk} (Cash)
Akun Keluar: ${state.akunKeluar} (Transfer)

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

      const parsed = parseSellText(ctx.message.text);
      if (!parsed) {
        return this.renderError(ctx, state, "❌ Format salah.\n\nContoh:\nDana 20K");
      }

      state.tag = parsed.tag;
      state.catatan = "-";

      const descLower = state.deskripsi.toLowerCase();
      const isToken = /token/i.test(descLower);
      const isTarik = /tarik/i.test(descLower);

      // 🎯 LOGIKA BARU:
      if (isTarik) {
        // 🔹 Alur "tarik": parsed = jumlah yang masuk (setelah fee), lalu input manual jumlah keluar
        state.jumlahMasuk = parsed.nominal;
        state.step = "jumlahKeluar";
      } else if (state.akunKeluar === "Fjlsaldo") {
        // 🔹 Fjlsaldo: parsed = jumlah masuk, lalu input manual jumlah keluar
        state.jumlahMasuk = parsed.nominal;
        state.step = "jumlahKeluar";
      } else if (state.akunKeluar === "Seabank" && isToken) {
        // 🔹 Token via Seabank: auto tambah fee, parsed + TOKEN_FEE = jumlah masuk
        state.jumlahMasuk = parsed.nominal + TOKEN_FEE;
        state.step = "jumlahKeluar";
      } else {
        // 🔹 Default (jual pulsa biasa): parsed = jumlah keluar (modal), lalu input manual jumlah masuk
        state.jumlahKeluar = parsed.nominal;
        state.step = "jumlahMasuk";
      }
    } else if (state.step === "jumlahKeluar") {
      state.jumlahKeluar = toNumber(ctx.message.text);
      state.step = "confirm";
    } else if (state.step === "jumlahMasuk") {
      state.jumlahMasuk = toNumber(ctx.message.text);
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
        return edit(
          "🔁 SELL\n\nPilih akun penerima pembayaran:",
          kbList(OPTIONS.akun, "sell:akunMasuk", false, true),
        );

      case "akunKeluar":
        return edit(
          "Pilih akun pengeluaran:",
          kbList(OPTIONS.akun, "sell:akunKeluar", true, false),
        );

      case "deskripsi":
        return edit(
          "Masukkan deskripsi.\n\nContoh:\n• Tarik Dana 100K\n• Token Seabank 50K\n• Jual Pulsa 20K",
          kbText(true),
        );

      case "jumlahKeluar":
        return edit(
          `Masukkan MODAL / jumlah yang kamu keluarkan.

💡 Dari deskripsi "${state.deskripsi}":
• Diterima (estimasi): ${formatRupiah(state.jumlahMasuk)}
• Tag: ${state.tag}

💬 Ketik nominal keluar, contoh: 95000 atau 95K`,
          kbText(true),
        );

      case "jumlahMasuk":
        return edit(
          `Masukkan jumlah DITERIMA dari pembeli.

💡 Dari deskripsi "${state.deskripsi}":
• Kamu keluarkan (estimasi): ${formatRupiah(state.jumlahKeluar)}
• Tag: ${state.tag}

💬 Ketik nominal masuk, contoh: 103000 atau 103K`,
          kbText(true),
        );

      case "confirm": {
        const keuntungan = state.jumlahMasuk - state.jumlahKeluar;

        // 🔥 Fetch saldo untuk display
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

        // 🔥 Saldo lines dua baris sejajar, tanpa indentasi
        const saldoLines = [
          formatSaldoLine(state.akunKeluar, saldoKeluarSebelum, saldoKeluarSesudah, true),
          formatSaldoLine(state.akunMasuk, saldoMasukSebelum, saldoMasukSesudah, false),
        ].join("\n");

        const confirmText = `🧾 KONFIRMASI SELL

Deskripsi: ${state.deskripsi}
Pembeli bayar: ${formatRupiah(state.jumlahMasuk)}
Kamu keluarkan: ${formatRupiah(state.jumlahKeluar)}
Keuntungan: ${formatRupiah(keuntungan)}

Akun Masuk: ${state.akunMasuk} (Cash)
Akun Keluar: ${state.akunKeluar} (Transfer)

${saldoLines}

Tag: ${state.tag}
Catatan: ${state.catatan}${warning}

Lanjutkan?`;

        return edit(confirmText, kbConfirm());
      }
    }
  },
};