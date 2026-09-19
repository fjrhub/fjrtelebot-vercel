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
  const icon = isKeluar ? "💸" : "💰";
  return `${icon} ${akun}: ${formatRupiah(before)} → ${formatRupiah(after)}`;
};

const parseAmount = (str) => {
  if (!str) return null;
  // Regex ini mendukung format: 20,79K, 1.5jt, 100000, dll.
  const match = String(str).match(/^(\d+(?:[.,]\d+)?)(k|rb|ribu|jt|juta)?$/i);
  if (!match) return null;
  
  // Ganti koma menjadi titik agar parseFloat bisa membaca desimal dengan benar
  // Contoh: "20,79" menjadi "20.79" -> 20.79 * 1000 = 20790
  let amount = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  const suffix = match[2]?.toLowerCase();
  
  if (["k", "rb", "ribu"].includes(suffix)) amount *= 1000;
  if (["jt", "juta"].includes(suffix)) amount *= 1000000;
  
  return Math.round(amount);
};

const findAkun = (name) =>
  OPTIONS.akun.find((a) => a.toLowerCase() === String(name).toLowerCase());

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

async function fetchAllRows() {
  if (!process.env.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID tidak ditemukan di .env");
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:N", // Diubah ke A:N agar indeks kolom akun (G/index 6) terbaca dengan benar
  });
  return res.data.values || [];
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

async function safeEdit(ctx, chatId, messageId, text, markup) {
  try {
    return await ctx.api.editMessageText(chatId, messageId, text, { reply_markup: markup });
  } catch (err) {
    if (err.description?.includes("message is not modified")) return;
    console.error("❌ [expense] editMessageText error:", err);
    throw err;
  }
}

function getLastSaldo(rows, akun) {
  for (let i = rows.length - 1; i >= 0; i--) {
    // Indeks 6 adalah kolom Akun (G) berdasarkan struktur appendRows
    if (rows[i]?.[6]?.toLowerCase() === akun.toLowerCase()) {
      return { mataUang: rows[i][5] || "Rp", saldo: Number(rows[i][9]) || 0 };
    }
  }
  return { mataUang: "Rp", saldo: 0 };
}

/* =========================
   COMMAND
========================= */
export default {
  name: "expense",

  async execute(ctx) {
    console.log("🚀 [expense] Command diterima. Text:", ctx.message?.text);
    try {
      const ownerId = String(process.env.OWNER_ID).replace(/['"]+/g, '');
      if (String(ctx.from?.id) !== ownerId) {
        console.warn("⛔ [expense] Akses ditolak. ID User:", ctx.from?.id);
        return ctx.reply("⛔ Akses ditolak. Hanya owner yang dapat menggunakan perintah ini.");
      }

      let commandText = (ctx.message?.text || ctx.message?.caption || "")
        .replace(/\u200B/g, '')
        .replace(/\u200C/g, '')
        .replace(/\u200D/g, '')
        .replace(/\uFEFF/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      let customDeskripsi = "Pemasukan Lainnya";
      const descRegex = /-(?:deskripsi|desc)\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i;
      const descMatch = commandText.match(descRegex);
      
      if (descMatch) {
        customDeskripsi = descMatch[1] || descMatch[2] || descMatch[3];
        commandText = commandText.replace(descMatch[0], "").replace(/\s+/g, " ").trim();
      }

      const args = commandText.trim().split(/\s+/).slice(1);
      
      if (args.length < 2) {
        return ctx.reply(
          "❌ **Format salah.**\n\n" +
          "**Cara Penggunaan:**\n" +
          "`/expense <akun> <jumlah> -desc \"<deskripsi>\"`\n\n" +
          "**Contoh:**\n" +
          "• `/expense Seabank 20,79K -desc \"Bonus\"`\n" +
          "• `/expense Wallet 1,5jt -desc \"Gaji\"`",
          { parse_mode: "Markdown" }
        );
      }

      const [akunRaw, jumlahRaw] = args;
      const akun = findAkun(akunRaw);
      const jumlah = parseAmount(jumlahRaw);

      if (!akun) {
        return ctx.reply(`❌ Akun tidak valid.\nPilihan: ${OPTIONS.akun.join(", ")}`);
      }
      if (jumlah === null || jumlah <= 0) {
        return ctx.reply("❌ Format jumlah salah.\nGunakan suffix: K, rb, ribu, jt, juta (Contoh: 20,79K atau 1,5jt)");
      }

      console.log("🔄 [expense] Menghubungi Google Sheets...");
      const rows = await fetchAllRows();
      
      const info = getLastSaldo(rows, akun);
      const saldoSebelum = info.saldo;
      const saldoSesudah = saldoSebelum + jumlah;
      const tag = `#${akun.toLowerCase()}`;
      const catatan = "-";

      console.log("📤 [expense] Mengirim preview ke Telegram...");
      const msg = await ctx.reply(
        `🧾 **PREVIEW TRANSAKSI (Pemasukan)**\n\n` +
        `📝 Deskripsi: ${customDeskripsi}\n` +
        `💰 Masuk: ${formatRupiah(jumlah)} ke ${akun}\n` +
        `📈 Saldo Sebelumnya: ${formatRupiah(saldoSebelum)}\n` +
        `📈 Saldo Sesudah: ${formatRupiah(saldoSesudah)}\n\n` +
        `Tag: ${tag} | Catatan: ${catatan}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Simpan", callback_data: "expense:save:ok" }],
              [{ text: "❌ Batal", callback_data: "expense:cancel" }],
            ],
          },
        }
      );

      states.set(ctx.from.id, {
        chatId: ctx.chat.id,
        messageId: msg.message_id,
        jenis: "Pemasukan",
        kategori: "Lainnya",
        subKategori: "Pemasukan Lain",
        deskripsi: customDeskripsi,
        jumlah,
        mataUang: info.mataUang,
        akun,
        metode: "Transfer",
        tag,
        catatan,
        saldoSebelum,
        saldoSesudah,
      });
      console.log("✅ [expense] Transaksi berhasil diproses dan menunggu konfirmasi.");

    } catch (error) {
      console.error("💥 [expense] CRASH TOTAL:", error);
      ctx.reply(`❌ Terjadi kesalahan sistem: ${error.message}`).catch(console.error);
    }
  },

  async handleCallback(ctx) {
    try {
      await ctx.answerCallbackQuery().catch(() => {});
      if (!ctx.callbackQuery?.data?.startsWith("expense:")) return;

      const state = states.get(ctx.from.id);
      if (!state) {
        return ctx.reply("❌ Sesi transaksi telah berakhir atau tidak ditemukan. Silakan ulangi perintah.");
      }

      const edit = (text, markup) => safeEdit(ctx, state.chatId, state.messageId, text, markup);
      const data = ctx.callbackQuery.data;

      if (data === "expense:cancel") {
        states.delete(ctx.from.id);
        return edit("❌ Transaksi dibatalkan.");
      }

      if (data === "expense:save:ok") {
        const now = new Date().toISOString();
        const entry = [
          state.jenis,
          state.kategori,
          state.subKategori,
          state.deskripsi,
          state.jumlah,
          state.mataUang,
          state.akun,
          state.metode,
          state.saldoSebelum,
          state.saldoSesudah,
          state.tag,
          state.catatan,
          now,
          now,
        ];

        console.log("💾 [expense] Menyimpan ke Google Sheets...");
        await appendRows([entry]);
        states.delete(ctx.from.id);

        const successText = `✅ Transaksi berhasil disimpan!\n\n` +
          `🧾 **DETAIL:**\n` +
          `📝 Deskripsi: ${state.deskripsi}\n` +
          `💰 Masuk: ${formatRupiah(state.jumlah)} ke ${state.akun}\n` +
          `📈 Saldo: ${formatRupiah(state.saldoSebelum)} → ${formatRupiah(state.saldoSesudah)}\n\n` +
          `Tag: ${state.tag} | Catatan: ${state.catatan}`;

        return edit(successText, { parse_mode: "Markdown" });
      }
    } catch (error) {
      console.error("💥 [expense] Callback CRASH:", error);
      try {
        await ctx.editMessageText(`❌ Gagal memproses: ${error.message}`);
      } catch (e) {
        await ctx.reply(`❌ Gagal memproses: ${error.message}`).catch(console.error);
      }
    }
  },
};