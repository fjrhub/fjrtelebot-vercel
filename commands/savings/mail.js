import { google } from "googleapis";

/* =========================
   GOOGLE GMAIL CLIENT
========================= */
function gmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return google.gmail({ version: "v1", auth });
}

/* =========================
   UTIL
========================= */
const formatRp = (n) => "Rp" + Math.round(n).toLocaleString("id-ID");

function getJakartaTime() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );

  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${hh}.${min} WIB`;
}

/* =========================
   DATA
========================= */
async function getLatestEmails(maxResults = 5) {
  const gmail = gmailClient();

  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    q: "is:unread", // hanya email belum dibaca, bisa diganti atau dihapus jika ingin semua
  });

  const messages = res.data.messages || [];

  return Promise.all(
    messages.map(async (msg) => {
      const fullMsg = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
      });

      const headers = fullMsg.data.payload.headers;
      const subject =
        headers.find((h) => h.name === "Subject")?.value || "No Subject";
      const from =
        headers.find((h) => h.name === "From")?.value || "Unknown Sender";

      // Ambil body singkat (snippet)
      const snippet = fullMsg.data.snippet;

      return { id: msg.id, subject, from, snippet };
    }),
  );
}

/* =========================
   COMMAND
========================= */
export default {
  name: "mail",

  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;

    let emails;
    try {
      emails = await getLatestEmails(5);
    } catch (error) {
      console.error("Gmail API Error:", error);
      return ctx.reply("❌ Gagal mengambil email. Cek konfigurasi akun.");
    }

    if (!emails.length) {
      return ctx.reply("📭 Tidak ada email baru.");
    }

    const emailMessages = emails.map(({ subject, from, snippet }) => {
      return `📬 From: ${from}\n📌 Subject: ${subject}\n💬 ${snippet}`;
    });

    const message = `
📧 Inbox Update (Latest 5 Unread)

${emailMessages.join("\n\n")}

━━━━━━━━━━━━
📥 Total: ${emails.length} unread
📅 Checked: ${getJakartaTime()}
`.trim();

    await ctx.reply(message);
  },
};
