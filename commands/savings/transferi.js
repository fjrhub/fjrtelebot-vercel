import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */
const OPTIONS = {
  akun: ["Wallet", "Dana", "Seabank", "Bank", "Binance", "Fjlsaldo", "Gopay"],
};

/* =========================
   STATE
========================= */
const states = new Map();

/* =========================
   UTIL
========================= */
const toNumber = (v) => {
  let s = String(v).trim().toLowerCase();
  let multiplier = 1;

  if (s.endsWith("k")) {
    multiplier = 1000;
    s = s.slice(0, -1);
  } else if (s.endsWith("jt") || s.endsWith("juta")) {
    multiplier = 1000000;
    s = s.replace(/jt|juta/g, "");
  } else if (s.endsWith("m") || s.endsWith("mil")) {
    multiplier = 1000000;
    s = s.replace(/m|mil/g, "");
  }

  s = s.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");

  return Number(s) * multiplier;
};

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
const kbConfirm = () => ({
  inline_keyboard: [
    [{ text: "✅ Simpan", callback_data: "transferi:save:ok" }],
    [{ text: "❌ Cancel", callback_data: "transferi:cancel" }],
  ],
});

/* =========================
   COMMAND
========================= */
export default {
  name: "transferi",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    let commandText = ctx.message.text;
    let customDeskripsi = null;

    // Ekstrak flag -deskripsi atau -desc (mendukung tanda kutip untuk spasi)
    const descRegex = /-(?:deskripsi|desc)\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i;
    const descMatch = commandText.match(descRegex);

    if (descMatch) {
      customDeskripsi = descMatch[1] || descMatch[2] || descMatch[3];
      // Hapus flag deskripsi dari teks perintah agar parsing argumen sisa tetap bersih
      commandText = commandText
        .replace(descMatch[0], "")
        .replace(/\s+/g, " ")
        .trim();
    }

    const args = commandText.split(/\s+/);
    args.shift(); // Hapus command (/transferi atau /transferi@bot)

    const withAdmin = args.includes("-admin");
    if (withAdmin) {
      const adminIndex = args.indexOf("-admin");
      args.splice(adminIndex, 1);
    }

    let asalStr, tujuanStr, jumlahKirimStr, jumlahTerimaStr;

    if (withAdmin) {
      if (args.length !== 4) {
        return ctx.reply(
          "❌ **Format salah untuk mode Admin.**\n\n" +
            "**Cara Penggunaan:**\n" +
            "`/transferi -admin <asal> <tujuan> <jumlah_kirim> <jumlah_terima>`\n\n" +
            "**Contoh:**\n" +
            "• `/transferi -admin Seabank Dana 11k 10k` *(Kirim 11rb, Diterima 10rb)*\n" +
            '• `/transferi -desc "Biaya Pro" -admin Seabank Dana 11k 10k`\n\n' +
            "*Tips: Flag `-desc` bisa ditaruh di posisi mana saja.*",
          { parse_mode: "Markdown" },
        );
      }
      [asalStr, tujuanStr, jumlahKirimStr, jumlahTerimaStr] = args;
    } else {
      if (args.length !== 3) {
        return ctx.reply(
          "❌ **Format salah.**\n\n" +
            "**Cara Penggunaan:**\n" +
            "`/transferi <asal> <tujuan> <jumlah>`\n\n" +
            "**Contoh:**\n" +
            "• **Normal:** `/transferi Seabank Dana 100k`\n" +
            "• **Pecahan (Kirim/Terima):** `/transferi Seabank Dana 11k/10k`\n" +
            '• **Pakai Deskripsi:** `/transferi -desc "Bayar Hutang" Seabank Dana 100k`\n\n' +
            "*Tips: Flag `-desc` bisa ditaruh di posisi mana saja.*",
          { parse_mode: "Markdown" },
        );
      }
      [asalStr, tujuanStr, jumlahKirimStr] = args;
      const parts = jumlahKirimStr.split("/");
      jumlahKirimStr = parts[0];
      jumlahTerimaStr = parts[1];
    }

    const findAkun = (str) =>
      OPTIONS.akun.find((a) => a.toLowerCase() === str.toLowerCase());
    const akunAsal = findAkun(asalStr);
    const akunTujuan = findAkun(tujuanStr);

    if (!akunAsal)
      return ctx.reply(`❌ Akun asal "${asalStr}" tidak ditemukan.`);
    if (!akunTujuan)
      return ctx.reply(`❌ Akun tujuan "${tujuanStr}" tidak ditemukan.`);
    if (akunAsal === akunTujuan)
      return ctx.reply("❌ Akun asal dan tujuan tidak boleh sama.");

    const jumlahKirim = toNumber(jumlahKirimStr);
    const jumlahTerima = jumlahTerimaStr
      ? toNumber(jumlahTerimaStr)
      : jumlahKirim;

    if (isNaN(jumlahKirim) || jumlahKirim <= 0)
      return ctx.reply("❌ Jumlah kirim tidak valid.");
    if (isNaN(jumlahTerima) || jumlahTerima <= 0)
      return ctx.reply("❌ Jumlah diterima tidak valid.");
    if (jumlahTerima > jumlahKirim)
      return ctx.reply(
        "❌ Jumlah diterima tidak boleh lebih besar dari jumlah kirim.",
      );

    const rows = await fetchAllRows();
    const asal = getLastSaldo(rows, akunAsal);
    const tujuan = getLastSaldo(rows, akunTujuan);

    if (asal.saldo < jumlahKirim) {
      return ctx.reply(
        `❌ Saldo ${akunAsal} tidak mencukupi.\nSaldo: ${asal.mataUang}${format(asal.saldo)}`,
      );
    }

    const admin = jumlahKirim - jumlahTerima;
    const deskripsi =
      customDeskripsi || `Transfer ${akunAsal} ke ${akunTujuan}`;
    const tag = "#transfer";
    const catatan = "-";

    const state = {
      step: "confirm",
      chatId: ctx.chat.id,
      messageId: null,
      rows,
      akunAsal,
      akunTujuan,
      jumlahKirim,
      jumlahTerima,
      admin,
      withAdmin,
      deskripsi,
      tag,
      catatan,
      asal,
      tujuan,
    };

    states.set(ctx.from.id, state);
    return this.render(ctx, state);
  },

  async handleCallback(ctx) {
    await ctx.answerCallbackQuery().catch(() => {});
    const state = states.get(ctx.from.id);
    if (!state) return;

    const edit = async (text, markup) => {
      try {
        await ctx.api.editMessageText(state.chatId, state.messageId, text, {
          reply_markup: markup,
        });
      } catch (e) {
        console.error(e);
      }
    };

    const data = ctx.callbackQuery.data;

    if (data === "transferi:cancel" || data === "transferi:back") {
      states.delete(ctx.from.id);
      return edit("❌ Transfer dibatalkan.", { inline_keyboard: [] });
    }

    const [, step] = data.split(":");

    if (step === "save") {
      const now = new Date().toISOString();
      const asal = state.asal;
      const tujuan = state.tujuan;

      let catatanFinal = state.catatan;
      if ((state.withAdmin || state.admin > 0) && state.admin > 0) {
        catatanFinal += `, fee ${format(state.admin)}`;
      }

      await appendRows([
        [
          "Pengeluaran",
          "Transfer",
          "Antar Akun",
          state.deskripsi,
          state.jumlahKirim,
          asal.mataUang,
          state.akunAsal,
          "Transfer",
          asal.saldo,
          asal.saldo - state.jumlahKirim,
          state.tag,
          catatanFinal,
          now,
          now,
        ],
        [
          "Pemasukan",
          "Transfer",
          "Antar Akun",
          state.deskripsi,
          state.jumlahTerima,
          tujuan.mataUang,
          state.akunTujuan,
          "Transfer",
          tujuan.saldo,
          tujuan.saldo + state.jumlahTerima,
          state.tag,
          catatanFinal,
          now,
          now,
        ],
      ]);

      states.delete(ctx.from.id);

      const adminText =
        (state.withAdmin || state.admin > 0) && state.admin > 0
          ? `\nBiaya Admin: ${asal.mataUang}${format(state.admin)}`
          : "";

      return edit(
        `✅ TRANSFER BERHASIL DISIMPAN

Deskripsi: ${state.deskripsi}

Jumlah Kirim: ${asal.mataUang}${format(state.jumlahKirim)}
Jumlah Diterima: ${asal.mataUang}${format(state.jumlahTerima)}${adminText}

Dari: ${state.akunAsal}
Saldo: ${format(asal.saldo)} → ${format(asal.saldo - state.jumlahKirim)}

Ke: ${state.akunTujuan}
Saldo: ${format(tujuan.saldo)} → ${format(tujuan.saldo + state.jumlahTerima)}

Tag: ${state.tag}
Catatan: ${state.catatan}

🕒 ${new Date().toLocaleString("id-ID")}`,
        { inline_keyboard: [] },
      );
    }
  },

  async render(ctx, state) {
    const edit = async (text, markup) => {
      try {
        if (state.messageId) {
          await ctx.api.editMessageText(state.chatId, state.messageId, text, {
            reply_markup: markup,
          });
        } else {
          const msg = await ctx.reply(text, { reply_markup: markup });
          state.messageId = msg.message_id;
        }
      } catch (e) {
        console.error(e);
      }
    };

    if (state.step === "confirm") {
      const {
        akunAsal,
        akunTujuan,
        jumlahKirim,
        jumlahTerima,
        admin,
        deskripsi,
        tag,
        catatan,
        asal,
        tujuan,
        withAdmin,
      } = state;

      const adminText =
        (withAdmin || admin > 0) && admin > 0
          ? `\nBiaya Admin: ${asal.mataUang}${format(admin)}`
          : "";

      return edit(
        `🧾 KONFIRMASI TRANSFER

Deskripsi: ${deskripsi}

Jumlah Kirim: ${asal.mataUang}${format(jumlahKirim)}
Jumlah Diterima: ${asal.mataUang}${format(jumlahTerima)}${adminText}

Dari: ${akunAsal}
Saldo: ${format(asal.saldo)} → ${format(asal.saldo - jumlahKirim)}

Ke: ${akunTujuan}
Saldo: ${format(tujuan.saldo)} → ${format(tujuan.saldo + jumlahTerima)}

Tag: ${tag}
Catatan: ${catatan}

Lanjutkan?`,
        kbConfirm(),
      );
    }
  },
};
