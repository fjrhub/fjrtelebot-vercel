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

async function fetchTransactions() {
  const sheets = sheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:N",
  });

  return res.data.values || [];
}

/* =========================
   FORMATTING UTILITIES
========================= */

const formatNumber = (n) =>
  new Intl.NumberFormat("id-ID").format(Number(n) || 0);

const formatCurrency = (n) => "Rp " + formatNumber(n);

const formatDateShort = (iso) => {
  if (!iso) return "-";
  const date = new Date(iso);
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/* =========================
   COLOR PALETTE - VIBRANT
========================= */

const COLORS = {
  primary: "#2563eb",      // Bright Blue
  primaryDark: "#1e40af",  // Dark Blue
  success: "#059669",      // Emerald
  successLight: "#d1fae5", // Light Green
  danger: "#dc2626",       // Red
  dangerLight: "#fee2e2",  // Light Red
  warning: "#f59e0b",      // Orange
  purple: "#7c3aed",       // Purple
  cyan: "#06b6d4",         // Cyan
  pink: "#ec4899",         // Pink
  gray: "#64748b",
  grayLight: "#f1f5f9",
  grayDark: "#334155",
  white: "#ffffff",
  black: "#0f172a",
};

/* =========================
   DATA ANALYSIS
========================= */

function analyzeTransactions(rows) {
  const ordered = [...rows].sort((a, b) => {
    const dateA = new Date(a[12]).getTime();
    const dateB = new Date(b[12]).getTime();
    return dateA - dateB;
  });

  let totalMasuk = 0;
  let totalKeluar = 0;

  const akunSummary = {};
  const kategoriSummary = {};
  const monthlyData = {};
  const dailyTransactions = {};

  ordered.forEach((r) => {
    const [jenis, kategori, subKategori, deskripsi, jumlah, mataUang, akun, metode, , , tag, , dibuatPada] = r;

    const amount = Number(jumlah) || 0;
    const date = new Date(dibuatPada);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const dayKey = date.toISOString().split('T')[0];

    // Account Summary
    if (!akunSummary[akun]) {
      akunSummary[akun] = { masuk: 0, keluar: 0, transaksi: 0 };
    }

    // Category Summary
    if (!kategoriSummary[kategori]) {
      kategoriSummary[kategori] = { masuk: 0, keluar: 0, transaksi: 0 };
    }

    // Monthly Data
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { masuk: 0, keluar: 0, transaksi: 0 };
    }

    // Daily transactions count
    dailyTransactions[dayKey] = (dailyTransactions[dayKey] || 0) + 1;

    if (jenis === "Pemasukan" || jenis === "Initial") {
      totalMasuk += amount;
      akunSummary[akun].masuk += amount;
      kategoriSummary[kategori].masuk += amount;
      monthlyData[monthKey].masuk += amount;
    }

    if (jenis === "Pengeluaran") {
      totalKeluar += amount;
      akunSummary[akun].keluar += amount;
      kategoriSummary[kategori].keluar += amount;
      monthlyData[monthKey].keluar += amount;
    }

    akunSummary[akun].transaksi++;
    kategoriSummary[kategori].transaksi++;
    monthlyData[monthKey].transaksi++;
  });

  const saldoAkhir = totalMasuk - totalKeluar;
  const avgPemasukan = Object.keys(monthlyData).length > 0 ? totalMasuk / Object.keys(monthlyData).length : 0;
  const avgPengeluaran = Object.keys(monthlyData).length > 0 ? totalKeluar / Object.keys(monthlyData).length : 0;
  const avgPerDay = Object.keys(dailyTransactions).length > 0 ? ordered.length / Object.keys(dailyTransactions).length : 0;

  return {
    ordered,
    totalMasuk,
    totalKeluar,
    saldoAkhir,
    avgPemasukan,
    avgPengeluaran,
    avgPerDay,
    akunSummary,
    kategoriSummary,
    monthlyData,
  };
}

/* =========================
   HELPER FUNCTIONS
========================= */

function drawGradientBox(doc, x, y, width, height, color1, color2) {
  // Simulate gradient with multiple rectangles
  const steps = 20;
  const stepHeight = height / steps;
  
  for (let i = 0; i < steps; i++) {
    const opacity = 1 - (i / steps) * 0.3;
    doc.rect(x, y + (i * stepHeight), width, stepHeight)
       .fillOpacity(opacity)
       .fill(color1);
  }
  doc.fillOpacity(1); // Reset opacity
}

function drawIcon(doc, x, y, type) {
  doc.fontSize(16).fillColor(COLORS.white);
  
  const icons = {
    'money': '💰',
    'chart': '📊',
    'bank': '🏦',
    'card': '💳',
    'wallet': '👛',
    'trend': '📈',
    'calendar': '📅',
    'tag': '🏷️',
  };
  
  doc.text(icons[type] || '•', x, y);
}

/* =========================
   PDF GENERATOR
========================= */

async function generatePDF(rows, sortType = "desc") {
  return new Promise(async (resolve) => {
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      bufferPages: true, // Enable page buffering for better footer placement
    });

    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    const analysis = analyzeTransactions(rows);
    if (sortType === "desc") analysis.ordered.reverse();

    let pageNumber = 1;
    const pageHeight = doc.page.height;
    const footerHeight = 100; // Increased from 80 for more safety
    const contentMaxY = pageHeight - footerHeight;

    /* =========================
       HELPER: CHECK SPACE
    ========================= */
    
    function needsNewPage(requiredSpace = 100) {
      return doc.y + requiredSpace > contentMaxY;
    }

    function addPageIfNeeded(requiredSpace = 100, headerTitle = "") {
      if (needsNewPage(requiredSpace)) {
        drawPageFooter();
        doc.addPage();
        drawPageHeader(headerTitle);
        return true;
      }
      return false;
    }

    /* =========================
       PAGE HEADER & FOOTER
    ========================= */

    function drawPageHeader(subtitle = "") {
      // Gradient header
      drawGradientBox(doc, 0, 0, doc.page.width, 70, COLORS.primary, COLORS.primaryDark);
      
      doc.fontSize(24)
         .fillColor(COLORS.white)
         .font("Helvetica-Bold")
         .text("💼 LAPORAN KEUANGAN", 50, 20);

      if (subtitle) {
        doc.fontSize(11)
           .fillColor(COLORS.white)
           .font("Helvetica")
           .text(subtitle, 50, 48);
      }

      doc.y = 100; // Set explicit Y position after header
    }

    function drawPageFooter() {
      const footerY = contentMaxY + 15; // Reduced spacing
      
      // Footer line
      doc.moveTo(50, footerY)
         .lineTo(doc.page.width - 50, footerY)
         .strokeColor(COLORS.grayLight)
         .lineWidth(1)
         .stroke();

      doc.fontSize(8)
         .fillColor(COLORS.gray)
         .font("Helvetica")
         .text(
           `Generated: ${new Date().toLocaleDateString("id-ID")} ${new Date().toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit' })}`,
           50,
           footerY + 10,
           { width: 250, align: "left" }
         );

      // Page number - RIGHT SIDE
      doc.fontSize(9)
         .fillColor(COLORS.primary)
         .font("Helvetica-Bold")
         .text(
           `Halaman ${pageNumber}`,
           doc.page.width - 150,
           footerY + 10,
           { width: 100, align: "right" }
         );

      pageNumber++;
    }

    /* =========================
       COVER PAGE
    ========================= */

    drawPageHeader();

    // Hero Section - dengan space check
    const heroY = doc.y + 10; // Reduced from 20
    doc.roundedRect(60, heroY, doc.page.width - 120, 160, 15) // Reduced from 180
       .fill(COLORS.grayLight);

    doc.fontSize(32)
       .fillColor(COLORS.primary)
       .font("Helvetica-Bold")
       .text("Financial Report", 0, heroY + 30, { // Reduced from 40
         align: "center",
         width: doc.page.width,
       });

    doc.fontSize(14)
       .fillColor(COLORS.gray)
       .font("Helvetica")
       .text("Comprehensive Analysis & Insights", 0, heroY + 70, { // Reduced from 80
         align: "center",
         width: doc.page.width,
       });

    doc.fontSize(18)
       .fillColor(COLORS.primary)
       .font("Helvetica-Bold")
       .text(`${analysis.ordered.length} Transaksi`, 0, heroY + 105, { // Reduced from 120
         align: "center",
         width: doc.page.width,
       });

    doc.fontSize(11)
       .fillColor(COLORS.gray)
       .text(
         `${new Date().toLocaleDateString("id-ID", { 
           day: "numeric",
           month: "long", 
           year: "numeric"
         })}`,
         0,
         heroY + 135, // Reduced from 150
         { align: "center", width: doc.page.width }
       );

    // Key Metrics Cards - 3 columns
    const cardY = heroY + 190; // Reduced from 220
    const cardWidth = (doc.page.width - 140) / 3;
    const cardHeight = 90; // Reduced from 100

    const metrics = [
      { label: "Total Pemasukan", value: analysis.totalMasuk, color: COLORS.success, icon: "trend" },
      { label: "Total Pengeluaran", value: analysis.totalKeluar, color: COLORS.danger, icon: "wallet" },
      { label: "Saldo Akhir", value: analysis.saldoAkhir, color: analysis.saldoAkhir >= 0 ? COLORS.primary : COLORS.danger, icon: "money" },
    ];

    metrics.forEach((metric, idx) => {
      const cardX = 60 + idx * (cardWidth + 10);
      
      // Card shadow
      doc.roundedRect(cardX + 2, cardY + 2, cardWidth, cardHeight, 10)
         .fillOpacity(0.1)
         .fill(COLORS.black);
      doc.fillOpacity(1);
      
      // Card body
      doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 10)
         .fill(COLORS.white);
      
      // Colored top bar
      doc.roundedRect(cardX, cardY, cardWidth, 8, 10)
         .fill(metric.color);

      // Icon circle
      doc.circle(cardX + 20, cardY + 32, 15) // Adjusted
         .fillOpacity(0.1)
         .fill(metric.color);
      doc.fillOpacity(1);

      // Label
      doc.fontSize(9)
         .fillColor(COLORS.gray)
         .font("Helvetica")
         .text(metric.label, cardX + 10, cardY + 55, { width: cardWidth - 20 }); // Adjusted

      // Value
      doc.fontSize(12) // Reduced from 13
         .fillColor(metric.color)
         .font("Helvetica-Bold")
         .text(formatCurrency(metric.value), cardX + 10, cardY + 68, { // Adjusted
           width: cardWidth - 20,
           lineBreak: false,
         });
    });

    // Set Y position after cover content
    doc.y = cardY + cardHeight + 20;

    drawPageFooter();

    /* =========================
       EXECUTIVE SUMMARY
    ========================= */

    doc.addPage();
    drawPageHeader("Executive Summary");

    // Stats row
    const statsY = doc.y;
    const statWidth = (doc.page.width - 140) / 4;

    const stats = [
      { label: "Periode", value: `${Object.keys(analysis.monthlyData).length} bulan`, color: COLORS.purple },
      { label: "Avg/Bulan", value: formatCurrency(analysis.avgPemasukan), color: COLORS.cyan },
      { label: "Saving Rate", value: `${((analysis.saldoAkhir / analysis.totalMasuk) * 100).toFixed(1)}%`, color: COLORS.success },
      { label: "Avg/Hari", value: `${analysis.avgPerDay.toFixed(1)} tx`, color: COLORS.warning },
    ];

    stats.forEach((stat, idx) => {
      const statX = 50 + idx * (statWidth + 10);
      
      doc.roundedRect(statX, statsY, statWidth, 60, 8)
         .fill(stat.color);

      doc.fontSize(10)
         .fillColor(COLORS.white)
         .font("Helvetica")
         .text(stat.label, statX + 10, statsY + 15, { width: statWidth - 20 });

      doc.fontSize(12)
         .fillColor(COLORS.white)
         .font("Helvetica-Bold")
         .text(stat.value, statX + 10, statsY + 35, { width: statWidth - 20 });
    });

    doc.y = statsY + 75; // Set Y position explicitly instead of moveDown

    // Account Summary - 2 Column Layout
    doc.fontSize(16)
       .fillColor(COLORS.primary)
       .font("Helvetica-Bold")
       .text("💳 Ringkasan Per Akun");
    
    doc.y += 15; // Explicit spacing

    const accounts = Object.entries(analysis.akunSummary);
    
    // Only add accounts section if we have space
    if (accounts.length === 0) {
      doc.y += 10;
    } else {
      const col1X = 50;
      const col2X = doc.page.width / 2 + 10;
      const colWidth = doc.page.width / 2 - 70;

      let currentCol = 0;
      let currentY = doc.y;

      accounts.forEach(([akun, data], idx) => {
        const saldo = data.masuk - data.keluar;
        const x = currentCol === 0 ? col1X : col2X;
        
        // Check if we need new page BEFORE starting a row
        if (currentCol === 0 && currentY + 70 > contentMaxY) {
          drawPageFooter();
          doc.addPage();
          drawPageHeader("Executive Summary");
          currentY = doc.y;
        }

        // Account card
        doc.roundedRect(x, currentY, colWidth, 65, 8) // Reduced from 70
           .fillAndStroke(COLORS.white, COLORS.grayLight);

        // Account name
        doc.fontSize(11)
           .fillColor(COLORS.primary)
           .font("Helvetica-Bold")
           .text(akun, x + 15, currentY + 10); // Adjusted

        // Stats
        doc.fontSize(8)
           .fillColor(COLORS.gray)
           .font("Helvetica")
           .text(`Masuk: ${formatCurrency(data.masuk)}`, x + 15, currentY + 27); // Adjusted
        
        doc.text(`Keluar: ${formatCurrency(data.keluar)}`, x + 15, currentY + 38); // Adjusted

        // Saldo
        doc.fontSize(10)
           .fillColor(saldo >= 0 ? COLORS.success : COLORS.danger)
           .font("Helvetica-Bold")
           .text(`${formatCurrency(saldo)}`, x + 15, currentY + 49); // Adjusted

        if (currentCol === 0) {
          currentCol = 1;
        } else {
          currentCol = 0;
          currentY += 70; // Reduced from 75
        }
      });
      
      // Update doc.y for next section
      doc.y = currentY + (currentCol === 1 ? 70 : 0);
    }

    drawPageFooter();

    /* =========================
       CATEGORY ANALYSIS
    ========================= */

    doc.addPage();
    drawPageHeader("Analisis Kategori");

    doc.fontSize(16)
       .fillColor(COLORS.primary)
       .font("Helvetica-Bold")
       .text("📊 Top Kategori Pengeluaran");
    
    doc.y += 20; // Explicit spacing

    const sortedCat = Object.entries(analysis.kategoriSummary)
      .sort((a, b) => b[1].keluar - a[1].keluar)
      .slice(0, 10); // Top 10

    const colors = [COLORS.danger, COLORS.warning, COLORS.purple, COLORS.pink, COLORS.cyan];

    sortedCat.forEach(([kategori, data], idx) => {
      addPageIfNeeded(55, "Analisis Kategori"); // Reduced from 60

      const percentage = analysis.totalKeluar > 0 ? (data.keluar / analysis.totalKeluar) * 100 : 0;
      const color = colors[idx % colors.length];
      const y = doc.y;

      // Rank badge
      doc.circle(60, y + 8, 11) // Reduced from 12
         .fill(color);
      
      doc.fontSize(9) // Reduced from 10
         .fillColor(COLORS.white)
         .font("Helvetica-Bold")
         .text(`${idx + 1}`, 55.5, y + 4.5);

      // Category bar
      doc.roundedRect(85, y, doc.page.width - 135, 45, 8) // Reduced from 48
         .fill(COLORS.grayLight);

      // Progress bar
      const barWidth = (percentage / 100) * (doc.page.width - 235);
      doc.roundedRect(90, y + 4, barWidth, 14, 4) // Adjusted
         .fill(color);

      // Category name
      doc.fontSize(10) // Reduced from 11
         .fillColor(COLORS.grayDark)
         .font("Helvetica-Bold")
         .text(kategori, 95, y + 22); // Adjusted

      // Amount
      doc.fontSize(11) // Reduced from 12
         .fillColor(color)
         .font("Helvetica-Bold")
         .text(formatCurrency(data.keluar), doc.page.width - 180, y + 6, {
           width: 130,
           align: "right",
         });

      // Percentage
      doc.fontSize(8)
         .fillColor(COLORS.gray)
         .text(`${percentage.toFixed(1)}% • ${data.transaksi}x`, doc.page.width - 180, y + 24, {
           width: 130,
           align: "right",
         });

      doc.y = y + 50; // Reduced from 55
    });

    drawPageFooter();

    /* =========================
       MONTHLY TREND
    ========================= */

    doc.addPage();
    drawPageHeader("Tren Bulanan");

    doc.fontSize(16)
       .fillColor(COLORS.primary)
       .font("Helvetica-Bold")
       .text("📈 Analisis Per Bulan");
    
    doc.y += 20; // Explicit spacing

    const months = Object.entries(analysis.monthlyData).sort((a, b) => a[0].localeCompare(b[0]));

    months.forEach(([monthKey, data]) => {
      addPageIfNeeded(78, "Tren Bulanan"); // Reduced from 85

      const [year, month] = monthKey.split("-");
      const monthName = new Date(year, month - 1).toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
      });

      const netFlow = data.masuk - data.keluar;
      const y = doc.y;

      // Month card
      doc.roundedRect(50, y, doc.page.width - 100, 70, 10) // Reduced from 75
         .fill(COLORS.white);
      
      doc.rect(50, y, doc.page.width - 100, 8) // Reduced from 10
         .fill(netFlow >= 0 ? COLORS.success : COLORS.danger);

      // Month name
      doc.fontSize(11) // Reduced from 12
         .fillColor(COLORS.primary)
         .font("Helvetica-Bold")
         .text(monthName, 65, y + 15); // Adjusted

      // Income bar
      const maxAmount = Math.max(data.masuk, data.keluar);
      const incomeWidth = maxAmount > 0 ? (data.masuk / maxAmount) * 200 : 0;
      const expenseWidth = maxAmount > 0 ? (data.keluar / maxAmount) * 200 : 0;

      doc.fontSize(8) // Reduced from 9
         .fillColor(COLORS.gray)
         .font("Helvetica")
         .text("Masuk:", 65, y + 33); // Adjusted
      
      doc.roundedRect(115, y + 31, incomeWidth, 7, 3) // Reduced height from 8
         .fill(COLORS.success);
      
      doc.text(formatCurrency(data.masuk), 330, y + 31, { width: 150, align: "right" });

      doc.text("Keluar:", 65, y + 47); // Adjusted
      
      doc.roundedRect(115, y + 45, expenseWidth, 7, 3) // Reduced height from 8
         .fill(COLORS.danger);
      
      doc.text(formatCurrency(data.keluar), 330, y + 45, { width: 150, align: "right" });

      doc.y = y + 76; // Reduced from 82
    });

    drawPageFooter();

    /* =========================
       TRANSACTION DETAILS
    ========================= */

    doc.addPage();
    drawPageHeader("Detail Transaksi");

    doc.fontSize(16)
       .fillColor(COLORS.primary)
       .font("Helvetica-Bold")
       .text("📝 Semua Transaksi");
    
    doc.y += 15; // Explicit spacing

    analysis.ordered.forEach((r, idx) => {
      const [jenis, kategori, subKategori, deskripsi, jumlah, , akun, metode, , , tag, catatan, dibuatPada] = r;

      addPageIfNeeded(65, "Detail Transaksi"); // Reduced from 70

      const isIncome = jenis === "Pemasukan" || jenis === "Initial";
      const y = doc.y;
      const cardColor = isIncome ? COLORS.successLight : COLORS.dangerLight;
      const badgeColor = isIncome ? COLORS.success : COLORS.danger;

      // Transaction card with colored background
      doc.roundedRect(50, y, doc.page.width - 100, 58, 8) // Reduced from 62
         .fill(cardColor);

      // Type badge
      doc.roundedRect(60, y + 8, 50, 16, 4) // Reduced sizes
         .fill(badgeColor);
      
      doc.fontSize(7) // Reduced from 8
         .fillColor(COLORS.white)
         .font("Helvetica-Bold")
         .text(isIncome ? "MASUK" : "KELUAR", 64, y + 12);

      // Description
      doc.fontSize(10) // Reduced from 11
         .fillColor(COLORS.grayDark)
         .font("Helvetica-Bold")
         .text(deskripsi, 125, y + 10, { width: 220 });

      // Amount
      doc.fontSize(13) // Reduced from 14
         .fillColor(badgeColor)
         .font("Helvetica-Bold")
         .text(formatCurrency(jumlah), 355, y + 8, {
           width: 165,
           align: "right",
         });

      // Details line
      doc.fontSize(7.5) // Reduced from 8
         .fillColor(COLORS.gray)
         .font("Helvetica")
         .text(`${kategori} • ${akun} • ${metode}`, 60, y + 32, { width: 380 });

      // Date and tag
      doc.text(formatDateShort(dibuatPada), 60, y + 44);
      
      if (tag) {
        doc.text(`🏷️ ${tag}`, 170, y + 44);
      }

      doc.y = y + 63; // Reduced from 68
    });

    drawPageFooter();

    /* =========================
       FINALIZE
    ========================= */

    doc.end();
  });
}

/* =========================
   COMMAND HANDLER
========================= */

export default {
  name: "transactions_pdf",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) {
      return ctx.reply("⛔ Unauthorized access.");
    }

    await ctx.reply("🎨 Generating creative financial report...");

    try {
      const rows = await fetchTransactions();

      if (!rows.length) {
        return ctx.reply("📭 Belum ada transaksi untuk dianalisis.");
      }

      const args = ctx.message.text.split(" ");
      const sortType = args[1]?.toLowerCase() === "asc" ? "asc" : "desc";

      const pdfBuffer = await generatePDF(rows, sortType);

      await ctx.replyWithDocument(
        new InputFile(pdfBuffer, `financial-report-${Date.now()}.pdf`),
        {
          caption: `✅ Laporan Keuangan Kreatif & Profesional\n\n📊 ${rows.length} Transaksi\n🎨 Design Premium\n📅 ${new Date().toLocaleString("id-ID")}`,
        }
      );
    } catch (error) {
      console.error("PDF Generation Error:", error);
      await ctx.reply("❌ Error generating report. Please try again.");
    }
  },
};