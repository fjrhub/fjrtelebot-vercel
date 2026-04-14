import { google } from "googleapis";
import { InputFile } from "grammy";

/* =========================
   DAFTAR AKUN (EDIT DI SINI SAJA)
========================= */
const ALL_WALLETS = ["wallet", "dana", "seabank", "fjlsaldo", "gopay"];
// Tambah akun cukup:
// const ALL_WALLETS = ["wallet", "dana", "seabank", "gopay"];

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
function formatNumber(n) {
  return new Intl.NumberFormat("id-ID").format(Number(n) || 0);
}

function formatCurrency(amount, currency = "Rp") {
  return currency + formatNumber(amount);
}

function validateAccount(rows, accountName) {
  const filtered = rows.filter((row) => row[6]?.toLowerCase() === accountName);

  if (!filtered.length) {
    return {
      hasError: true,
      content: `AKUN ${accountName.toUpperCase()} tidak ditemukan.\n\n`,
    };
  }

  const transactions = filtered.sort(
    (a, b) => new Date(a[12]) - new Date(b[12]),
  );

  let content = `AKUN: ${accountName.toUpperCase()}\n`;
  content += "-------------------------------------\n";

  let hasError = false;
  let runningBalance = null; // Menyimpan saldo hasil kalkulasi sistem (bukan dari sheet)

  transactions.forEach((t, index) => {
    const jenis = t[0];
    const jumlah = Number(t[4]) || 0;
    const mataUang = t[5] || "Rp";
    const saldoSebelumSheet = Number(t[8]) || 0; // Hanya untuk referensi display/transaksi pertama
    const saldoSesudahSheet = Number(t[9]) || 0; // Target validasi

    let expectedBalance;
    let operator;
    let displayStartBalance;

    // --- LOGIKA UTAMA LOOPING ---
    if (index === 0) {
      // Transaksi Pertama: Inisialisasi saldo awal
      if (jenis === "Initial") {
        runningBalance = jumlah;
        expectedBalance = jumlah;
        operator = "=";
        displayStartBalance = 0;
      } else {
        // Jika bukan Initial, kita terpaksa mengambil saldo awal dari sheet sebagai patokan start
        runningBalance = saldoSebelumSheet;
        displayStartBalance = saldoSebelumSheet;

        if (jenis === "Pemasukan") {
          expectedBalance = runningBalance + jumlah;
          operator = "+";
        } else if (jenis === "Pengeluaran") {
          expectedBalance = runningBalance - jumlah;
          operator = "-";
        } else {
          expectedBalance = runningBalance;
          operator = "?";
        }
      }
    } else {
      // Transaksi ke-2 dan seterusnya:
      // PENTING: Gunakan 'runningBalance' (hasil hitungan sistem sebelumnya),
      // JANGAN gunakan 'saldoSebelumSheet' agar validasi akurat.

      displayStartBalance = runningBalance;

      if (jenis === "Pemasukan") {
        expectedBalance = runningBalance + jumlah;
        operator = "+";
      } else if (jenis === "Pengeluaran") {
        expectedBalance = runningBalance - jumlah;
        operator = "-";
      } else if (jenis === "Initial") {
        // Handle jika ada Initial di tengah-tengah (opsional, bisa dianggap reset)
        expectedBalance = jumlah;
        operator = "=";
      } else {
        expectedBalance = runningBalance;
        operator = "?";
      }
    }

    // Validasi: Bandingkan hasil kalkulasi sistem dengan Saldo Sesudah di Sheet
    const isValid = expectedBalance === saldoSesudahSheet;
    if (!isValid) hasError = true;

    const status = isValid ? "BENAR ✅" : "SALAH ❌";

    // --- FORMAT OUTPUT ---
    content += `Transaksi ${index + 1}\n`;

    if (index === 0 && jenis === "Initial") {
      content += `Initial: ${formatCurrency(jumlah, mataUang)}\n`;
    } else {
      content += `${formatCurrency(displayStartBalance, mataUang)} ${operator} ${formatCurrency(jumlah, mataUang)} = ${formatCurrency(expectedBalance, mataUang)}\n`;
    }

    content += `Saldo Sheet: ${formatCurrency(saldoSesudahSheet, mataUang)} -> ${status}\n\n`;

    // Update runningBalance untuk iterasi berikutnya
    runningBalance = expectedBalance;
  });

  content += hasError
    ? "HASIL: ❌ ADA KESALAHAN\n\n"
    : "HASIL: ✅ SEMUA BENAR\n\n";

  return { hasError, content };
}

/* =========================
   COMMAND
========================= */
export default {
  name: "check",

  async execute(ctx) {
    try {
      if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

      const args = ctx.message.text.split(" ");
      const target = args[1]?.toLowerCase();

      const rows = await fetchTransactions();
      if (!rows.length) return ctx.reply("Tidak ada transaksi.");

      let fileContent = "LAPORAN VALIDASI\n";
      fileContent += "=====================================\n\n";

      // =========================
      // MODE 1 AKUN
      // =========================
      if (target) {
        if (!ALL_WALLETS.includes(target)) {
          return ctx.reply("Akun tidak terdaftar di ALL_WALLETS.");
        }

        const result = validateAccount(rows, target);
        fileContent += result.content;

        const fileName = `check_${target}.txt`;

        await ctx.replyWithDocument(
          new InputFile(Buffer.from(fileContent, "utf-8"), fileName),
        );

        await ctx.reply(
          result.hasError
            ? `❌ ${target} ada kesalahan`
            : `✅ ${target} sudah benar`,
        );

        return;
      }

      // =========================
      // MODE SEMUA AKUN
      // =========================
      let summaryMessage = "HASIL VALIDASI SEMUA AKUN:\n\n";
      let globalError = false;

      for (const account of ALL_WALLETS) {
        const result = validateAccount(rows, account);

        if (result.hasError) globalError = true;

        fileContent += result.content;

        summaryMessage += result.hasError
          ? `❌ ${account} salah\n`
          : `✅ ${account} benar\n`;
      }

      fileContent += "=====================================\n";
      fileContent += globalError
        ? "KESIMPULAN AKHIR: ❌ ADA DATA SALAH\n"
        : "KESIMPULAN AKHIR: ✅ SEMUA DATA BENAR\n";

      const fileName = `check_all.txt`;

      await ctx.replyWithDocument(
        new InputFile(Buffer.from(fileContent, "utf-8"), fileName),
      );

      await ctx.reply(summaryMessage);
    } catch (err) {
      console.error("Error di command check:", err);
      ctx.reply("Terjadi error saat validasi.");
    }
  },
};
