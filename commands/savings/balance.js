import { google } from "googleapis";

function sheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: "service_account",
      project_id: process.env.GOOGLE_PROJECT_ID,
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"), // Pastikan format kunci benar
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"], // Hapus spasi di akhir
  });

  return google.sheets({ version: "v4", auth });
}

async function getAllSaldo() {
  const sheets = sheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!S2:T", // Ambil kolom S (Akun) dan T (Saldo)
  });

  return res.data.values || [];
}

export default {
  name: "balance",
  async execute(ctx) {
    const rows = await getAllSaldo();

    if (!rows.length) {
      return ctx.reply("Tidak ada data saldo.");
    }

    let total = 0;
    let walletCounter = 1;
    const walletMessages = rows.map(([akun, rawSaldo]) => {
      const saldoNum = Number(rawSaldo);
      if (isNaN(saldoNum)) {
        console.warn(`Baris dengan akun '${akun}' memiliki saldo tidak valid: ${rawSaldo}`);
        return null; // Lewati baris yang tidak valid
      }
      total += saldoNum;

      // Format nama wallet dan saldo
      const walletLabel = `🧾 Wallet ${walletCounter++}: ${akun}`;
      const balanceFormatted = `💰 Balance: Rp${Math.round(saldoNum).toLocaleString('id-ID', { minimumFractionDigits: 0 })}`;
      return `${walletLabel}\n${balanceFormatted}`;
    }).filter(Boolean); // Buang entri yang null jika ada kesalahan

    const totalFormatted = `🔢 Total Balance: Rp${Math.round(total).toLocaleString('id-ID', { minimumFractionDigits: 0 })}`;

    // Ambil tanggal saat ini
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Bulan dimulai dari 0
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const lastUpdated = `📅 Last updated: ${day}/${month}/${year} ${hours}.${minutes}`;

    const fullMessage = `📊 Wallet Balances\n\n${walletMessages.join('\n\n')}\n\n${totalFormatted}\n${lastUpdated}`;

    await ctx.reply(fullMessage);
  },
};