import { google } from "googleapis";
import fs from "fs";
import path from "path";
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
   FORMAT ANGKA
========================= */
function formatNumber(n) {
  return new Intl.NumberFormat("id-ID").format(Number(n) || 0);
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
      const targetAkun = args[1]?.toLowerCase();

      if (!targetAkun) {
        return ctx.reply("Gunakan: /check <namaAkun>");
      }

      const rows = await fetchTransactions();
      if (!rows.length) return ctx.reply("Tidak ada transaksi.");

      // Filter sesuai akun (index 6 = Akun)
      const filtered = rows.filter(
        (row) => row[6]?.toLowerCase() === targetAkun
      );

      if (!filtered.length) {
        return ctx.reply(`Akun "${targetAkun}" tidak ditemukan.`);
      }

      // Urutkan berdasarkan tanggal (index 12 = Dibuat pada)
      const transactions = filtered.sort(
        (a, b) => new Date(a[12]) - new Date(b[12])
      );

      let content = `VALIDASI AKUN: ${targetAkun.toUpperCase()}\n`;
      content += "=====================================\n\n";

      let hasError = false; // <-- tracking error

      transactions.forEach((t, index) => {
        const jenis = t[0];
        const jumlah = Number(t[4]) || 0;
        const mataUang = t[5] || "";
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
        content += `${formatNumber(saldoSebelum)} ${operator} ${formatNumber(jumlah)} = ${formatNumber(hasil)} ${mataUang}\n`;
        content += `Saldo Sheet: ${formatNumber(saldoSesudah)} -> ${status}\n\n`;
      });

      content += "=====================================\n\n";

      // ✅ SUMMARY STATUS
      if (hasError) {
        content += "❌ HASIL AKHIR: Data salah atau terdapat kesalahan.\n";
      } else {
        content += "✅ HASIL AKHIR: Semua data benar, tidak ada kesalahan.\n";
      }

      // Simpan file sementara
      const fileName = `check_${targetAkun}.txt`;
      const filePath = path.join(process.cwd(), fileName);

      fs.writeFileSync(filePath, content);

      // Kirim file
      await ctx.replyWithDocument(
        new InputFile(filePath, fileName)
      );

      // Hapus file setelah dikirim
      fs.unlinkSync(filePath);

    } catch (err) {
      console.error("Error di command check:", err);
      return ctx.reply("Terjadi error saat validasi.");
    }
  },
};
