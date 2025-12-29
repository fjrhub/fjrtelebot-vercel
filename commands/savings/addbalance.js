import { google } from "googleapis";

/* =========================
   OPTIONS
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
    Pemasukan: ["Gaji", "Usaha", "Investasi", "Hadiah", "Refund", "Lainnya"],
  },

  subKategori: {
    Pengeluaran: {
      Makanan: ["Makan Harian", "Jajan", "Kopi"],
      Transportasi: ["Bensin", "Ojol", "Parkir", "Servis", "Darurat"],
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
      Lainnya: ["Uang Saku", "Bantuan", "Pemasukan Lain"],
    },
  },

  akun: ["Wallet", "Dana", "Seabank", "Bank", "Binance", "Fjlsaldo", "Gopay"],
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
const toNumber = (v) => Number(String(v).replace(/\./g, "").replace(",", "."));

const formatAmount = (amount, currency) => {
  if (currency === "USDT") {
    // USDT biasanya ditampilkan dengan 2 desimal atau tanpa koma ribuan
    return `${Number(amount).toFixed(2)} USDT`;
  } else if (currency === "Rp") {
    // Format Rupiah: Rp1.000 atau Rp1.000.000
    return `Rp${new Intl.NumberFormat("id-ID").format(Math.round(amount))}`;
  } else {
    // fallback jika ada mata uang lain
    return `${currency}${new Intl.NumberFormat("id-ID").format(amount)}`;
  }
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
      return {
        mataUang: rows[i][0] || null,
        saldo: Number(rows[i][4]) || 0,
      };
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
          data.jumlah,
          data.mataUang,
          data.akun,
          data.metode,
          data.saldoSebelum,
          data.saldoSesudah,
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
        `✅ Transaksi berhasil disimpan!

Jenis: ${state.jenis}
Kategori: ${state.kategori}
Sub: ${state.subKategori}
Deskripsi: ${state.deskripsi}
Jumlah: ${formatAmount(state.jumlah, state.mataUang)}
Akun: ${state.akun}
Metode: ${state.metode}
Tag: ${state.tag || "-"}`
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
      state.jumlah = toNumber(ctx.message.text);
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
          kbList(OPTIONS.kategori[state.jenis], "addbalance:kategori")
        );

      case "subKategori":
        return edit(
          "Pilih sub kategori:",
          kbList(
            OPTIONS.subKategori[state.jenis][state.kategori],
            "addbalance:subKategori"
          )
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
          kbList(OPTIONS.mataUang, "addbalance:mataUang")
        );

      case "metode":
        return edit(
          "Pilih metode:",
          kbList(OPTIONS.metode, "addbalance:metode")
        );

      case "tag":
        return edit("Masukkan tag:", kbText());

      case "catatan":
        return edit("Masukkan catatan:", kbText());

      case "confirm":
        return edit(
          `🧾 Konfirmasi Transaksi

Jenis: ${state.jenis}
Kategori: ${state.kategori}
Sub: ${state.subKategori}
Deskripsi: ${state.deskripsi}
Jumlah: ${formatAmount(state.jumlah, state.mataUang)}
Akun: ${state.akun}
Metode: ${state.metode}
Tag: ${state.tag}

Lanjutkan?`,
          {
            inline_keyboard: [
              [{ text: "✅ Simpan", callback_data: "addbalance:save" }],
              [{ text: "⬅️ Back", callback_data: "addbalance:back" }],
              [{ text: "❌ Cancel", callback_data: "addbalance:cancel" }],
            ],
          }
        );
    }
  },
};
