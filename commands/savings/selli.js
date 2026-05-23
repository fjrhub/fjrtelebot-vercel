// selli.js
import { google } from "googleapis";

/* =========================
   OPTIONS
========================= */
const OPTIONS = {
  akun: ["Wallet", "Dana", "Seabank", "Bank", "Fjlsaldo", "Gopay"],
};
const TOKEN_FEE = 3000;

/* =========================
   UTIL
========================= */
const toNumber = (v) =>
  Number(String(v).replace(/\./g, "").replace(",", "."));

const formatRupiah = (n) => {
  const abs = Math.abs(n).toLocaleString("id-ID");
  return n < 0 ? `-Rp${abs}` : `Rp${abs}`;
};

const formatSaldoLine = (akun, before, after, isKeluar) => {
  const icon = isKeluar ? "💸" : "💰";
  return `${icon} ${akun}: ${formatRupiah(before)} → ${formatRupiah(after)}`;
};

const parseAmount = (str) => {
  const match = str.match(/^(\d+(?:[.,]\d+)?)(k|rb|ribu|jt|juta)?$/i);
  if (!match) return null;
  let amount = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  const suffix = match[2]?.toLowerCase();
  if (["k", "rb", "ribu"].includes(suffix)) amount *= 1000;
  if (["jt", "juta"].includes(suffix)) amount *= 1000000;
  return Math.round(amount);
};

const findAkun = (name) =>
  OPTIONS.akun.find((a) => a.toLowerCase() === name.toLowerCase());

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
      return { mataUang: "Rp", saldo: Number(rows[i][4]) || 0 };
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
   COMMAND
========================= */
export default {
  name: "selli",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const args = ctx.message?.text?.trim().split(/\s+/).slice(1);
    if (args.length < 4) {
      return ctx.reply(
        "❌ Format salah.\n\nGunakan: `/selli <akunKeluar> <akunMasuk> <jumlahKeluar> <jumlahMasuk>`\nContoh: `/selli Dana Wallet 20K 22K`",
        { parse_mode: "Markdown" }
      );
    }

    const [akunKeluarRaw, akunMasukRaw, keluarRaw, masukRaw] = args;
    
    const akunKeluar = findAkun(akunKeluarRaw);
    const akunMasuk = findAkun(akunMasukRaw);

    if (!akunKeluar || !akunMasuk) {
      const valid = OPTIONS.akun.join(", ");
      return ctx.reply(
        `❌ Akun tidak valid.\nPilihan: ${valid}`
      );
    }

    if (akunKeluar === akunMasuk) {
      return ctx.reply("❌ Akun masuk dan keluar tidak boleh sama.");
    }

    const jumlahKeluar = parseAmount(keluarRaw);
    const jumlahMasuk = parseAmount(masukRaw);

    if (jumlahKeluar === null || jumlahMasuk === null) {
      return ctx.reply(
        "❌ Format jumlah salah.\nGunakan angka dengan suffix: K, rb, ribu, jt, juta\nContoh: `20K`, `1.5jt`"
      );
    }

    const rows = await fetchAllRows();
    const keluarInfo = getLastSaldo(rows, akunKeluar);
    const masukInfo = getLastSaldo(rows, akunMasuk);

    if (keluarInfo.saldo < jumlahKeluar) {
      return ctx.reply(
        `❌ Saldo ${akunKeluar} tidak mencukupi.\nTersedia: ${formatRupiah(keluarInfo.saldo)}`
      );
    }

    const saldoKeluarSebelum = keluarInfo.saldo;
    const saldoKeluarSesudah = saldoKeluarSebelum - jumlahKeluar;
    const saldoMasukSebelum = masukInfo.saldo;
    const saldoMasukSesudah = saldoMasukSebelum + jumlahMasuk;

    const now = new Date().toISOString();
    const deskripsi = `Jual ${akunMasuk}`;
    const tag = `#selli`;
    const catatan = `Auto via /selli`;

    const entries = [
      [
        "Pengeluaran",
        "Usaha",
        "Penjualan",
        deskripsi,
        jumlahKeluar,
        "Rp",
        akunKeluar,
        "Transfer",
        saldoKeluarSebelum,
        saldoKeluarSesudah,
        tag,
        catatan,
        now,
        now,
      ],
      [
        "Pemasukan",
        "Usaha",
        "Penjualan",
        deskripsi,
        jumlahMasuk,
        "Rp",
        akunMasuk,
        "Cash",
        saldoMasukSebelum,
        saldoMasukSesudah,
        tag,
        catatan,
        now,
        now,
      ],
    ];

    await appendRows(entries);

    const keuntungan = jumlahMasuk - jumlahKeluar;
    const warning = keuntungan < 0 ? "\n⚠️ Transaksi rugi." : "";

    const saldoLines = [
      formatSaldoLine(akunKeluar, saldoKeluarSebelum, saldoKeluarSesudah, true),
      formatSaldoLine(akunMasuk, saldoMasukSebelum, saldoMasukSesudah, false),
    ].join("\n");

    const successText = `✅ Transaksi jual berhasil disimpan!

🧾 DETAIL:
Deskripsi: ${deskripsi}
💸 Keluar: ${formatRupiah(jumlahKeluar)} dari ${akunKeluar}
💰 Masuk: ${formatRupiah(jumlahMasuk)} ke ${akunMasuk}
📈 Keuntungan: ${formatRupiah(keuntungan)}

${saldoLines}

Tag: ${tag}
Catatan: ${catatan}${warning}`;

    return ctx.reply(successText);
  },
};