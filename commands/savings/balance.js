import { google } from "googleapis";
import PDFDocument from "pdfkit";
import { InputFile } from "grammy";

/* =========================
   GOOGLE SHEETS CLIENT
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

/* =========================
   UTIL
========================= */
const formatRp = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");

function parseRp(value) {
  if (!value) return 0;
  const cleaned = String(value)
    .replace(/[^0-9,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

function getJakartaTime() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
  const dd   = String(now.getDate()).padStart(2, "0");
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh   = String(now.getHours()).padStart(2, "0");
  const min  = String(now.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}.${min} WIB`;
}

/* =========================
   DATA
========================= */
async function getAccountsNormal() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet2!A2:B",
  });
  return res.data.values || [];
}

async function getAccountsFormatted() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet2!E2:F",
  });
  return res.data.values || [];
}

/* =========================
   KATEGORI & WARNA ASET
========================= */
const KATEGORI = {
  "Emas Dana" : "Investasi",
  "Bitcoin"   : "Investasi",
  "PAXG"      : "Investasi",
  "USDT"      : "Investasi",
  "Seabank"   : "Modal Bisnis",
  "Wallet"    : "Modal Bisnis",
  "Dana"      : "Modal Bisnis",
  "FJIsaldo"  : "Modal Bisnis",
  "Bank"      : "Dana Darurat",
};

const ASSET_RGB = {
  "Emas Dana" : [74,  158, 237],
  "Seabank"   : [239,  68,  68],
  "Wallet"    : [245, 158,  11],
  "Bitcoin"   : [217, 119,   6],
  "PAXG"      : [139,  92, 246],
  "USDT"      : [ 34, 197,  94],
  "FJIsaldo"  : [  6, 182, 212],
  "Bank"      : [  6, 182, 212],
  "Dana"      : [236,  72, 153],
};

const getAssetRgb = (name) => ASSET_RGB[name] || [173, 181, 189];

/* =========================
   PDF GENERATOR
   returns Buffer
========================= */
function generatePdf(rows, timestamp) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];
    doc.on("data",  (c) => chunks.push(c));
    doc.on("end",   ()  => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW  = doc.page.width;   // 595
    const margin = 40;
    const inner  = pageW - margin * 2; // 515

    // ── Warna ──
    const ACCENT      = "#2563eb";
    const GREEN       = "#15803d";
    const DARK        = "#1e1e1e";
    const GRAY        = "#757575";
    const GRAY_LIGHT  = "#f1f3f5";
    const GRAY_MID    = "#dee2e6";
    const WHITE       = "#ffffff";

    // ─────────────────────────────────────────
    //  HEADER BANNER
    // ─────────────────────────────────────────
    doc.rect(0, 0, pageW, 76).fill(ACCENT);

    doc.fillColor(WHITE).fontSize(20).font("Helvetica-Bold")
       .text("Laporan Saldo Aset", margin, 16, { align: "center", width: inner });

    doc.fillColor(WHITE).fontSize(9).font("Helvetica")
       .text(`CahayaMalamBot  •  ${timestamp}`, margin, 48, { align: "center", width: inner });

    let y = 90;

    // ─────────────────────────────────────────
    //  HITUNG DATA
    // ─────────────────────────────────────────
    const parsed   = rows.map(([name, raw]) => ({ name, val: parseRp(raw) }));
    const total    = parsed.reduce((s, r) => s + r.val, 0);
    const invTotal = parsed.filter(r => KATEGORI[r.name] === "Investasi").reduce((s, r) => s + r.val, 0);
    const bizTotal = parsed.filter(r => KATEGORI[r.name] === "Modal Bisnis").reduce((s, r) => s + r.val, 0);
    const emgTotal = parsed.filter(r => KATEGORI[r.name] === "Dana Darurat").reduce((s, r) => s + r.val, 0);

    // ─────────────────────────────────────────
    //  TOTAL BESAR
    // ─────────────────────────────────────────
    doc.roundedRect(margin, y, inner, 40, 8).fill(GRAY_LIGHT);
    doc.fillColor(GREEN).fontSize(17).font("Helvetica-Bold")
       .text(`Total Aset: ${formatRp(total)}`, margin, y + 11, { align: "center", width: inner });
    y += 52;

    // ─────────────────────────────────────────
    //  RINGKASAN KATEGORI (3 kotak)
    // ─────────────────────────────────────────
    doc.fillColor(ACCENT).fontSize(11).font("Helvetica-Bold").text("Ringkasan Kategori", margin, y);
    y += 16;

    const catW = (inner - 12) / 3;
    const cats = [
      { label: "Investasi Murni", val: invTotal, bg: "#d3f9d8", fg: "#14532d" },
      { label: "Modal Bisnis",    val: bizTotal, bg: "#fff3bf", fg: "#78350f" },
      { label: "Dana Darurat",    val: emgTotal, bg: "#dbe4ff", fg: "#1e3a5f" },
    ];

    cats.forEach((cat, i) => {
      const cx = margin + i * (catW + 6);
      doc.roundedRect(cx, y, catW, 52, 6).fill(cat.bg);
      doc.fillColor(cat.fg).fontSize(8).font("Helvetica-Bold")
         .text(cat.label, cx + 8, y + 7, { width: catW - 16 });
      doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold")
         .text(formatRp(cat.val), cx + 8, y + 21, { width: catW - 16 });
      doc.fillColor(cat.fg).fontSize(8).font("Helvetica")
         .text(`${(cat.val / total * 100).toFixed(1)}% dari total`, cx + 8, y + 37, { width: catW - 16 });
    });
    y += 64;

    // ─────────────────────────────────────────
    //  PROGRESS BAR
    // ─────────────────────────────────────────
    const GOAL  = 10_000_000;
    const pct   = Math.min(total / GOAL, 1);

    doc.fillColor(ACCENT).fontSize(11).font("Helvetica-Bold")
       .text("Progress Menuju Goal Rp 10.000.000", margin, y);
    y += 15;

    const barH = 22;
    // bg
    doc.roundedRect(margin, y, inner, barH, 5).fill(GRAY_MID);
    // fill
    const fillPx = Math.max(inner * pct, 8);
    doc.roundedRect(margin, y, fillPx, barH, 5).fill(GREEN);
    // label dalam bar
    doc.fillColor(WHITE).fontSize(9).font("Helvetica-Bold")
       .text(`${(pct * 100).toFixed(1)}%  ${formatRp(total)}`, margin + 8, y + 6, { width: fillPx - 10 });
    y += barH + 5;

    doc.fillColor(GRAY).fontSize(8).font("Helvetica")
       .text(`Sisa: ${formatRp(GOAL - total)}  |  Goal: ${formatRp(GOAL)}`,
              margin, y, { align: "right", width: inner });
    y += 18;

    // ─────────────────────────────────────────
    //  TABEL DETAIL ASET
    // ─────────────────────────────────────────
    doc.fillColor(ACCENT).fontSize(11).font("Helvetica-Bold").text("Detail Setiap Aset", margin, y);
    y += 16;

    // Kolom: No | Akun | Kategori | Saldo | Porsi | Bar
    const COL = {
      no:    { x: margin,       w: 22  },
      akun:  { x: margin + 22,  w: 110 },
      kat:   { x: margin + 132, w: 90  },
      saldo: { x: margin + 222, w: 120 },
      porsi: { x: margin + 342, w: 44  },
      bar:   { x: margin + 386, w: inner - 386 },
    };
    const ROW_H = 20;

    // Header
    doc.rect(margin, y, inner, ROW_H).fill(DARK);
    doc.fillColor(WHITE).fontSize(8).font("Helvetica-Bold");
    [
      ["No",       COL.no],
      ["Akun",     COL.akun],
      ["Kategori", COL.kat],
      ["Saldo",    COL.saldo],
      ["%",        COL.porsi],
      ["Bar",      COL.bar],
    ].forEach(([label, col]) => {
      doc.text(label, col.x + 3, y + 6, { width: col.w - 4 });
    });
    y += ROW_H;

    // Data rows
    parsed.forEach(({ name, val }, i) => {
      const rowBg    = i % 2 === 0 ? GRAY_LIGHT : WHITE;
      const [r, g, b] = getAssetRgb(name);
      const pctVal   = val / total;

      doc.rect(margin, y, inner, ROW_H).fill(rowBg);

      // No
      doc.fillColor(GRAY).fontSize(8).font("Helvetica")
         .text(String(i + 1), COL.no.x + 3, y + 6, { width: COL.no.w - 4 });
      // Akun
      doc.fillColor(DARK).font("Helvetica-Bold")
         .text(name, COL.akun.x + 3, y + 6, { width: COL.akun.w - 4 });
      // Kategori
      doc.fillColor(GRAY).font("Helvetica")
         .text(KATEGORI[name] || "-", COL.kat.x + 3, y + 6, { width: COL.kat.w - 4 });
      // Saldo (kanan)
      doc.fillColor(DARK).font("Helvetica-Bold")
         .text(formatRp(val), COL.saldo.x + 3, y + 6, { width: COL.saldo.w - 6, align: "right" });
      // Porsi
      doc.fillColor(GRAY).font("Helvetica")
         .text(`${(pctVal * 100).toFixed(1)}%`, COL.porsi.x + 2, y + 6, { width: COL.porsi.w - 4, align: "right" });
      // Mini bar
      const barInner = COL.bar.w - 10;
      doc.rect(COL.bar.x + 4, y + 6, barInner, 8).fill(GRAY_MID);
      doc.rect(COL.bar.x + 4, y + 6, Math.max(barInner * pctVal, 2), 8)
         .fill(`rgb(${r},${g},${b})`);

      // Divider
      doc.moveTo(margin, y + ROW_H).lineTo(margin + inner, y + ROW_H)
         .strokeColor(GRAY_MID).lineWidth(0.3).stroke();

      y += ROW_H;
    });

    // Row total
    doc.rect(margin, y, inner, ROW_H).fill("#e5dbff");
    doc.fillColor(DARK).fontSize(9).font("Helvetica-Bold")
       .text("TOTAL", COL.akun.x + 3, y + 5, { width: COL.akun.w - 4 })
       .text(formatRp(total), COL.saldo.x + 3, y + 5, { width: COL.saldo.w - 6, align: "right" })
       .text("100%", COL.porsi.x + 2, y + 5, { width: COL.porsi.w - 4, align: "right" });

    y += ROW_H + 20;

    // ─────────────────────────────────────────
    //  FOOTER
    // ─────────────────────────────────────────
    doc.moveTo(margin, y).lineTo(margin + inner, y)
       .strokeColor(GRAY_MID).lineWidth(0.6).stroke();
    y += 8;

    doc.fillColor(GRAY).fontSize(7.5).font("Helvetica")
       .text(
         "Investasi = Emas Dana, BTC, PAXG, USDT  •  Modal Bisnis = Seabank, Wallet, Dana, FJIsaldo  •  Dana Darurat = Bank",
         margin, y, { align: "center", width: inner }
       )
       .text(
         `Digenerate otomatis oleh CahayaMalamBot  •  ${timestamp}`,
         margin, y + 14, { align: "center", width: inner }
       );

    doc.end();
  });
}

/* =========================
   COMMAND
========================= */
export default {
  name: "balance",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    const text  = ctx.message?.text || "";
    const isPdf = text.includes("-pdf");
    const isAll = isPdf || text.includes("-a");

    const rows = isAll
      ? await getAccountsFormatted()
      : await getAccountsNormal();

    if (!rows.length) return ctx.reply("Tidak ada data akun.");

    const timestamp = getJakartaTime();
    let totalRp = 0;

    const accountMessages = rows.map(([akun, rawSaldo]) => {
      const saldo = isAll ? parseRp(rawSaldo) : (Number(rawSaldo) || 0);
      totalRp += saldo;
      return `🧾 Account : ${akun}\n💰 Balance: ${formatRp(saldo)}`;
    });

    const textMessage = `
📊 Account Balances

${accountMessages.join("\n\n")}

━━━━━━━━━━━━
🔢 Total : ${formatRp(totalRp)}
📅 Last updated: ${timestamp}
`.trim();

    if (isPdf) {
      // Kirim PDF sebagai dokumen
      const pdfBuffer = await generatePdf(rows, timestamp);
      await ctx.replyWithDocument(
        new InputFile(pdfBuffer, `balance_${Date.now()}.pdf`),
        { caption: `📄 Laporan lengkap aset  •  ${timestamp}` }
      );
    } else {
      await ctx.reply(textMessage);
    }
  },
};