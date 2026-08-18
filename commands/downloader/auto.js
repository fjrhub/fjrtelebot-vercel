export default {
  name: "auto",
  async execute(ctx) {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId) return;

    const input = ctx.message?.text?.trim() || ctx.message?.caption?.trim();
    if (!input) return;

    // 1. Parsing URL & Slide Exclusion
    let mediaUrl = input;
    let excludedSlides = [];
    const match = input.match(/^(.+?)\s*-\s*(\d+)$/);
    if (match) {
      mediaUrl = match[1].trim();
      excludedSlides = match[2].split("").map(Number).filter((n) => !isNaN(n));
    }

    // 2. Cek Regex Sosmed
    const tiktokRegex = /^(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+$/i;
    const instagramRegex = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+\/?(?:\?[^ ]*)?$/i;
    const facebookRegex = /^(?:https?:\/\/)?(?:www\.|web\.)?facebook\.com\/(?:share\/(?:r|v|p)\/|reel\/|watch\?v=|permalink\.php\?story_fbid=|[^\/]+\/posts\/|video\.php\?v=)[^\s]+$/i;

    const isTikTok = tiktokRegex.test(mediaUrl);
    const isInstagram = instagramRegex.test(mediaUrl);
    const isFacebook = facebookRegex.test(mediaUrl);

    if (!isTikTok && !isInstagram && !isFacebook) return;

    // 3. Hapus Pesan User (Fire & Forget)
    ctx.api.deleteMessage(chatId, ctx.message.message_id).catch(() => {});

    // 4. Siapkan Payload
    const platform = isTikTok ? "TikTok" : isInstagram ? "Instagram" : "Facebook";
    const mention = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    const payload = { chatId, userId, url: mediaUrl, excludedSlides, platform, mention };

    // 5. Fetch ke Deno (WAJIB PAKAI AWAIT biar gak terputus!)
    if (process.env.DENO_ENDPOINT_URL && process.env.API_SECRET) {
      await fetch(process.env.DENO_ENDPOINT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vercel-secret": process.env.API_SECRET,
        },
        body: JSON.stringify(payload),
      }).catch(() => {}); // Abaikan error kalau Deno mati
    }
  },
};