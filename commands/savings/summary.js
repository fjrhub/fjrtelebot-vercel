import { google } from "googleapis";
import { InputFile } from "grammy";

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

async function fetchTransactions() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:N",
  });
  return res.data.values || [];
}

/* =========================
   UTIL
========================= */
const fmt = (n) => `Rp${new Intl.NumberFormat("id-ID").format(Number(n) || 0)}`;

const toWIB = (iso) =>
  new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);

const getMondayOf = (date) => {
  const d = new Date(date);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const fmtShort = (date) =>
  date.toLocaleString("id-ID", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
  });

const fmtMonthYear = (year, monthIndex) => {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  return d.toLocaleString("id-ID", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
};

/* =========================
   PARSE ROW
========================= */
function parseRow(r) {
  const date = r[12] ? toWIB(r[12]) : null;
  return {
    jenis: r[0],
    jumlah: Number(r[4]) || 0,
    dibuatPada: date,
    bulanKey: date
      ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
      : null,
    monday: date ? getMondayOf(date) : null,
  };
}

/* =========================
   AGGREGATE
========================= */
function agg(transactions) {
  let masuk = 0, keluar = 0;
  for (const t of transactions) {
    if (t.jenis === "Pemasukan") masuk += t.jumlah;
    else if (t.jenis === "Pengeluaran") keluar += t.jumlah;
  }
  return { masuk, keluar, net: masuk - keluar };
}

const fmtNet = (net) => {
  const sign = net >= 0 ? "+" : "-";
  return `${sign}${fmt(Math.abs(net))}`;
};

/* =========================
   BUILD MESSAGE (TXT)
========================= */
function buildMessage(allTransactions) {
  const byMonth = {};
  for (const t of allTransactions) {
    if (!t.bulanKey) continue;
    if (!byMonth[t.bulanKey]) byMonth[t.bulanKey] = [];
    byMonth[t.bulanKey].push(t);
  }

  const sortedMonths = Object.keys(byMonth).sort((a, b) => a.localeCompare(b));
  if (!sortedMonths.length) return "Belum ada transaksi.";

  const nowWIB = toWIB(new Date().toISOString());
  const lines = [];

  // HEADER
  lines.push("================================");
  lines.push("RINGKASAN KEUANGAN");
  lines.push(`Update: ${fmtShort(nowWIB)} ${nowWIB.getUTCFullYear()}`);
  lines.push(`Total Transaksi: ${allTransactions.length}`);
  lines.push("================================");

  for (const monthKey of sortedMonths) {
    const txMonth = byMonth[monthKey];
    const [year, month] = monthKey.split("-").map(Number);
    const monthAgg = agg(txMonth);

    lines.push("");
    lines.push("--------------------------------");
    lines.push(`Bulan : ${fmtMonthYear(year, month - 1)} (${txMonth.length} trx)`);
    lines.push(`Masuk : ${fmt(monthAgg.masuk)}`);
    lines.push(`Keluar: ${fmt(monthAgg.keluar)}`);
    lines.push(`Net   : ${fmtNet(monthAgg.net)}`);

    // GROUP BY WEEK
    const byWeek = {};
    for (const t of txMonth) {
      const key = t.monday.toISOString();
      if (!byWeek[key]) byWeek[key] = { monday: t.monday, txs: [] };
      byWeek[key].txs.push(t);
    }

    const sortedWeeks = Object.values(byWeek).sort((a, b) => a.monday - b.monday);

    sortedWeeks.forEach((w, i) => {
      const weekAgg = agg(w.txs);
      const sunday = new Date(w.monday);
      sunday.setUTCDate(w.monday.getUTCDate() + 6);

      lines.push("");
      lines.push(`  Minggu ${i + 1} (${fmtShort(w.monday)} - ${fmtShort(sunday)})`);
      lines.push(`    Masuk : ${fmt(weekAgg.masuk)}`);
      lines.push(`    Keluar: ${fmt(weekAgg.keluar)}`);
      lines.push(`    Net   : ${fmtNet(weekAgg.net)}`);
    });
  }

  return lines.join("\n");
}

/* =========================
   COMMAND
========================= */
export default {
  name: "summary",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    await ctx.reply("⏳ Memuat data...");

    const rows = await fetchTransactions();
    if (!rows.length) return ctx.reply("Belum ada transaksi.");

    const allTransactions = rows
      .map(parseRow)
      .filter((t) => t.dibuatPada);

    const text = buildMessage(allTransactions);

    // Buffer → file txt
    const buffer = Buffer.from(text, "utf-8");

    // Nama file dengan tanggal
    const now = new Date();
    const fileName = `ringkasan-${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.txt`;

    return ctx.replyWithDocument(
      new InputFile(buffer, fileName),
      {
        caption: "Ringkasan keuangan berhasil dibuat",
      }
    );
  },
};