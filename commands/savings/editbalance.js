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
const toNumber = (v) =>
  Number(String(v).replace(/[^\d]/g, "").replace(",", "."));

const formatNumber = (n) => new Intl.NumberFormat("id-ID").format(n);

/* =========================
KEYBOARD
========================= */
const kbBack = () => ({
  inline_keyboard: [[{ text: "⬅️ Back", callback_data: "editbalance:back" }]],
});

const kbCancel = () => ({
  inline_keyboard: [[{ text: "❌ Cancel", callback_data: "editbalance:cancel" }]],
});

const kbListNumbered = (items, prefix) => {
  const buttons = items.map((item, i) => [
    {
      text: `${i + 1}. ${item}`,
      callback_data: `${prefix}:${i}`,
    },
  ]);
  return {
    inline_keyboard: [...buttons, [{ text: "❌ Cancel", callback_data: "editbalance:cancel" }]],
  };
};

const kbConfirm = () => ({
  inline_keyboard: [
    [{ text: "✅ Simpan", callback_data: "editbalance:save" }],
    [{ text: "⬅️ Back", callback_data: "editbalance:back" }],
    [{ text: "❌ Cancel", callback_data: "editbalance:cancel" }],
  ],
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
  // Ambil mulai dari A2 (abaikan header)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:O", // ← mulai dari baris 2
  });
  return res.data.values || [];
}

async function updateRow(rowIndex, updatedRow) {
  const sheets = sheetsClient();
  // rowIndex adalah 0-based dari data (A2 = index 0 → baris ke-2 di Sheets)
  const sheetRowIndex = rowIndex + 2; // karena data mulai di A2
  const range = `Sheet1!A${sheetRowIndex}:O${sheetRowIndex}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [updatedRow],
    },
  });
}

/* =========================
COMMAND: editbalance
========================= */
export default {
  name: "editbalance",

  async execute(ctx) {
    const rows = await fetchAllRows();
    if (rows.length === 0) {
      return ctx.reply("Tidak ada transaksi untuk diedit.");
    }

    const displayList = rows.map(
      (row, i) =>
        `${i + 1}. ${row[0] || "-"} | ${row[3] || "-"} | ${formatNumber(Number(row[4]))} ${row[5] || ""} | ${row[6] || "-"}`
    );

    const msg = await ctx.reply("Pilih transaksi (nomor):", {
      reply_markup: kbListNumbered(displayList, "editbalance:select"),
    });

    states.set(ctx.from.id, {
      step: "select",
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

    if (data === "editbalance:cancel") {
      states.delete(ctx.from.id);
      return edit("❌ Proses dibatalkan.");
    }

    if (data === "editbalance:back") {
      if (state.step === "select") {
        states.delete(ctx.from.id);
        return edit("❌ Dibatalkan.");
      }
      state.step = "select";
      const displayList = state.rows.map(
        (row, i) =>
          `${i + 1}. ${row[0] || "-"} | ${row[3] || "-"} | ${formatNumber(Number(row[4]))} ${row[5] || ""} | ${row[6] || "-"}`
      );
      return edit("Pilih transaksi (nomor):", kbListNumbered(displayList, "editbalance:select"));
    }

    if (data === "editbalance:save") {
      // Panggil logika simpan
      return this.save(ctx);
    }

    if (data.startsWith("editbalance:select:")) {
      const index = parseInt(data.split(":")[2], 10);
      if (isNaN(index) || index < 0 || index >= state.rows.length) {
        return edit("❌ Nomor tidak valid.", kbCancel());
      }

      const selectedRow = state.rows[index];
      state.selectedIndex = index; // indeks 0-based di array `rows`
      state.originalRow = [...selectedRow];

      state.jenis = selectedRow[0] || "";
      state.akun = selectedRow[6] || "";
      state.mataUang = selectedRow[5] || "Rp";
      state.originalJumlah = Number(selectedRow[4]) || 0;

      state.step = "jumlah";
      return this.render(ctx, state);
    }
  },

  async handleText(ctx) {
    const state = states.get(ctx.from.id);
    if (!state || state.step !== "jumlah") return;

    await ctx.deleteMessage().catch(() => {});

    const newAmount = toNumber(ctx.message.text);
    if (isNaN(newAmount) || newAmount <= 0) {
      const edit = (text, kb) =>
        ctx.api.editMessageText(state.chatId, state.messageId, text, {
          reply_markup: kbBack(),
        });
      return edit("❌ Jumlah tidak valid. Masukkan angka positif:", kbBack());
    }

    state.newJumlah = newAmount;
    state.step = "confirm";
    return this.render(ctx, state);
  },

  async render(ctx, state) {
    const edit = (text, kb) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        reply_markup: kb,
      });

    switch (state.step) {
      case "jumlah":
        return edit("Masukkan jumlah baru:", kbBack());

      case "confirm":
        return edit(
          `🔁 Konfirmasi Perubahan Jumlah

Transaksi: ${state.originalRow[3] || "-"}
Jumlah lama: ${formatNumber(state.originalJumlah)} ${state.mataUang}
Jumlah baru: ${formatNumber(state.newJumlah)} ${state.mataUang}
Akun: ${state.akun}

Simpan perubahan?`,
          kbConfirm()
        );

      default:
        return edit("Tahap tidak dikenali.", kbCancel());
    }
  },

  async save(ctx) {
    const state = states.get(ctx.from.id);
    if (!state) return;

    const edit = (text, kb) =>
      ctx.api.editMessageText(state.chatId, state.messageId, text, {
        reply_markup: kb,
      });

    const updatedRow = [...state.originalRow];
    updatedRow[4] = state.newJumlah; // kolom jumlah
    updatedRow[14] = new Date().toISOString(); // kolom editedAt (O)

    try {
      await updateRow(state.selectedIndex, updatedRow); // sesuai indeks 0-based dari A2
      states.delete(ctx.from.id);
      return edit(
        `✅ Jumlah berhasil diubah!

Dari: ${formatNumber(state.originalJumlah)} ${state.mataUang}
Menjadi: ${formatNumber(state.newJumlah)} ${state.mataUang}
Akun: ${state.akun}`
      );
    } catch (err) {
      console.error("Gagal update Google Sheets:", err);
      return edit("❌ Gagal menyimpan. Coba lagi nanti.", kbCancel());
    }
  },
};