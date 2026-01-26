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
      return {
        mataUang: "Rp",
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
  const buttons = list.map((v) => [{ text: v, callback_data: `${prefix}:${v}` }]);
  const footer = [];

  if (showBack) footer.push({ text: "⬅️ Back", callback_data: "sellpulsa:back" });
  if (showCancel)
    footer.push({ text: "❌ Cancel", callback_data: "sellpulsa:cancel" });

  if (footer.length > 0) buttons.push(footer);
  return { inline_keyboard: buttons };
};

const kbText = (showBack = false) => {
  if (showBack) {
    return { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "sellpulsa:back" }]] };
  }
  return { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "sellpulsa:cancel" }]] };
};

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
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;
    const rows = await fetchAllRows();
    const msg = await ctx.reply(
      "🔁 Jual Pulsa / Top-up\n\nPilih akun penerima pembayaran:",
      {
        reply_markup: kbList(OPTIONS.akun, "sellpulsa:akunMasuk", false, true),
      }
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
    await ctx.answerCallbackQuery().catch(() => {});

    if (!ctx.callbackQuery?.data?.startsWith("sellpulsa:")) return;

    const state = states.get(ctx.from.id);
    if (!state) return;

    const edit = (text, markup) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        reply_markup: markup,
      });

    const data = ctx.callbackQuery.data;

    if (data === "sellpulsa:cancel") {
      states.delete(ctx.from.id);
      return edit("❌ Transaksi dibatalkan.");
    }

    if (data === "sellpulsa:back") {
      state.step = state.history.pop() || "akunMasuk";
      return this.render(ctx, state);
    }

    const [, step, value] = data.split(":");

    // Simpan riwayat sebelum update langkah
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
      const akunMasukInfo = getLastSaldo(state.rows, state.akunMasuk);
      const akunKeluarInfo = getLastSaldo(state.rows, state.akunKeluar);

      if (akunKeluarInfo.saldo < state.jumlahKeluar) {
        return edit("❌ Saldo dompet tidak mencukupi untuk transaksi ini.");
      }

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
          akunKeluarInfo.saldo,
          akunKeluarInfo.saldo - state.jumlahKeluar,
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
          akunMasukInfo.saldo,
          akunMasukInfo.saldo + state.jumlahMasuk,
          state.tag,
          state.catatan,
          now,
          now,
        ],
      ];

      await appendRows(entries);

      const keuntungan = state.jumlahMasuk - state.jumlahKeluar;
      const successText = `✅ Transaksi jual pulsa berhasil disimpan!

🧾 DETAIL:
Deskripsi: ${state.deskripsi}
Pembeli bayar: ${formatRupiah(state.jumlahMasuk)}
Kamu keluarkan: ${formatRupiah(state.jumlahKeluar)}
Keuntungan: ${formatRupiah(keuntungan)}

Akun Masuk: ${state.akunMasuk} (Cash)
Akun Keluar: ${state.akunKeluar} (Transfer)

Tag: ${state.tag}
Catatan: ${state.catatan}`;

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
      state.step = "jumlahMasuk";
    } else if (state.step === "jumlahMasuk") {
      state.jumlahMasuk = toNumber(ctx.message.text);
      state.step = "jumlahKeluar";
    } else if (state.step === "jumlahKeluar") {
      state.jumlahKeluar = toNumber(ctx.message.text);
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

    switch (state.step) {
      case "akunMasuk":
        return edit(
          "🔁 Jual Pulsa / Top-up\n\nPilih akun penerima pembayaran:",
          kbList(OPTIONS.akun, "sellpulsa:akunMasuk", false, true)
        );
      case "akunKeluar":
        return edit(
          "Pilih akun pengeluaran (dompet pulsa):",
          kbList(OPTIONS.akun, "sellpulsa:akunKeluar", true, false)
        );
      case "deskripsi":
        return edit("Masukkan deskripsi transaksi (misal: Pulsa Tri 20k):", kbText(true));
      case "jumlahMasuk":
        return edit("Masukkan jumlah DITERIMA dari pembeli:", kbText(true));
      case "jumlahKeluar":
        return edit("Masukkan jumlah DIBERIKAN ke pembeli (nilai pulsa):", kbText(true));
      case "tag":
        return edit("Masukkan tag (misal: Pulsa, Gopay, dll):", kbText(true));
      case "catatan":
        return edit("Masukkan catatan tambahan:", kbText(true));
      case "confirm": {
        const keuntungan = state.jumlahMasuk - state.jumlahKeluar;
        const confirmText = `🧾 KONFIRMASI JUAL PULSA

Deskripsi: ${state.deskripsi}
Pembeli bayar: ${formatRupiah(state.jumlahMasuk)}
Kamu keluarkan: ${formatRupiah(state.jumlahKeluar)}
Keuntungan: ${formatRupiah(keuntungan)}

Akun Masuk: ${state.akunMasuk}
Akun Keluar: ${state.akunKeluar}

Tag: ${state.tag}
Catatan: ${state.catatan}

Lanjutkan?`;
        return edit(confirmText, kbConfirm());
      }
    }
  },
};
