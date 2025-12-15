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
    Transfer: ["Internal", "External"],
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

    Transfer: {
      Internal: ["Wallet", "Dana", "Seabank", "Fjlsaldo"],
      External: ["Ke Orang Lain", "Dari Orang Lain"],
    },
  },

  akun: ["Wallet", "Dana", "Seabank", "Bank", "Binance", "Fjlsaldo"],
  metode: ["Cash", "Transfer", "QRIS", "Debit", "Virtual Account"],
  mataUang: ["IDR", "USDT"],
};

/* =========================
   STATE
========================= */
const states = new Map();

/* =========================
   UTIL
========================= */
function toNumber(val) {
  return Number(String(val).replace(/\./g, "").replace(",", "."));
}

function keyboard(list, prefix, withBack = true) {
  const rows = list.map((v) => [
    { text: v, callback_data: `${prefix}:${v}` },
  ]);

  if (withBack) {
    rows.push([{ text: "⬅️ Back", callback_data: "addbalance:back" }]);
  }

  rows.push([{ text: "❌ Cancel", callback_data: "addbalance:cancel" }]);
  return { inline_keyboard: rows };
}

function textKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Back", callback_data: "addbalance:back" }],
      [{ text: "❌ Cancel", callback_data: "addbalance:cancel" }],
    ],
  };
}

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

async function getLastSaldo(akun) {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:N",
  });

  const rows = res.data.values || [];
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][6] === akun) {
      return Number(rows[i][9]) || 0;
    }
  }
  return 0;
}

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
          data.jenis,
          data.kategori,
          data.subKategori,
          data.deskripsi,
          data.jumlah,
          data.mataUang,
          data.akun,
          data.metode,
          saldoSebelum,
          saldoSesudah,
          data.tag,
          data.catatan, // ✅ TETAP DISIMPAN
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
    states.set(ctx.from.id, { step: "jenis", history: [] });

    return ctx.reply("Pilih jenis transaksi:", {
      reply_markup: keyboard(OPTIONS.jenis, "addbalance:jenis", false),
    });
  },

  async handleCallback(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    const data = ctx.callbackQuery.data;

    if (data === "addbalance:cancel") {
      states.delete(ctx.from.id);
      return ctx.editMessageText("❌ Proses dibatalkan.");
    }

    if (data === "addbalance:back") {
      const prev = state.history.pop();
      if (!prev) return;
      state.step = prev;
      return this.renderStep(ctx, state);
    }

    if (data === "addbalance:save") {
      await saveTransaction(state);
      states.delete(ctx.from.id);
      return ctx.editMessageText("✅ Transaksi berhasil disimpan");
    }

    const [, step, value] = data.split(":");
    state.history.push(state.step);
    state[step] = value;

    if (step === "jenis") state.step = "kategori";
    else if (step === "kategori") state.step = "subKategori";
    else if (step === "subKategori") state.step = "deskripsi";
    else if (step === "mataUang") state.step = "akun";
    else if (step === "akun") state.step = "metode";
    else if (step === "metode") state.step = "tag";

    return this.renderStep(ctx, state);
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    const text = ctx.message.text;
    state.history.push(state.step);

    if (state.step === "deskripsi") {
      state.deskripsi = text;
      state.step = "jumlah";
      return ctx.reply("Masukkan jumlah:", { reply_markup: textKeyboard() });
    }

    if (state.step === "jumlah") {
      state.jumlah = toNumber(text);
      state.step = "mataUang";
      return ctx.reply("Pilih mata uang:", {
        reply_markup: keyboard(OPTIONS.mataUang, "addbalance:mataUang"),
      });
    }

    if (state.step === "tag") {
      state.tag = text;
      state.step = "catatan";
      return ctx.reply("Masukkan catatan:", {
        reply_markup: textKeyboard(),
      });
    }

    if (state.step === "catatan") {
      state.catatan = text;
      state.step = "confirm";
      return this.renderStep(ctx, state);
    }
  },

  async renderStep(ctx, state) {
    switch (state.step) {
      case "kategori":
        return ctx.editMessageText("Pilih kategori:", {
          reply_markup: keyboard(
            OPTIONS.kategori[state.jenis],
            "addbalance:kategori"
          ),
        });

      case "subKategori":
        return ctx.editMessageText("Pilih sub kategori:", {
          reply_markup: keyboard(
            OPTIONS.subKategori[state.jenis][state.kategori],
            "addbalance:subKategori"
          ),
        });

      case "deskripsi":
        return ctx.editMessageText("Masukkan deskripsi:", {
          reply_markup: textKeyboard(),
        });

      case "akun":
        return ctx.reply("Pilih akun:", {
          reply_markup: keyboard(OPTIONS.akun, "addbalance:akun"),
        });

      case "metode":
        return ctx.editMessageText("Pilih metode:", {
          reply_markup: keyboard(OPTIONS.metode, "addbalance:metode"),
        });

      case "tag":
        return ctx.editMessageText("Masukkan tag:", {
          reply_markup: textKeyboard(),
        });

      case "confirm":
        return ctx.reply(
          `🧾 Konfirmasi Transaksi

Jenis: ${state.jenis}
Kategori: ${state.kategori}
Sub: ${state.subKategori}
Deskripsi: ${state.deskripsi}
Jumlah: ${state.jumlah} ${state.mataUang}
Akun: ${state.akun}
Metode: ${state.metode}
Tag: ${state.tag}

Lanjutkan?`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ Simpan", callback_data: "addbalance:save" }],
                [{ text: "⬅️ Back", callback_data: "addbalance:back" }],
                [{ text: "❌ Cancel", callback_data: "addbalance:cancel" }],
              ],
            },
          }
        );
    }
  },
};
