import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */
const OPTIONS = {
  akun: ["Wallet", "Dana", "Bank", "Binance"],
};

/* =========================
   STATE
========================= */
const states = new Map();

/* =========================
   UTIL
========================= */
const toNumber = (v) =>
  Number(String(v).replace(/\./g, "").replace(",", "."));

const format = (n) => new Intl.NumberFormat("id-ID").format(n);

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
        mataUang: rows[i][0] || "Rp",
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
const kbList = (list, prefix) => ({
  inline_keyboard: [
    ...list.map((v) => [{ text: v, callback_data: `${prefix}:${v}` }]),
  ],
});

/* =========================
   COMMAND
========================= */
export default {
  name: "addbalance",

  async execute(ctx) {
    const rows = await fetchAllRows();

    const msg = await ctx.reply("🔁 Transfer Antar Akun\n\nPilih akun asal:", {
      reply_markup: kbList(OPTIONS.akun, "addbalance:akunAsal"),
    });

    states.set(ctx.from.id, {
      step: "akunAsal",
      rows,
      chatId: ctx.chat.id,
      messageId: msg.message_id,
    });
  },

  async handleCallback(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    const [_, step, value] = ctx.callbackQuery.data.split(":");

    const edit = (text, markup) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        reply_markup: markup,
      });

    /* ===== AKUN ASAL ===== */
    if (step === "akunAsal") {
      state.akunAsal = value;
      state.step = "akunTujuan";
      return edit(
        "Pilih akun tujuan:",
        kbList(OPTIONS.akun, "addbalance:akunTujuan")
      );
    }

    /* ===== AKUN TUJUAN ===== */
    if (step === "akunTujuan") {
      if (value === state.akunAsal) {
        return edit(
          "❌ Akun asal dan tujuan tidak boleh sama.\n\nPilih akun tujuan:",
          kbList(OPTIONS.akun, "addbalance:akunTujuan")
        );
      }

      state.akunTujuan = value;
      state.step = "deskripsi";
      return edit("Masukkan deskripsi transfer:");
    }

    /* ===== SIMPAN ===== */
    if (step === "save") {
      const now = new Date().toISOString();

      const asal = getLastSaldo(state.rows, state.akunAsal);
      const tujuan = getLastSaldo(state.rows, state.akunTujuan);

      const saldoAsalSesudah = asal.saldo - state.jumlah;
      const saldoTujuanSesudah = tujuan.saldo + state.jumlah;

      await appendRows([
        [
          "Pengeluaran",
          "Transfer",
          "Antar Akun",
          state.deskripsi,
          state.jumlah,
          asal.mataUang,
          state.akunAsal,
          "Transfer",
          asal.saldo,
          saldoAsalSesudah,
          state.tag,
          state.catatan,
          now,
          now,
        ],
        [
          "Pemasukan",
          "Transfer",
          "Antar Akun",
          state.deskripsi,
          state.jumlah,
          tujuan.mataUang,
          state.akunTujuan,
          "Transfer",
          tujuan.saldo,
          saldoTujuanSesudah,
          state.tag,
          state.catatan,
          now,
          now,
        ],
      ]);

      states.delete(ctx.from.id);
      return edit("✅ Transfer berhasil disimpan");
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
      state.step = "jumlah";
      return edit("Masukkan jumlah transfer:");
    }

    if (state.step === "jumlah") {
      state.jumlah = toNumber(ctx.message.text);
      state.step = "tag";
      return edit("Masukkan tag:");
    }

    if (state.step === "tag") {
      state.tag = ctx.message.text;
      state.step = "catatan";
      return edit("Masukkan catatan:");
    }

    if (state.step === "catatan") {
      state.catatan = ctx.message.text;
      state.step = "confirm";

      const asal = getLastSaldo(state.rows, state.akunAsal);
      const tujuan = getLastSaldo(state.rows, state.akunTujuan);

      return edit(
        `🧾 KONFIRMASI TRANSFER

Deskripsi: ${state.deskripsi}
Jumlah: ${format(state.jumlah)} ${asal.mataUang}

Dari: ${state.akunAsal}
Saldo: ${format(asal.saldo)} → ${format(asal.saldo - state.jumlah)}

Ke: ${state.akunTujuan}
Saldo: ${format(tujuan.saldo)} → ${format(tujuan.saldo + state.jumlah)}

Tag: ${state.tag}
Catatan: ${state.catatan}

Lanjutkan?`,
        {
          inline_keyboard: [
            [{ text: "✅ Simpan", callback_data: "addbalance:save" }],
          ],
        }
      );
    }
  },
};
