import { google } from "googleapis";

/* ======================
   CONFIG OPTIONS
====================== */
const OPTIONS = {
  jenis: ["Pemasukan", "Pengeluaran"],
  kategori: ["Makan", "Transport", "Gaji", "Investasi"],
  subKategori: ["Harian", "Bulanan", "Tambahan"],
  akun: ["Cash", "Bank", "E-Wallet", "Crypto"],
  metode: ["Tunai", "Transfer", "QRIS"],
  status: ["Selesai", "Pending"],
};

/* ======================
   Utils
====================== */
function toNumber(val) {
  return Number(String(val).replace(/\./g, "").replace(",", "."));
}

function keyboard(list, prefix) {
  return {
    inline_keyboard: [
      ...list.map(v => [{ text: v, callback_data: `${prefix}:${v}` }]),
      [{ text: "➕ Lainnya (ketik manual)", callback_data: `${prefix}:manual` }],
      [{ text: "❌ Cancel", callback_data: "addbalance:cancel" }],
    ],
  };
}

/* ======================
   State
====================== */
const stateMap = new Map();

/* ======================
   Google Sheets
====================== */
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

async function save(data) {
  const sheets = sheetsClient();
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A:O",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        data.jenis,
        data.kategori,
        data.subKategori,
        data.deskripsi,
        data.jumlah,
        data.mataUang,
        data.akun,
        data.metode,
        data.status,
        data.saldoSebelum,
        data.saldoSesudah,
        data.tag,
        data.catatan,
        now,
        now
      ]]
    }
  });
}

/* ======================
   Command
====================== */
export default {
  name: "addbalance",

  async execute(ctx) {
    stateMap.set(ctx.from.id, { step: "jenis" });

    await ctx.reply("Pilih jenis transaksi:", {
      reply_markup: keyboard(OPTIONS.jenis, "addbalance:jenis"),
    });
  },

  async handleCallback(ctx) {
    const state = stateMap.get(ctx.from.id);
    if (!state) return;

    const [, step, value] = ctx.callbackQuery.data.split(":");

    if (step === "cancel") {
      stateMap.delete(ctx.from.id);
      return ctx.editMessageText("❌ Proses dibatalkan.");
    }

    if (value !== "manual") {
      state[step] = value;
    }

    const next = {
      jenis: "kategori",
      kategori: "subKategori",
      subKategori: "deskripsi",
      akun: "metode",
      metode: "status",
      status: "saldoSebelum",
    };

    if (step === "jenis") {
      state.step = "kategori";
      return ctx.editMessageText("Pilih kategori:", {
        reply_markup: keyboard(OPTIONS.kategori, "addbalance:kategori"),
      });
    }

    if (step === "kategori") {
      state.step = "subKategori";
      return ctx.editMessageText("Pilih sub kategori:", {
        reply_markup: keyboard(OPTIONS.subKategori, "addbalance:subKategori"),
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
      state.step = "status";
      return ctx.editMessageText("Pilih status:", {
        reply_markup: keyboard(OPTIONS.status, "addbalance:status"),
      });
    }

    if (step === "status") {
      state.step = "saldoSebelum";
      return ctx.editMessageText("Masukkan saldo sebelum:");
    }

    if (value === "manual") {
      state.step = step;
      return ctx.editMessageText(`Masukkan ${step} secara manual:`);
    }
  },

  async handleText(ctx) {
    const state = stateMap.get(ctx.from.id);
    if (!state) return;

    const t = ctx.message.text;

    switch (state.step) {
      case "deskripsi":
        state.deskripsi = t;
        state.step = "jumlah";
        return ctx.reply("Masukkan jumlah (contoh: 10.000)");

      case "jumlah":
        state.jumlah = toNumber(t);
        state.step = "mataUang";
        return ctx.reply("Masukkan mata uang (IDR / USD / USDT)");

      case "mataUang":
        state.mataUang = t.toUpperCase();
        state.step = "akun";
        return ctx.reply("Pilih akun:", {
          reply_markup: keyboard(OPTIONS.akun, "addbalance:akun"),
        });

      case "saldoSebelum":
        state.saldoSebelum = toNumber(t);
        state.step = "saldoSesudah";
        return ctx.reply("Masukkan saldo sesudah");

      case "saldoSesudah":
        state.saldoSesudah = toNumber(t);
        state.step = "tag";
        return ctx.reply("Masukkan tag");

      case "tag":
        state.tag = t;
        state.step = "catatan";
        return ctx.reply("Masukkan catatan");

      case "catatan":
        state.catatan = t;
        await save(state);
        stateMap.delete(ctx.from.id);
        return ctx.reply("✅ Transaksi berhasil disimpan");
    }
  }
};
