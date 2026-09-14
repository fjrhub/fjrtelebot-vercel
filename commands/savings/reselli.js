import { google } from "googleapis";

/* =========================
   OPTIONS & STATE
========================= */
const OPTIONS = {
  akun: ["Wallet", "Dana", "Seabank", "Bank", "Fjlsaldo", "Gopay", "Jago"],
};
const states = new Map();

/* =========================
   UTIL
========================= */
const formatRupiah = (n) => {
  const abs = Math.abs(n).toLocaleString("id-ID");
  return n < 0 ? `-Rp${abs}` : `Rp${abs}`;
};

const formatSaldoLine = (akun, before, after, isKeluar) => {
  const icon = isKeluar ? "📉" : "💰";
  return `${icon} ${akun}: ${formatRupiah(before)} → ${formatRupiah(after)}`;
};

/* =========================
   GOOGLE SHEETS
========================= */
function sheetsClient() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!process.env.GOOGLE_CLIENT_EMAIL || !privateKey) {
    throw new Error("Kredensial Google Sheets (CLIENT_EMAIL / PRIVATE_KEY) tidak lengkap di .env");
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function fetchLatestTwoRows() {
  if (!process.env.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID tidak ditemukan di .env");
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:N",
  });
  const rows = res.data.values || [];
  // Ambil 2 data paling terbaru (paling bawah)
  return rows.slice(-2);
}

async function safeEdit(ctx, chatId, messageId, text, markup) {
  try {
    return await ctx.api.editMessageText(chatId, messageId, text, { reply_markup: markup });
  } catch (err) {
    if (err.description?.includes("message is not modified")) return;
    console.error("❌ [reselli] editMessageText error:", err);
    throw err;
  }
}

/* =========================
   COMMAND
========================= */
export default {
  name: "reselli",

  async execute(ctx) {
    console.log("🚀 [RESELLI] Command diterima.");
    try {
      const ownerId = String(process.env.OWNER_ID).replace(/['"]+/g, '');
      if (String(ctx.from?.id) !== ownerId) {
        return ctx.reply("⛔ Akses ditolak. Hanya owner yang dapat menggunakan perintah ini.");
      }

      console.log("🔄 [RESELLI] Mengambil 2 data transaksi terbaru...");
      const latestRows = await fetchLatestTwoRows();

      if (latestRows.length < 2) {
        return ctx.reply("❌ Tidak cukup data transaksi. Minimal harus ada 2 baris transaksi (Pengeluaran & Pemasukan) untuk dikonversi.");
      }

      // Cari mana yang Pengeluaran dan mana yang Pemasukan
      const rowPengeluaran = latestRows.find(r => r[0] === "Pengeluaran");
      const rowPemasukan = latestRows.find(r => r[0] === "Pemasukan");

      if (!rowPengeluaran || !rowPemasukan) {
        return ctx.reply("❌ 2 data terbaru bukan merupakan pasangan transaksi Selli (Pengeluaran & Pemasukan).");
      }

      // Mapping data dari row (Index: 3=deskripsi, 4=jumlah, 6=akun, 8=saldoSebelum, 9=saldoSesudah, 10=tag, 11=catatan)
      const deskripsi = rowPengeluaran[3] || rowPemasukan[3] || "Tanpa Deskripsi";
      const akunKeluar = rowPengeluaran[6];
      const akunMasuk = rowPemasukan[6];
      const jumlahKeluar = Number(rowPengeluaran[4]) || 0;
      const jumlahMasuk = Number(rowPemasukan[4]) || 0;
      
      const saldoKeluarSebelum = Number(rowPengeluaran[8]) || 0;
      const saldoKeluarSesudah = Number(rowPengeluaran[9]) || 0;
      const saldoMasukSebelum = Number(rowPemasukan[8]) || 0;
      const saldoMasukSesudah = Number(rowPemasukan[9]) || 0;

      const tag = rowPengeluaran[10] || rowPemasukan[10] || "-";
      const catatan = rowPengeluaran[11] || rowPemasukan[11] || "-";
      const keuntungan = jumlahMasuk - jumlahKeluar;

      console.log("📤 [RESELLI] Mengirim preview konversi ke Telegram...");
      const msg = await ctx.reply(
        `🔄 PREVIEW KONVERSI TRANSAKSI TERBARU\n\n` +
        `📝 Deskripsi: ${deskripsi}\n` +
        `💸 Keluar: ${formatRupiah(jumlahKeluar)} dari ${akunKeluar}\n` +
        `💰 Masuk: ${formatRupiah(jumlahMasuk)} ke ${akunMasuk}\n` +
        `📈 Keuntungan: ${formatRupiah(keuntungan)}\n\n` +
        `${formatSaldoLine(akunKeluar, saldoKeluarSebelum, saldoKeluarSesudah, true)}\n` +
        `${formatSaldoLine(akunMasuk, saldoMasukSebelum, saldoMasukSesudah, false)}\n\n` +
        `Tag: ${tag} | Catatan: ${catatan}\n\n` +
        `⚠️ Menekan "Simpan" akan menambahkan transaksi BARU dengan data ini.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Simpan sebagai Baru", callback_data: "reselli:save:ok" }],
              [{ text: "🔄 Balik (Reverse)", callback_data: "reselli:reverse" }],
              [{ text: "❌ Batal", callback_data: "reselli:cancel" }],
            ],
          },
        }
      );

      states.set(ctx.from.id, {
        chatId: ctx.chat.id,
        messageId: msg.message_id,
        akunKeluar,
        akunMasuk,
        jumlahKeluar,
        jumlahMasuk,
        deskripsi,
        tag,
        catatan,
        saldoKeluarSebelum,
        saldoKeluarSesudah,
        saldoMasukSebelum,
        saldoMasukSesudah,
      });

    } catch (error) {
      console.error("💥 [RESELLI] CRASH TOTAL:", error);
      ctx.reply(`❌ Terjadi kesalahan sistem: ${error.message}`).catch(console.error);
    }
  },

  async handleCallback(ctx) {
    try {
      await ctx.answerCallbackQuery().catch(() => {});
      if (!ctx.callbackQuery?.data?.startsWith("reselli:")) return;

      const state = states.get(ctx.from.id);
      if (!state) {
        return ctx.reply("❌ Sesi transaksi telah berakhir atau tidak ditemukan. Silakan ulangi perintah.");
      }

      const edit = (text, markup) => safeEdit(ctx, state.chatId, state.messageId, text, markup);
      const data = ctx.callbackQuery.data;

      if (data === "reselli:cancel") {
        states.delete(ctx.from.id);
        return edit("❌ Konversi transaksi dibatalkan.");
      }

      if (data === "reselli:reverse") {
        // Swap keluar dan masuk
        const tempAkun = state.akunKeluar;
        state.akunKeluar = state.akunMasuk;
        state.akunMasuk = tempAkun;

        const tempJumlah = state.jumlahKeluar;
        state.jumlahKeluar = state.jumlahMasuk;
        state.jumlahMasuk = tempJumlah;

        const tempSaldoSebelum = state.saldoKeluarSebelum;
        state.saldoKeluarSebelum = state.saldoMasukSebelum;
        state.saldoMasukSebelum = tempSaldoSebelum;

        const tempSaldoSesudah = state.saldoKeluarSesudah;
        state.saldoKeluarSesudah = state.saldoMasukSesudah;
        state.saldoMasukSesudah = tempSaldoSesudah;

        const keuntungan = state.jumlahMasuk - state.jumlahKeluar;
        // Toggle label REVERSE pada deskripsi
        const newDeskripsi = state.deskripsi.includes("(REVERSE)") 
          ? state.deskripsi.replace(" (REVERSE)", "") 
          : `${state.deskripsi} (REVERSE)`;
        state.deskripsi = newDeskripsi;

        const newText = `🔄 PREVIEW KONVERSI TRANSAKSI (REVERSE)\n\n` +
          `📝 Deskripsi: ${state.deskripsi}\n` +
          `💸 Keluar: ${formatRupiah(state.jumlahKeluar)} dari ${state.akunKeluar}\n` +
          `💰 Masuk: ${formatRupiah(state.jumlahMasuk)} ke ${state.akunMasuk}\n` +
          `📈 Keuntungan: ${formatRupiah(keuntungan)}\n\n` +
          `${formatSaldoLine(state.akunKeluar, state.saldoKeluarSebelum, state.saldoKeluarSesudah, true)}\n` +
          `${formatSaldoLine(state.akunMasuk, state.saldoMasukSebelum, state.saldoMasukSesudah, false)}\n\n` +
          `Tag: ${state.tag} | Catatan: ${state.catatan}\n\n` +
          `⚠️ Menekan "Simpan" akan menambahkan transaksi BARU dengan data ini.`;

        return edit(newText, {
          inline_keyboard: [
            [{ text: "✅ Simpan sebagai Baru", callback_data: "reselli:save:ok" }],
            [{ text: "🔄 Balik Lagi", callback_data: "reselli:reverse" }],
            [{ text: "❌ Batal", callback_data: "reselli:cancel" }],
          ],
        });
      }

      if (data === "reselli:save:ok") {
        const sheets = sheetsClient();
        const now = new Date().toISOString();
        const entries = [
          [
            "Pengeluaran", "Usaha", "Penjualan", state.deskripsi, state.jumlahKeluar, "Rp",
            state.akunKeluar, "Transfer", state.saldoKeluarSebelum, state.saldoKeluarSesudah,
            state.tag, state.catatan, now, now,
          ],
          [
            "Pemasukan", "Usaha", "Penjualan", state.deskripsi, state.jumlahMasuk, "Rp",
            state.akunMasuk, "Cash", state.saldoMasukSebelum, state.saldoMasukSesudah,
            state.tag, state.catatan, now, now,
          ],
        ];

        console.log("💾 [RESELLI] Menyimpan ke Google Sheets...");
        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: "Sheet1!A:O",
          valueInputOption: "USER_ENTERED",
          requestBody: { values: entries },
        });
        
        states.delete(ctx.from.id);

        const keuntungan = state.jumlahMasuk - state.jumlahKeluar;
        const warning = keuntungan < 0 ? "\n⚠️ Transaksi rugi." : "";
        const correctSaldoLines = [
          formatSaldoLine(state.akunKeluar, state.saldoKeluarSebelum, state.saldoKeluarSesudah, true),
          formatSaldoLine(state.akunMasuk, state.saldoMasukSebelum, state.saldoMasukSesudah, false),
        ].join("\n");

        const successText = `✅ Transaksi berhasil disimpan ulang!\n\n` +
          `🧾 DETAIL:\n` +
          `📝 Deskripsi: ${state.deskripsi}\n` +
          `💸 Keluar: ${formatRupiah(state.jumlahKeluar)} dari ${state.akunKeluar}\n` +
          `💰 Masuk: ${formatRupiah(state.jumlahMasuk)} ke ${state.akunMasuk}\n` +
          `📈 Keuntungan: ${formatRupiah(keuntungan)}\n\n` +
          `${correctSaldoLines}\n\n` +
          `Tag: ${state.tag} | Catatan: ${state.catatan}${warning}`;

        return edit(successText);
      }
    } catch (error) {
      console.error("💥 [RESELLI] Callback CRASH:", error);
      try {
        await ctx.editMessageText(`❌ Gagal memproses: ${error.message}`);
      } catch (e) {
        await ctx.reply(`❌ Gagal memproses: ${error.message}`).catch(console.error);
      }
    }
  },
};