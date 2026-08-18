// Vercel: api/index.js (Middleware / Satpam)
export default async function handler(req, res) {
  // Tolak selain POST dari Telegram
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const update = req.body;
  const message = update?.message;
  if (!message) return res.status(200).send("OK");

  const chatId = message.chat?.id;
  const userId = message.from?.id;
  const messageId = message.message_id;
  const input = message.text?.trim() || message.caption?.trim();

  if (!chatId || !input) return res.status(200).send("OK");

  // 1. Regex Cek URL
  const tiktokRegex = /^(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+$/i;
  const instagramRegex = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+\/?(?:\?[^ ]*)?$/i;
  const facebookRegex = /^(?:https?:\/\/)?(?:www\.|web\.)?facebook\.com\/(?:share\/(?:r|v|p)\/|reel\/|watch\?v=|permalink\.php\?story_fbid=|[^\/]+\/posts\/|video\.php\?v=)[^\s]+$/i;

  // Parse URL dan slide exclusion (misal: url -12)
  let mediaUrl = input;
  let excludedSlides = [];
  const match = input.match(/^(.+?)\s*-\s*(\d+)$/);
  if (match) {
    mediaUrl = match[1].trim();
    excludedSlides = match[2].split("").map(Number).filter(n => !isNaN(n));
  }

  const isTikTok = tiktokRegex.test(mediaUrl);
  const isInstagram = instagramRegex.test(mediaUrl);
  const isFacebook = facebookRegex.test(mediaUrl);

  // Kalau bukan URL sosmed yang didukung, biarkan lolos (biar command bot lain jalan)
  if (!isTikTok && !isInstagram && !isFacebook) return res.status(200).send("OK");

  // 2. Hapus Pesan User (Pakai fetch native biar gak butuh library Grammy di Vercel)
  if (process.env.BOT_TOKEN && messageId) {
    fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    }).catch(() => {}); // Fire & forget
  }

  // 3. Siapkan Payload untuk Deno
  let platform = isTikTok ? "TikTok" : isInstagram ? "Instagram" : "Facebook";
  const username = message.from?.username;
  const firstName = message.from?.first_name;
  const mention = username ? `@${username}` : firstName;

  const payload = { chatId, userId, url: mediaUrl, excludedSlides, platform, mention };

  // 4. Lempar ke Deno (Fire and Forget - Vercel tidak menunggu Deno selesai)
  fetch(process.env.DENO_ENDPOINT_URL + "/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-secret": process.env.API_SECRET // Bawa KTP rahasia
    },
    body: JSON.stringify(payload)
  }).catch(err => console.error("Gagal fetch ke Deno:", err));

  // 5. Langsung tutup koneksi Vercel (Hemat waktu eksekusi!)
  return res.status(200).send("OK");
}
