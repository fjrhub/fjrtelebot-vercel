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

const kbConfirm = () => ({
  inline_keyboard: [
    [{ text: "✅ Simpan", callback_data: "editbalance:save" }],
    [{ text: "⬅️ Back", callback_data: "editbalance:back" }],
    [{ text: "❌ Cancel", callback_data: "editbalance:cancel" }],
  ],
});

// Keyboard paginated: 28 item per halaman (4 kolom × 7 baris)
const kbPaginatedGrid = (totalCount, currentPage, prefix) => {
  const itemsPerPage = 28;
  const start = currentPage * itemsPerPage;
  const end = Math.min(start + itemsPerPage, totalCount);

  const buttons = [];
  const cols = 4;

  // Isi tombol nomor untuk halaman ini
  for (let i = start; i < end; i++) {
    if ((i - start) % cols === 0) {
      buttons.push([]);
    }
    buttons[buttons.length - 1].push({
      text: `${i + 1}`,
      callback_data: `${prefix}:${i}`,
    });
  }

  // Baris navigasi: Prev / Next
  const navRow = [];
  if (currentPage > 0) {
    navRow.push({ text: "⬅️ Prev", callback_data: `editbalance:page:${currentPage - 1}` });
  }
  navRow.push({ text: `📄 ${currentPage + 1}`, callback_data: "editbalance:noop" }); // disabled
  if (end < totalCount) {
    navRow.push({ text: "➡️ Next", callback_data: `editbalance:page:${currentPage + 1}` });
  }

  if (navRow.length > 0) {
    buttons.push(navRow);
  }

  // Tombol cancel selalu di paling bawah
  buttons.push([{ text: "❌ Cancel", callback_data: "editbalance:cancel" }]);

  return { inline_keyboard: buttons };
};

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
async function batchUpdateRows(rowsToUpdate) {
  const sheets = sheetsClient();
  const requests = rowsToUpdate.map((row, i) => {
    const sheetRow = i + 2; // A2 = row 2 → index 0 → row 2
    return {
      range: `Sheet1!A${sheetRow}:N${sheetRow}`,
      values: [row],
    };
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: requests,
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

    const msg = await ctx.reply("Pilih transaksi (nomor):", {
      reply_markup: kbPaginatedGrid(rows.length, 0, "editbalance:select"),
    });

    states.set(ctx.from.id, {
      step: "select",
      originalRows: rows,
      currentPage: 0,
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

    // Handle noop (halaman aktif)
    if (data === "editbalance:noop") {
      return ctx.answerCallbackQuery({ text: `Halaman ${state.currentPage + 1}` });
    }

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
      return edit(
        "Pilih transaksi (nomor):",
        kbPaginatedGrid(state.originalRows.length, state.currentPage || 0, "editbalance:select")
      );
    }

    if (data === "editbalance:save") {
      return this.save(ctx);
    }

    // Handle pagination
    if (data.startsWith("editbalance:page:")) {
      const newPage = parseInt(data.split(":")[2], 10);
      if (isNaN(newPage) || newPage < 0) return;

      state.currentPage = newPage;
      return edit(
        "Pilih transaksi (nomor):",
        kbPaginatedGrid(state.originalRows.length, state.currentPage, "editbalance:select")
      );
    }

    // Handle pemilihan transaksi
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
        const selectedRow = state.editedRows[state.selectedIndex];
        const deskripsi = selectedRow[3] || "-";
        return edit(
          `🔁 Konfirmasi Perubahan

Transaksi: ${deskripsi}
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

      // Update semua baris ke Sheets (urutan penting!)
      await batchUpdateRows(recalculatedRows);

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