import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { InputFile } from "grammy";

/* =========================
   DAFTAR AKUN
========================= */
const ALL_WALLETS = ["wallet", "dana", "seabank"];

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
  const filtered = rows.filter(
    (row) => row[6]?.toLowerCase() === accountName
  );

  if (!filtered.length) {
    return {
      hasError: true,
      content: `AKUN ${accountName.toUpperCase()} tidak ditemukan.\n\n`,
    };
  }

  const transactions = filtered.sort(
    (a, b) => new Date(a[12]) - new Date(b[12])
  );

  let content = `AKUN: ${accountName.toUpperCase()}\n`;
  content += "-------------------------------------\n";

  let hasError = false;

  transactions.forEach((t, index) => {
    const jenis = t[0];
    const jumlah = Number(t[4]) || 0;
    const mataUang = t[5] || "Rp";
    const saldoSebelum = Number(t[8]) || 0;
    const saldoSesudah = Number(t[9]) || 0;

    let hasil;
    let operator;

    if (jenis === "Pemasukan") {
      hasil = saldoSebelum + jumlah;
      operator = "+";
    } else if (jenis === "Pengeluaran") {
      hasil = saldoSebelum - jumlah;
      operator = "-";
    } else if (jenis === "Initial") {
      hasil = jumlah;
      operator = "=";
    } else {
      hasil = 0;
      operator = "?";
    }

    const isValid = hasil === saldoSesudah;
    if (!isValid) hasError = true;

    const status = isValid ? "BENAR ✅" : "SALAH ❌";

    content += `Transaksi ${index + 1}\n`;
    content += `${formatCurrency(saldoSebelum, mataUang)} ${operator} ${formatCurrency(jumlah, mataUang)} = ${formatCurrency(hasil, mataUang)}\n`;
    content += `Saldo Sheet: ${formatCurrency(saldoSesudah, mataUang)} -> ${status}\n\n`;
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

      // MODE 1 AKUN
      if (target) {
        if (!ALL_WALLETS.includes(target)) {
          return ctx.reply("Akun tidak terdaftar.");
        }

        const result = validateAccount(rows, target);
        fileContent += result.content;

        const fileName = `check_${target}.txt`;
        const filePath = path.join(process.cwd(), fileName);

        fs.writeFileSync(filePath, fileContent);

        await ctx.replyWithDocument(new InputFile(filePath, fileName));
        fs.unlinkSync(filePath);

        await ctx.reply(
          result.hasError
            ? `❌ ${target} ada kesalahan`
            : `✅ ${target} sudah benar`
        );

        return;
      }

      // MODE SEMUA AKUN
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
      const filePath = path.join(process.cwd(), fileName);

      fs.writeFileSync(filePath, fileContent);

      await ctx.replyWithDocument(new InputFile(filePath, fileName));
      fs.unlinkSync(filePath);

      await ctx.reply(summaryMessage);

    } catch (err) {
      console.error(err);
      ctx.reply("Terjadi error saat validasi.");
    }
  },
};
