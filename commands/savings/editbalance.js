import { google } from "googleapis";

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
  inline_keyboard: [
    [{ text: "⬅️ Back", callback_data: "editbalance:back" }],
  ],
});

const kbCancel = () => ({
  inline_keyboard: [
    [{ text: "❌ Cancel", callback_data: "editbalance:cancel" }],
  ],
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

// Ambil semua data transaksi (tanpa header)
async function fetchAllRows() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:N",
  });
  return res.data.values || [];
}

// Update banyak baris sekaligus (batch)
async function batchUpdateRows(startIndex, rowsToUpdate) {
  const sheets = sheetsClient();
  const requests = rowsToUpdate.map((row, i) => {
    const sheetRow = startIndex + i + 2; // A2 = row 2 → index 0 → row 2
    return {
      range: `Sheet1!A${sheetRow}:N${sheetRow}`,
      values: [row],
    };
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: requests, // <-- Perhatikan: ini harus 'data', bukan 'requests'
    },
  });
}

/* =========================
SALDO REKALKULASI
========================= */
function recalculateBalances(rows) {
  const balances = {}; // akun → saldo terkini

  return rows.map((row) => {
    const akun = row[6] || "Unknown";
    const jenis = row[0];
    const jumlah = Number(row[4]) || 0;

    const saldoSebelum = balances[akun] || 0;
    const saldoSesudah =
      jenis === "Pemasukan" ? saldoSebelum + jumlah : saldoSebelum - jumlah;

    balances[akun] = saldoSesudah;

    // Update kolom I (Saldo Sebelum) dan J (Saldo Setelah)
    const newRow = [...row];
    newRow[8] = saldoSebelum;
    newRow[9] = saldoSesudah;
    return newRow;
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
      originalRows: rows, // simpan snapshot awal
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
      const displayList = state.originalRows.map(
        (row, i) =>
          `${i + 1}. ${row[0] || "-"} | ${row[3] || "-"} | ${formatNumber(Number(row[4]))} ${row[5] || ""} | ${row[6] || "-"}`
      );
      return edit("Pilih transaksi (nomor):", kbListNumbered(displayList, "editbalance:select"));
    }

    if (data === "editbalance:save") {
      return this.save(ctx);
    }

    if (data.startsWith("editbalance:select:")) {
      const index = parseInt(data.split(":")[2], 10);
      const rows = state.originalRows;
      if (isNaN(index) || index < 0 || index >= rows.length) {
        return edit("❌ Nomor tidak valid.", kbCancel());
      }

      const selectedRow = rows[index];
      state.selectedIndex = index;
      state.editedRows = [...rows]; // working copy
      state.originalJumlah = Number(selectedRow[4]) || 0;
      state.jenis = selectedRow[0] || "";
      state.akun = selectedRow[6] || "";
      state.mataUang = selectedRow[5] || "Rp";

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

    // Update jumlah di working copy
    state.editedRows[state.selectedIndex][4] = newAmount;
    state.newJumlah = newAmount;

    // Update timestamp "Diperbarui Pada" (kolom N = index 13)
    state.editedRows[state.selectedIndex][13] = new Date().toISOString();

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
          `🔁 Konfirmasi Perubahan

Transaksi: ${state.editedRows[state.selectedIndex]?.[3] || "-"}
Jumlah lama: ${formatNumber(state.originalJumlah)} ${state.mataUang}
Jumlah baru: ${formatNumber(state.newJumlah)} ${state.mataUang}
Akun: ${state.akun}

⚠️ Saldo semua transaksi setelah ini akan disesuaikan otomatis.

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

    try {
      // Hitung ulang saldo seluruh data berdasarkan editedRows
      const recalculatedRows = recalculateBalances(state.editedRows);

      // Update semua baris ke Sheets
      await batchUpdateRows(0, recalculatedRows);

      states.delete(ctx.from.id);
      return edit(
        `✅ Transaksi dan saldo berhasil diperbarui!

Jumlah diubah dari ${formatNumber(state.originalJumlah)} menjadi ${formatNumber(state.newJumlah)} ${state.mataUang}
Akun: ${state.akun}`
      );
    } catch (err) {
      console.error("Gagal update saldo:", err);
      return edit("❌ Gagal memperbarui. Coba lagi nanti.", kbCancel());
    }
  },
};