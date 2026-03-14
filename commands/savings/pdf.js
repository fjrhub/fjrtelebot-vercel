import PDFDocument from "pdfkit";
import QRCode      from "qrcode";
import { PassThrough } from "stream";
import { InputFile } from "grammy";

/* =============================================================
   RPP02N THERMAL PRINTER SPECS
   - Paper width : 58mm  → 164 pt
   - Margin      : 5mm   →  14 pt each side
   - Content     : 48mm  → 136 pt
   ============================================================= */

const MM_TO_PT   = 72 / 25.4;
const PAGE_WIDTH = Math.round(58 * MM_TO_PT);  // 164 pt
const MARGIN     = Math.round(5  * MM_TO_PT);  //  14 pt
const CONTENT_W  = PAGE_WIDTH - MARGIN * 2;    // 136 pt

const FONT_SIZE = {
  title  : 14,
  sub    : 11,
  label  : 10,
  token  : 18,
  body   :  8,
  footer :  9,
};

/* =============================================================
   FOOTER LAYOUT — QR kiri, teks kanan
   QR  : 40pt × 40pt
   Gap : 4pt
   Teks: CONTENT_W - 40 - 4 = 92pt
   ============================================================= */
const QR_SIZE    = 40;
const QR_GAP     = 4;
const FOOTER_TXT = CONTENT_W - QR_SIZE - QR_GAP;  // 92 pt

/* =============================================================
   CHAR WIDTH — Courier monospace ~0.6
   ============================================================= */

const CHAR_RATIO = 0.6;

function charWidth(fontSize) { return fontSize * CHAR_RATIO; }
function charsPerLine(fontSize, widthPt = CONTENT_W) {
  return Math.floor(widthPt / charWidth(fontSize));
}

/* =============================================================
   BLOCK TYPES
   ============================================================= */

function blockFull(text, size, align = "center", lineGap = 2) {
  return { type: "full", text, size, align, lineGap };
}

function blockRow(label, value, size = FONT_SIZE.body, lineGap = 3) {
  return { type: "row", label, value, size, lineGap };
}

function blockDivider(lineGap = 4) {
  const cols = charsPerLine(FONT_SIZE.body);
  return { type: "full", text: "-".repeat(cols), size: FONT_SIZE.body, align: "left", lineGap };
}

function blockFooter(qrData) {
  return { type: "footer", qrData };
}

/* =============================================================
   TOKEN FORMATTER
   ============================================================= */

function formatToken(raw) {
  const digits  = raw.replace(/\D/g, "");
  const chunks  = digits.match(/.{1,4}/g) ?? [];
  const chunkW  = charWidth(FONT_SIZE.token) * 5;
  const perLine = Math.max(1, Math.floor(CONTENT_W / chunkW));
  const lines   = [];
  for (let i = 0; i < chunks.length; i += perLine) {
    lines.push(chunks.slice(i, i + perLine).join(" "));
  }
  return lines;
}

/* =============================================================
   WORD WRAP
   ============================================================= */

function wrapWords(str, maxCols) {
  const words  = str.split(" ");
  const result = [];
  let current  = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (candidate.length <= maxCols) {
      current = candidate;
    } else {
      if (current) result.push(current);
      let w = word;
      while (w.length > maxCols) { result.push(w.slice(0, maxCols)); w = w.slice(maxCols); }
      current = w;
    }
  }
  if (current) result.push(current);
  return result;
}

/* =============================================================
   QR CONTENT
   Sesimpel mungkin — hanya data penting, format key:value
   tanpa dekorasi, biar QR kecil dan mudah discan
   ============================================================= */

function buildQrContent(data) {
  const digits = data.token.replace(/\D/g, "");
  const token  = (digits.match(/.{1,4}/g) ?? []).join(" ");

  return [
    `TOKEN LISTRIK PLN`,
    `TOKEN: ${token}`,
    `No Pesanan: ${data.orderId}`,
    `Produk: ${data.product}`,
    `No Pelanggan: ${data.customerId}`,
    `Nama: ${data.name}`,
    `Tanggal: ${data.date}`,
  ].join("\n");
}

/* =============================================================
   BUILD LAYOUT
   ============================================================= */

function buildBlocks(data) {
  const tokenBlocks = formatToken(data.token).map((t) =>
    blockFull(t, FONT_SIZE.token, "center", 3)
  );

  const qrData = buildQrContent(data);

  return [
    blockFull("TOKEN LISTRIK", FONT_SIZE.title, "center", 1),
    blockDivider(3),
    blockFull("TOKEN",         FONT_SIZE.label, "center", 3),
    ...tokenBlocks,
    blockDivider(3),
    blockRow("No Pesanan",   data.orderId),
    blockRow("Produk",       data.product),
    blockRow("No Pelanggan", data.customerId),
    blockRow("Nama",         data.name),
    blockRow("Tanggal",      data.date, FONT_SIZE.body, 0),
    blockDivider(3),
    blockFooter(qrData),
  ];
}

/* =============================================================
   RENDERER
   ============================================================= */

function renderBlock(doc, block, qrImageBuffer = null) {
  const { size, lineGap } = block;

  // ── FULL ─────────────────────────────────────────────────────
  if (block.type === "full") {
    doc.font("Courier-Bold").fontSize(size);
    doc.text(block.text, MARGIN, doc.y, {
      width  : CONTENT_W,
      align  : block.align,
      lineGap: lineGap ?? 2,
    });
    return;
  }

  // ── ROW ──────────────────────────────────────────────────────
  if (block.type === "row") {
    doc.font("Courier-Bold").fontSize(size);
    const cw        = charWidth(size);
    const totalCols = Math.floor(CONTENT_W / cw);
    const sep       = " : ";
    const sepLen    = sep.length;
    const labelCols = 12;
    const valueCols = totalCols - labelCols - sepLen;

    const labelStr  = block.label.padEnd(labelCols).slice(0, labelCols);
    const value     = String(block.value);
    const valueLines = wrapWords(value, valueCols);

    const line1 = labelStr + sep + valueLines[0].padStart(valueCols);
    doc.text(line1, MARGIN, doc.y, {
      width  : CONTENT_W,
      align  : "left",
      lineGap: valueLines.length > 1 ? 0 : (lineGap ?? 3),
    });

    const indent = " ".repeat(labelCols + sepLen);
    for (let i = 1; i < valueLines.length; i++) {
      const isLast = i === valueLines.length - 1;
      doc.text(indent + valueLines[i].padStart(valueCols), MARGIN, doc.y, {
        width  : CONTENT_W,
        align  : "left",
        lineGap: isLast ? (lineGap ?? 3) : 0,
      });
    }
    return;
  }

  // ── FOOTER (QR kiri + teks kanan) ────────────────────────────
  if (block.type === "footer") {
    const startY   = doc.y;
    const qrX      = MARGIN;
    const textX    = MARGIN + QR_SIZE + QR_GAP;
    const footerFs = FONT_SIZE.footer;

    doc.font("Courier-Bold").fontSize(footerFs);
    const textCols = Math.floor(FOOTER_TXT / charWidth(footerFs));
    const footerMsg = "Simpan token ini untuk mengisi meteran listrik Anda";
    const msgLines  = wrapWords(footerMsg, textCols);
    const lineH     = footerFs * 1.2;

    const msgH  = msgLines.length * lineH;
    const tkH   = lineH;
    const gapH  = lineH * 0.6;
    const textH = msgH + gapH + tkH;

    const footerH = Math.max(QR_SIZE, textH);

    // Render QR
    if (qrImageBuffer) {
      doc.image(qrImageBuffer, qrX, startY, {
        width : QR_SIZE,
        height: QR_SIZE,
      });
    }

    // Teks "Simpan..." di kanan
    const textOffsetY = (footerH - textH) / 2;
    let curY = startY + Math.max(0, textOffsetY);

    for (const ln of msgLines) {
      doc.font("Courier-Bold").fontSize(footerFs)
        .text(ln, textX, curY, { width: FOOTER_TXT, align: "left", lineGap: 0 });
      curY += lineH;
    }

    curY += gapH;

    // "Terima Kasih" tengah penuh
    doc.font("Courier-Bold").fontSize(footerFs)
      .text("Terima Kasih", MARGIN, curY, {
        width : CONTENT_W,
        align : "center",
        lineGap: 0,
      });

    doc.y = startY + footerH + 4;
  }
}

/* =============================================================
   HEIGHT MEASUREMENT
   ============================================================= */

async function measureHeight(blocks, qrBuf) {
  const doc = new PDFDocument({ size: [PAGE_WIDTH, 9999], margin: MARGIN });
  doc.pipe(new PassThrough());

  const startY = doc.y;
  for (const block of blocks) renderBlock(doc, block, qrBuf);
  const contentH = doc.y - startY;

  doc.end();
  return MARGIN + contentH + MARGIN + 6;
}

/* =============================================================
   PDF GENERATOR
   ============================================================= */

/**
 * @typedef {object} StrukData
 * @property {string} token
 * @property {string} orderId
 * @property {string} product
 * @property {string} customerId
 * @property {string} name
 * @property {string} date
 */
async function createStruk(data) {
  const blocks     = buildBlocks(data);
  const qrContent  = buildQrContent(data);

  const qrBuf = await QRCode.toBuffer(qrContent, {
    type                : "png",
    width               : QR_SIZE * 3,
    margin              : 1,
    errorCorrectionLevel: "L",  // L = data paling sedikit → QR paling mudah discan
  });

  const height = await measureHeight(blocks, qrBuf);

  const doc    = new PDFDocument({ size: [PAGE_WIDTH, height], margin: MARGIN });
  const stream = new PassThrough();
  doc.pipe(stream);

  for (const block of blocks) renderBlock(doc, block, qrBuf);

  doc.end();
  return stream;
}

/* =============================================================
   PARSER
   ============================================================= */

const USAGE = `
Kirim data transaksi setelah perintah, contoh\\:

\`\`\`
/pdf Nomor token
Pastikan KRN kWh Listrik Prabayar telah di\\-update\\.
3423 2455 9594 9828 6799
Rincian Pembayaran
Nomor pesanan:2773452397203286133
Produk:Token PLN 20\\.000
Nomor pelanggan:32132803357
Nama pelanggan:SUPARDI
Tanggal transaksi:14 Mar 2026
\`\`\`
`.trim();

function extractField(lines, key) {
  const re = new RegExp(`^${key}\\s*:\\s*(.+)$`, "i");
  for (const l of lines) {
    const m = l.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

function extractToken(lines) {
  for (const l of lines) {
    const stripped = l.trim();
    if (/^[\d\s]+$/.test(stripped) && stripped.replace(/\s/g, "").length >= 8) {
      return stripped.replace(/\s/g, "");
    }
  }
  return null;
}

function simplifyProduct(raw) {
  const m = raw.match(/([\d.,]+)\s*$/);
  return m ? `PLN ${m[1].replace(/,/g, ".")}` : raw;
}

function parseInput(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const token      = extractToken(lines);
  const orderId    = extractField(lines, "Nomor pesanan");
  const productRaw = extractField(lines, "Produk");
  const product    = productRaw ? simplifyProduct(productRaw) : null;
  const customerId = extractField(lines, "Nomor pelanggan");
  const name       = extractField(lines, "Nama pelanggan");
  const date       = extractField(lines, "Tanggal transaksi");

  const missing = [
    !token      && "nomor token",
    !orderId    && "nomor pesanan",
    !product    && "produk",
    !customerId && "nomor pelanggan",
    !name       && "nama pelanggan",
    !date       && "tanggal transaksi",
  ].filter(Boolean);

  if (missing.length > 0) {
    return {
      data : null,
      error: `❌ Data tidak lengkap, field berikut tidak ditemukan:\n• ${missing.join("\n• ")}`,
    };
  }

  return { data: { token, orderId, product, customerId, name, date }, error: null };
}

/* =============================================================
   COMMAND HANDLER
   ============================================================= */

export default {
  name: "pdf",

  async execute(ctx) {
    const raw = ctx.message?.text?.replace(/^\/pdf\s*/i, "").trim();

    if (!raw) {
      return ctx.reply(USAGE, { parse_mode: "MarkdownV2" });
    }

    const { data, error } = parseInput(raw);

    if (error) {
      return ctx.reply(`${error}\n\nKetik /pdf tanpa argumen untuk melihat format yang benar.`);
    }

    try {
      const pdfStream = await createStruk(data);
      await ctx.replyWithDocument(
        new InputFile(pdfStream, "token-pln.pdf"),
        { caption: "🧾 Struk Token PLN" }
      );
    } catch (err) {
      console.error("[pdf] Gagal generate struk:", err);
      await ctx.reply("❌ Gagal membuat struk PDF. Silakan coba lagi.");
    }
  },
};