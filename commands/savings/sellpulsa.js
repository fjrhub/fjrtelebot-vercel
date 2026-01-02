import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */
const OPTIONS = {
  akun: ["Wallet", "Dana", "Seabank", "Bank", "Binance", "Fjlsaldo"],
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
const kbList = (list, step) => ({
  inline_keyboard: list.map((v) => [
    { text: v, callback_data: `sellpulsa:${step}:${v}` },
  ]),
});

/* =========================
   COMMAND
========================= */
export default {
  name: "sellpulsa",

  async execute(ctx) {
    const rows = await fetchAllRows();

    const msg = await ctx.reply(
      "🔁 Jual Pulsa / Top-up\n\nPilih akun penerima pembayaran:",
      {
        reply_markup: kbList(OPTIONS.akun, "akunMasuk"),
      }
    );

    states.set(ctx.from.id, {
      step: "akunMasuk",
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

    const [, step, value] = ctx.callbackQuery.data.split(":");

    const edit = (text, markup) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        reply_markup: markup,
      });

    if (step === "akunMasuk") {
      state.akunMasuk = value;
      state.step = "akunKeluar";
      return edit(
        "Pilih akun pengeluaran (dompet pulsa):",
        kbList(OPTIONS.akun, "akunKeluar")
      );
    }

    if (step === "akunKeluar") {
      state.akunKeluar = value;
      state.step = "deskripsi";
      return edit("Masukkan deskripsi transaksi (misal: Pulsa Tri 20k):");
    }

    if (step === "save") {
      const now = new Date().toISOString();

      const akunMasukInfo = getLastSaldo(state.rows, state.akunMasuk);
      const akunKeluarInfo = getLastSaldo(state.rows, state.akunKeluar);

      if (akunKeluarInfo.saldo < state.jumlahKeluar) {
        return edit("❌ Saldo dompet tidak mencukupi untuk transaksi ini.");
      }

      // 🔁 URUTAN: PENGELUARAN DULU (kirim ke pembeli = Transfer), lalu PEMASUKAN (masuk ke dompet = Cash)
      const entries = [
        // 1. Pengeluaran → Transfer (kirim pulsa via e-wallet)
        [
          "Pengeluaran",
          "Usaha",
          "Penjualan",
          state.deskripsi,
          state.jumlahKeluar,
          "Rp",
          state.akunKeluar,
          "Transfer", // keluar ke pembeli = transfer
          akunKeluarInfo.saldo,
          akunKeluarInfo.saldo - state.jumlahKeluar,
          state.tag,
          state.catatan,
          now,
          now,
        ],
        // 2. Pemasukan → Cash (uang masuk ke dompet kamu)
        [
          "Pemasukan",
          "Usaha",
          "Penjualan",
          state.deskripsi,
          state.jumlahMasuk,
          "Rp",
          state.akunMasuk,
          "Cash", // masuk ke dompet = cash
          akunMasukInfo.saldo,
          akunMasukInfo.saldo + state.jumlahMasuk,
          state.tag,
          state.catatan,
          now,
          now,
        ],
      ];

      await appendRows(entries);

      // ✅ Detail sukses tanpa emoji, format Rp10.000
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

    if (step === "cancel") {
      states.delete(ctx.from.id);
      return edit("❌ Transaksi dibatalkan.");
    }
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    await ctx.deleteMessage().catch(() => {});

    const edit = (text, markup) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        reply_markup: markup,
      });

    if (state.step === "deskripsi") {
      state.deskripsi = ctx.message.text;
      state.step = "jumlahMasuk";
      return edit("Masukkan jumlah DITERIMA dari pembeli:");
    }

    if (state.step === "jumlahMasuk") {
      state.jumlahMasuk = toNumber(ctx.message.text);
      state.step = "jumlahKeluar";
      return edit("Masukkan jumlah DIBERIKAN ke pembeli (nilai pulsa):");
    }

    if (state.step === "jumlahKeluar") {
      state.jumlahKeluar = toNumber(ctx.message.text);
      state.step = "tag";
      return edit("Masukkan tag (misal: Pulsa, Gopay, dll):");
    }

    if (state.step === "tag") {
      state.tag = ctx.message.text;
      state.step = "catatan";
      return edit("Masukkan catatan tambahan:");
    }

    if (state.step === "catatan") {
      state.catatan = ctx.message.text;
      state.step = "confirm";

      const akunMasukInfo = getLastSaldo(state.rows, state.akunMasuk);
      const akunKeluarInfo = getLastSaldo(state.rows, state.akunKeluar);
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

      return edit(confirmText, {
        inline_keyboard: [
          [{ text: "✅ Simpan", callback_data: "sellpulsa:save:ok" }],
          [{ text: "❌ Batal", callback_data: "sellpulsa:cancel" }],
        ],
      });
    }
  },
};
