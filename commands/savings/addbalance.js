import { google } from "googleapis";

/* =========================
   PILIHAN (BISA DITAMBAH)
========================= */
const OPTIONS = {
  jenis: ["Pemasukan", "Pengeluaran", "Transfer"],

  kategori: {
    Pengeluaran: [
      "Makanan",
      "Transportasi",
      "Hiburan",
      "Utilitas",
      "Pendidikan",
      "Belanja",
    ],
    Pemasukan: ["Gaji", "Usaha", "Investasi", "Hadiah", "Refund"],
    Transfer: ["Internal"],
  },

  subKategori: {
    Pengeluaran: {
      Makanan: ["Makan Harian", "Jajan", "Kopi"],
      Transportasi: ["Bensin", "Ojol", "Parkir"],
      Hiburan: ["Game", "Streaming"],
      Utilitas: ["Internet", "Listrik", "Pulsa"],
      Pendidikan: ["Kursus", "Buku"],
      Belanja: ["Online", "Offline", "Langganan"],
    },

    Pemasukan: {
      Gaji: ["Gaji Bulanan", "Bonus", "THR"],
      Usaha: ["Penjualan", "Jasa", "Komisi"],
      Investasi: ["Crypto", "Saham", "Dividen"],
      Hadiah: ["Uang Saku", "Hadiah", "Donasi"],
      Refund: ["Refund Belanja", "Cashback"],
    },

    Transfer: {
      Internal: ["Wallet", "Dana", "Seabank", "Fjlsaldo"],
    },
  },

  akun: ["Wallet", "Dana", "Seabank", "Bank", "Binance", "Fjlsaldo"],
  metode: ["Cash", "Transfer", "QRIS", "Debit", "Virtual Account"],
};

/* =========================
   UTIL
========================= */
function toNumber(val) {
  return Number(String(val).replace(/\./g, "").replace(",", "."));
}

function keyboard(list, prefix) {
  return {
    inline_keyboard: [
      ...list.map((v) => [{ text: v, callback_data: `${prefix}:${v}` }]),
      [
        {
          text: "➕ Lainnya (ketik manual)",
          callback_data: `${prefix}:manual`,
        },
      ],
      [{ text: "❌ Cancel", callback_data: "addbalance:cancel" }],
    ],
  };
}

/* =========================
   STATE
========================= */
const states = new Map();

/* =========================
   GOOGLE SHEETS CLIENT
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

/* =========================
   AMBIL SALDO TERAKHIR (K)
========================= */
async function getLastSaldo(akun) {
  const sheets = sheetsClient();

  // Ambil SEMUA data baris (A–O)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:N",
  });

  const rows = res.data.values || [];
  if (!rows.length) return 0;

  // Cari dari bawah (transaksi terakhir)
  for (let i = rows.length - 1; i >= 0; i--) {
    const akunRow = rows[i][6]; // G = Akun
    const saldoAfter = rows[i][9]; // J = Saldo Setelah

    if (akunRow === akun) {
      return Number(saldoAfter) || 0;
    }
  }

  // Belum pernah ada transaksi akun ini
  return 0;
}

/* =========================
   SIMPAN TRANSAKSI
========================= */
async function saveTransaction(data) {
  const sheets = sheetsClient();
  const now = new Date().toISOString();

  const saldoSebelum = await getLastSaldo(data.akun);

  const saldoSesudah =
    data.jenis === "Pemasukan"
      ? saldoSebelum + data.jumlah
      : saldoSebelum - data.jumlah;

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A:O",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          data.jenis, // A
          data.kategori, // B
          data.subKategori, // C
          data.deskripsi, // D
          data.jumlah, // E
          data.mataUang, // F
          data.akun, // G
          data.metode, // H
          saldoSebelum, // I
          saldoSesudah, // J
          data.tag, // K
          data.catatan, // L
          now, // M
          now, // N
        ],
      ],
    },
  });
}

/* =========================
   COMMAND
========================= */
export default {
  name: "addbalance",

  async execute(ctx) {
    states.set(ctx.from.id, { step: "jenis" });

    await ctx.reply("Pilih jenis transaksi:", {
      reply_markup: keyboard(OPTIONS.jenis, "addbalance:jenis"),
    });
  },

  async handleCallback(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    const [, step, value] = ctx.callbackQuery.data.split(":");

    if (step === "cancel") {
      states.delete(ctx.from.id);
      return ctx.editMessageText("❌ Proses dibatalkan.");
    }

    if (value === "manual") {
      state.step = step;
      return ctx.editMessageText(`Masukkan ${step} secara manual:`);
    }

    state[step] = value;

    if (step === "jenis") {
      state.step = "kategori";

      return ctx.editMessageText("Pilih kategori:", {
        reply_markup: keyboard(
          OPTIONS.kategori[state.jenis],
          "addbalance:kategori"
        ),
      });
    }

    if (step === "kategori") {
      state.step = "subKategori";

      return ctx.editMessageText("Pilih sub kategori:", {
        reply_markup: keyboard(
          OPTIONS.subKategori[state.jenis][state.kategori],
          "addbalance:subKategori"
        ),
      });
    }

    if (step === "subKategori") {
      state.step = "deskripsi";
      return ctx.editMessageText("Masukkan deskripsi:");
    }

    if (step === "akun") {
      state.step = "metode";
      return ctx.editMessageText("Pilih metode:", {
        reply_markup: keyboard(OPTIONS.metode, "addbalance:metode"),
      });
    }

    if (step === "metode") {
      state.step = "tag";
      return ctx.editMessageText(
        "Label fleksibel untuk filter cepat & analisis tambahan\nMasukkan tag:"
      );
    }
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    const text = ctx.message.text;

    switch (state.step) {
      case "deskripsi":
        state.deskripsi = text;
        state.step = "jumlah";
        return ctx.reply("Masukkan jumlah (contoh: 10.000)");

      case "jumlah":
        state.jumlah = toNumber(text);
        state.step = "mataUang";
        return ctx.reply("Masukkan mata uang (IDR / USD / USDT)");

      case "mataUang":
        state.mataUang = text.toUpperCase();
        state.step = "akun";
        return ctx.reply("Pilih akun:", {
          reply_markup: keyboard(OPTIONS.akun, "addbalance:akun"),
        });

      case "tag":
        state.tag = text;
        state.step = "catatan";
        return ctx.reply(
          "Info tambahan yang tidak perlu sering dipakai\nMasukkan catatan:"
        );

      case "catatan":
        state.catatan = text;

        await saveTransaction(state);
        states.delete(ctx.from.id);

        return ctx.reply("✅ Transaksi berhasil disimpan");
    }
  },
};
