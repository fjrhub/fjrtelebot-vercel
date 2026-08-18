export default {
  name: "auto",
  async execute(ctx) {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId) return;

    // Ambil teks atau caption
    const input = ctx.message?.text?.trim() || ctx.message?.caption?.trim();
    if (!input) return;

    // === 1. PARSING INPUT (URL + SLIDE EXCLUSION) ===
    let mediaUrl = input;
    let excludedSlides = [];
    const match = input.match(/^(.+?)\s*-\s*(\d+)$/);
    if (match) {
      mediaUrl = match[1].trim();
      excludedSlides = match[2]
        .split("")
        .map(Number)
        .filter((n) => !isNaN(n));
    }

    // === 2. CEK REGEX (Hanya URL Sosmed yang diproses) ===
    const tiktokRegex = /^(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+$/i;
    const instagramRegex = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+\/?(?:\?[^ ]*)?$/i;
    const facebookRegex = /^(?:https?:\/\/)?(?:www\.|web\.)?facebook\.com\/(?:share\/(?:r|v|p)\/|reel\/|watch\?v=|permalink\.php\?story_fbid=|[^\/]+\/posts\/|video\.php\?v=)[^\s]+$/i;

    const isTikTok = tiktokRegex.test(mediaUrl);
    const isInstagram = instagramRegex.test(mediaUrl);
    const isFacebook = facebookRegex.test(mediaUrl);

    // Kalau BUKAN URL sosmed yang didukung, keluar (biar command bot lain jalan normal)
    if (!isTikTok && !isInstagram && !isFacebook) return;

    // === 3. HAPUS PESAN USER (Fire & Forget) ===
    // Kita hapus pesan link-nya biar chat bersih, gak usah ditunggu (await)
    ctx.api.deleteMessage(chatId, ctx.message.message_id).catch(() => {});

    // === 4. SIAPKAN DATA UNTUK DENO ===
    const platform = isTikTok ? "TikTok" : isInstagram ? "Instagram" : "Facebook";
    const username = ctx.from.username;
    const firstName = ctx.from.first_name;
    const mention = username ? `@${username}` : firstName;

    const payload = {
      chatId,
      userId,
      url: mediaUrl,
      excludedSlides,
      platform,
      mention,
    };

    // === 5. KIRIM KE DENO (FIRE AND FORGET) ===
    const DENO_URL = process.env.DENO_ENDPOINT_URL;
    const SECRET = process.env.API_SECRET;

    if (DENO_URL && SECRET) {
      // JANGAN PAKAI AWAIT! Biarkan Vercel langsung selesai (return), 
      // sementara fetch jalan di background menuju Deno.
      fetch(DENO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vercel-secret": SECRET,
        },
        body: JSON.stringify(payload),
      }).catch((err) => console.error("[Vercel] Gagal fetch Deno:", err));
    } else {
      console.warn("[Vercel] Env DENO_ENDPOINT_URL atau API_SECRET belum diset!");
    }
  },
};
