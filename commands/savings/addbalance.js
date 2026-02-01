import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */
const OPTIONS = {
  jenis: ["Pemasukan", "Pengeluaran"],

  kategori: {
    Pengeluaran: [
      "Makanan",
      "Transportasi",
      "Hiburan",
      "Utilitas",
      "Pendidikan",
      "Belanja",
      "Investasi",
      "Lainnya",
    ],
    Pemasukan: ["Gaji", "Usaha", "Investasi", "Hadiah", "Refund", "Lainnya"],
  },

  subKategori: {
    Pengeluaran: {
      Makanan: ["Makan Harian", "Jajan", "Kopi", "Minuman"],
      Transportasi: ["Bensin", "Ojol", "Parkir", "Servis", "Darurat"],
      Hiburan: ["Game", "Streaming"],
      Utilitas: ["Internet", "Listrik", "Pulsa"],
      Pendidikan: [
        "Buku",
        "Fotokopi",
        "ATK",
        "Print",
        "Foto Dokumen",
        "Modul",
        "Iuran Sekolah",
      ],
      Belanja: ["Online", "Offline", "Langganan"],
      Investasi: ["Crypto", "Saham", "Emas", "Reksa Dana"],
      Lainnya: ["Uang Kas", "Kewajiban", "Pengeluaran Rutin", "Pengeluaran Lain"],
    },

    Pemasukan: {
      Gaji: ["Gaji Bulanan", "Bonus", "THR"],
      Usaha: ["Penjualan", "Jasa", "Komisi"],
      Investasi: ["Crypto", "Saham", "Dividen", "Bunga Bank"],
      Hadiah: ["Uang Saku", "Hadiah", "Donasi"],
      Refund: ["Refund Belanja", "Cashback"],
      Lainnya: ["Uang Saku", "Bantuan", "Pemasukan Lain"],
    },
  },

  akun: ["Wallet", "Dana", "Gopay", "Seabank", "Bank", "Binance", "Fjlsaldo"],

  metode: ["Cash", "Transfer", "QRIS", "Debit", "Virtual Account"],

  mataUang: ["Rp", "USDT"],
};

/* =========================
   STATE
========================= */
const states = new Map();

/* =========================
   UTIL
========================= */

// input user → angka asli (menghapus titik pemisah ribuan)
const parseInputAmount = (text) => {
  if (!text) return 0;
  const cleanedText = String(text).replace(/\./g, "").replace(",", ".");
  return Number(cleanedText);
};

// dari spreadsheet → USDT atau Rp
const sheetToAmount = (value, currency) => {
  if (currency === "USDT") {
    return Number(value || 0) / 1000;
  }
  return Number(value || 0);
};

// USDT atau Rp → spreadsheet
const amountToSheet = (amount, currency) => {
  if (currency === "USDT") {
    return Math.round(Number(amount) * 1000);
  }
  return Math.round(Number(amount));
};

const formatAmount = (amount, currency) => {
  if (currency === "USDT") {
    return `${Number(amount).toLocaleString("id-ID", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    })} USDT`;
  }
  if (currency === "Rp") {
    return `Rp${new Intl.NumberFormat("id-ID").format(Math.round(amount))}`;
  }
  return `${amount} ${currency}`;
};

/* =========================
   KEYBOARD
========================= */
const kbJenisAwal = () => ({
  inline_keyboard: [
    ...OPTIONS.jenis.map((v) => [
      { text: v, callback_data: `addbalance:jenis:${v}` },
    ]),
    [{ text: "❌ Cancel", callback_data: "addbalance:cancel" }],
  ],
});

const kbList = (list, prefix) => ({
  inline_keyboard: [
    ...list.map((v) => [{ text: v, callback_data: `${prefix}:${v}` }]),
    [{ text: "⬅️ Back", callback_data: "addbalance:back" }],
  ],
});

const kbText = () => ({
  inline_keyboard: [[{ text: "⬅️ Back", callback_data: "addbalance:back" }]],
});

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

async function fetchAllRows() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!F2:J",
  });
  return res.data.values || [];
}

function getLastFromCache(rows, akun) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][1] === akun) {
      const mataUang = rows[i][0] || null;
      const saldo = sheetToAmount(rows[i][4], mataUang);
      return { mataUang, saldo };
    }
  }
  return { saldo: 0, mataUang: null };
}

async function appendTransaction(data) {
  const sheets = sheetsClient();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A:O",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          data.jenis,
          data.kategori,
          data.subKategori,
          data.deskripsi,
          amountToSheet(data.jumlah, data.mataUang),
          data.mataUang,
          data.akun,
          data.metode,
          amountToSheet(data.saldoSebelum, data.mataUang),
          amountToSheet(data.saldoSesudah, data.mataUang),
          data.tag,
          data.catatan,
          now,
          now,
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
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;
    const rows = await fetchAllRows();
    const msg = await ctx.reply("Pilih jenis transaksi:", {
      reply_markup: kbJenisAwal(),
    });
    states.set(ctx.from.id, {
      step: "jenis",
      history: [],
      rows,
      chatId: ctx.chat.id,
      messageId: msg.message_id,
    });
  },

  async handleCallback(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;
    const data = ctx.callbackQuery.data;
    const edit = (text, kb) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        reply_markup: kb,
      });

    if (data === "addbalance:cancel") {
      states.delete(ctx.from.id);
      return edit("❌ Proses dibatalkan.");
    }

    if (data === "addbalance:back") {
      state.step = state.history.pop() || "jenis";
      return this.render(ctx, state);
    }

    if (data === "addbalance:save") {
      await appendTransaction(state);
      states.delete(ctx.from.id);
      return edit(
        `✅ Transaksi berhasil disimpan!\n\n` +
          `Jenis: ${state.jenis}\n` +
          `Kategori: ${state.kategori}\n` +
          `Sub: ${state.subKategori}\n` +
          `Deskripsi: ${state.deskripsi}\n` +
          `Jumlah: ${formatAmount(state.jumlah, state.mataUang)}\n` +
          `Akun: ${state.akun}\n` +
          `Metode: ${state.metode}\n` +
          `Tag: ${state.tag || "-"}`,
      );
    }

    const [, step, value] = data.split(":");
    state.history.push(state.step);
    state[step] = value;

    if (step === "akun") {
      const { saldo, mataUang } = getLastFromCache(state.rows, value);
      state.saldoSebelum = saldo;
      state.step = mataUang ? "metode" : "mataUang";
      if (mataUang) state.mataUang = mataUang;
      return this.render(ctx, state);
    }

    const flow = {
      jenis: "kategori",
      kategori: "subKategori",
      subKategori: "deskripsi",
      mataUang: "metode",
      metode: "tag",
    };
    state.step = flow[step];
    return this.render(ctx, state);
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
      state.jumlah = parseInputAmount(ctx.message.text);
      state.step = "akun";
    } else if (state.step === "tag") {
      state.tag = ctx.message.text;
      state.step = "catatan";
    } else if (state.step === "catatan") {
      state.catatan = ctx.message.text;
      state.step = "confirm";
      state.saldoSesudah =
        state.jenis === "Pemasukan"
          ? state.saldoSebelum + state.jumlah
          : state.saldoSebelum - state.jumlah;
    }
    return this.render(ctx, state);
  },

  async render(ctx, state) {
    const edit = (text, kb) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        reply_markup: kb,
      });

    switch (state.step) {
      case "jenis":
        return edit("Pilih jenis transaksi:", kbJenisAwal());
      case "kategori":
        return edit(
          "Pilih kategori:",
          kbList(OPTIONS.kategori[state.jenis], "addbalance:kategori"),
        );
      case "subKategori":
        return edit(
          "Pilih sub kategori:",
          kbList(
            OPTIONS.subKategori[state.jenis][state.kategori],
            "addbalance:subKategori",
          ),
        );
      case "deskripsi":
        return edit("Masukkan deskripsi:", kbText());
      case "jumlah":
        return edit("Masukkan jumlah:", kbText());
      case "akun":
        return edit("Pilih akun:", kbList(OPTIONS.akun, "addbalance:akun"));
      case "mataUang":
        return edit(
          "Pilih mata uang:",
          kbList(OPTIONS.mataUang, "addbalance:mataUang"),
        );
      case "metode":
        return edit(
          "Pilih metode:",
          kbList(OPTIONS.metode, "addbalance:metode"),
        );
      case "tag":
        return edit("Masukkan tag:", kbText());
      case "catatan":
        return edit("Masukkan catatan:", kbText());
      case "confirm":
        return edit(
          `🧾 Konfirmasi Transaksi\n\n` +
            `Jenis: ${state.jenis}\n` +
            `Kategori: ${state.kategori}\n` +
            `Sub: ${state.subKategori}\n` +
            `Deskripsi: ${state.deskripsi}\n` +
            `Jumlah: ${formatAmount(state.jumlah, state.mataUang)}\n` +
            `Akun: ${state.akun}\n` +
            `Metode: ${state.metode}\n` +
            `Tag: ${state.tag || "-"}\n\n` +
            `Lanjutkan?`,
          {
            inline_keyboard: [
              [{ text: "✅ Simpan", callback_data: "addbalance:save" }],
              [{ text: "⬅️ Back", callback_data: "addbalance:back" }],
              [{ text: "❌ Cancel", callback_data: "addbalance:cancel" }],
            ],
          },
        );
    }
  },
};
