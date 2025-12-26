import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */
const OPTIONS = {
  akun: ["Wallet", "Dana", "Seabank", "Bank", "Binance", "Fjlsaldo", "Gopay"],
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
const formatNumber = (n) => new Intl.NumberFormat("id-ID").format(n);

const kbList = (list, prefix) => ({
  inline_keyboard: list.map((v) => [
    { text: v, callback_data: `${prefix}:${v}` },
  ]),
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
    range: "Sheet1!A2:J", // ambil kolom penting saja
  });
  return res.data.values || [];
}

function hasOpeningBalance(rows, akun) {
  return rows.some(
    (r) => r[0] === "Opening Balance" && r[6] === akun
  );
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
          "-", // metode tidak dipakai
          0, // saldo sebelum
          data.saldoSesudah,
          "-", // tag
          "Account opening balance",
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
  name: "setupaccount",

  async execute(ctx) {
    const rows = await fetchAllRows();

    const msg = await ctx.reply(
      "🛠 Setup Account\n\nPilih akun yang ingin diset saldo awal:",
      {
        reply_markup: {
          inline_keyboard: [
            ...OPTIONS.akun.map((v) => [
              { text: v, callback_data: `setupaccount:akun:${v}` },
            ]),
            [{ text: "❌ Cancel", callback_data: "setupaccount:cancel" }],
          ],
        },
      }
    );

    states.set(ctx.from.id, {
      step: "akun",
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

    if (data === "setupaccount:cancel") {
      states.delete(ctx.from.id);
      return edit("❌ Setup akun dibatalkan.");
    }

    const [, step, value] = data.split(":");
    state[step] = value;

    if (step === "akun") {
      if (hasOpeningBalance(state.rows, value)) {
        return ctx.answerCallbackQuery({
          text: "Saldo awal akun ini sudah pernah diset.",
          show_alert: true,
        });
      }
      state.step = "jumlah";
      return edit(
        `Masukkan saldo awal untuk akun *${value}*:`,
        { inline_keyboard: [] }
      );
    }

    if (step === "mataUang") {
      state.mataUang = value;
      state.step = "confirm";

      return this.render(ctx, state);
    }
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    await ctx.deleteMessage().catch(() => {});

    if (state.step === "jumlah") {
      state.jumlah = toNumber(ctx.message.text);
      state.saldoSesudah = state.jumlah;
      state.step = "mataUang";

      return ctx.api.editMessageText(
        state.chatId,
        state.messageId,
        "Pilih mata uang:",
        {
          reply_markup: kbList(
            OPTIONS.mataUang,
            "setupaccount:mataUang"
          ),
        }
      );
    }
  },

  async render(ctx, state) {
    return ctx.api.editMessageText(
      state.chatId,
      state.messageId,
      `🧾 Konfirmasi Setup Akun

Akun: ${state.akun}
Saldo Awal: ${formatNumber(state.jumlah)} ${state.mataUang}

Saldo ini akan menjadi titik awal akun.
Tidak dihitung sebagai pemasukan.

Lanjutkan?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Simpan", callback_data: "setupaccount:save" }],
            [{ text: "❌ Cancel", callback_data: "setupaccount:cancel" }],
          ],
        },
      }
    );
  },

  async handleSave(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    await appendTransaction({
      jenis: "Opening Balance",
      kategori: "Account Setup",
      subKategori: "Initial Balance",
      deskripsi: "Account opening balance",
      jumlah: state.jumlah,
      mataUang: state.mataUang,
      akun: state.akun,
      saldoSesudah: state.saldoSesudah,
    });

    states.delete(ctx.from.id);

    return ctx.api.editMessageText(
      state.chatId,
      state.messageId,
      "✅ Setup akun berhasil disimpan."
    );
  },
};
