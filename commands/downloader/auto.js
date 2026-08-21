export default {
  name: "auto",
  async execute(ctx) {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !ctx.message) return;

    const input = (ctx.message.text || ctx.message.caption || "").trim();
    if (!input) return;

    // 1. Parsing URL & Slide Exclusion (Mendukung format: "url -1, 2" atau "url -12")
    let mediaUrl = input;
    let excludedSlides = [];
    
    const match = input.match(/^(.+?)\s*-\s*([\d,\s]+)$/);
    if (match) {
      mediaUrl = match[1].trim();
      excludedSlides = match[2]
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0);
    }

    // 2. Cek Regex Sosmed
    const tiktokRegex = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/i;
    const instagramRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+/i;
    const facebookRegex = /(?:https?:\/\/)?(?:www\.|web\.|m\.)?facebook\.com\/[^\s]+/i;

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

    // 5. TRUE FIRE-AND-FORGET ke Deno
    // TANPA await, TANPA timeout. Vercel langsung tembak dan fungsi langsung selesai.
    if (process.env.DENO_ENDPOINT_URL && process.env.API_SECRET) {
      fetch(process.env.DENO_ENDPOINT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vercel-secret": process.env.API_SECRET,
        },
        body: JSON.stringify(payload),
      }).catch((err) => {
        // Hanya catat di log Vercel jika gagal, tidak mengganggu user atau flow
        console.error("[Vercel] Gagal menembak payload ke Deno:", err.message);
      });
    }
    
    // Fungsi execute berakhir di sini. 
    // Grammy/Vercel akan otomatis merespons OK ke Telegram tanpa menunggu Deno.
  },
};
