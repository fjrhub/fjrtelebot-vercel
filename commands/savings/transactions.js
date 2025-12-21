import { google } from "googleapis";

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

/* =========================
   UTIL
========================= */
const formatNumber = (n) =>
  new Intl.NumberFormat("id-ID").format(Number(n) || 0);

const formatDate = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/* =========================
   FETCH TRANSACTIONS
========================= */
async function fetchTransactions() {
  const sheets = sheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Sheet1!A2:N",
  });

  return res.data.values || [];
}

/* =========================
   COMMAND
========================= */
export default {
  name: "transactions",

  async execute(ctx) {
    const rows = await fetchTransactions();

    if (!rows.length) {
      return ctx.reply("📭 Belum ada transaksi.");
    }

    const LIMIT = 5;
    const latest = rows.slice(-LIMIT).reverse();

    let text = `📒 *${LIMIT} Transaksi Terakhir*\n\n`;

    for (const r of latest) {
      const [
        jenis,
        kategori,
        subKategori,
        deskripsi,
        jumlah,
        mataUang,
        akun,
        metode,
        saldoSebelum,
        saldoSesudah,
        tag,
        catatan,
        dibuatPada,
      ] = r;

      const isIncome = jenis === "Pemasukan";
      const headerIcon = isIncome ? "🔺" : "🔻";

      text +=
        `${headerIcon}${jenis} | ${akun} | ${metode}\n` +
        `${kategori} › ${subKategori}\n` +
        `${deskripsi} | ${catatan || "-"}\n` +
        `${formatNumber(jumlah)} ${mataUang} | ${formatNumber(
          saldoSebelum
        )} → ${formatNumber(saldoSesudah)}\n` +
        `🏷 ${tag || "-"}\n` +
        `🕒 ${formatDate(dibuatPada)}\n\n`;
    }
    return ctx.reply(text, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
  },
};
