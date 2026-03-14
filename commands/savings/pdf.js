import PDFDocument from "pdfkit";
import { PassThrough } from "stream";
import { InputFile } from "grammy";

/* =========================
   FONT CONFIG
========================= */

const FONT = {
  header: 12,   // Token - PLN
  token: 15,    // Nomor token
  body: 6,      // Nomor pesanan - tanggal
  footer: 8     // Simpan - terima kasih
};
function row(doc, label, value, fontSize = 9) {
  const labelWidth = 70;

  doc
    .font("Courier")
    .fontSize(fontSize)
    .text(label, {
      continued: true,
      width: labelWidth
    })
    .text(`: ${value}`);
}

function createStruk() {

  const lines = [

    { text: "TOKEN LISTRIK", size: FONT.header, align: "center" },
    { text: "PLN", size: FONT.header - 2, align: "center" },

    { text: "--------------------------------", size: FONT.body, align: "center" },

    { text: "TOKEN", size: FONT.header, align: "center" },

    { text: "3423 2455 9594", size: FONT.token, align: "center" },
    { text: "9828 6799", size: FONT.token, align: "center" },

    { text: "--------------------------------", size: FONT.body, align: "center" },

    { text: "No Pesanan   : 2773452397203286133", size: FONT.body },
    { text: "Produk       : Token PLN 20.000", size: FONT.body },
    { text: "No Pelanggan : 32132803357", size: FONT.body },
    { text: "Nama         : SUPARDI", size: FONT.body },
    { text: "Tanggal      : 14 Mar 2026", size: FONT.body },

    { text: "--------------------------------", size: FONT.body, align: "center" },

    { text: "Simpan token ini untuk", size: FONT.footer, align: "center" },
    { text: "mengisi meteran listrik", size: FONT.footer, align: "center" },

    { text: "", size: FONT.footer },

    { text: "Terima Kasih", size: FONT.footer, align: "center" }

  ];

  const width = 164;
  const margin = 10;

  const tempDoc = new PDFDocument({ size: [width, 1000], margin });

  let height = margin;

  lines.forEach(line => {
    tempDoc.font("Courier").fontSize(line.size);
    height += tempDoc.heightOfString(line.text, {
      width: width - margin * 2
    });
  });

  height += margin * 2;

  const doc = new PDFDocument({
    size: [width, height],
    margin
  });

  const stream = new PassThrough();
  doc.pipe(stream);

  lines.forEach(line => {
    doc.font("Courier")
      .fontSize(line.size)
      .text(line.text, {
        align: line.align || "left"
      });
  });

  doc.end();

  return stream;
}

export default {
  name: "pdf",
  async execute(ctx) {

    const pdfStream = createStruk();

    await ctx.replyWithDocument(
      new InputFile(pdfStream, "token-pln.pdf")
    );

  }
};