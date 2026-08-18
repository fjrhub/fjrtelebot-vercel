export default {
  name: "auto",
  async execute(ctx) {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId) return;

    const input = ctx.message?.text?.trim() || ctx.message?.caption?.trim();
    if (!input) return;

    // 1. Parsing URL & Slide
    let mediaUrl = input;
    let excludedSlides = [];
    const match = input.match(/^(.+?)\s*-\s*(\d+)$/);
    if (match) {
      mediaUrl = match[1].trim();
      excludedSlides = match[2].split("").map(Number).filter((n) => !isNaN(n));
    }

    // 2. Cek Regex
    const tiktokRegex = /^(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+$/i;
    const instagramRegex = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+\/?(?:\?[^ ]*)?$/i;
    const facebookRegex = /^(?:https?:\/\/)?(?:www\.|web\.)?facebook\.com\/(?:share\/(?:r|v|p)\/|reel\/|watch\?v=|permalink\.php\?story_fbid=|[^\/]+\/posts\/|video\.php\?v=)[^\s]+$/i;

    const isTikTok = tiktokRegex.test(mediaUrl);
    const isInstagram = instagramRegex.test(mediaUrl);
    const isFacebook = facebookRegex.test(mediaUrl);

    if (!isTikTok && !isInstagram && !isFacebook) return;

    console.log(`[Vercel] 🚨 URL Terdeteksi! Platform: ${isTikTok ? 'TikTok' : isInstagram ? 'Instagram' : 'Facebook'}`);
    console.log(`[Vercel] Menghapus pesan ID: ${ctx.message.message_id}`);
    
    // Hapus Pesan
    ctx.api.deleteMessage(chatId, ctx.message.message_id).catch((err) => console.log("[Vercel] Gagal hapus pesan:", err.message));

    // 3. Siapkan Payload
    const platform = isTikTok ? "TikTok" : isInstagram ? "Instagram" : "Facebook";
    const mention = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    const payload = { chatId, userId, url: mediaUrl, excludedSlides, platform, mention };
    console.log(`[Vercel] Mengirim payload ke Deno:`, payload);
    console.log(`[Vercel] Target URL: ${process.env.DENO_ENDPOINT_URL}`);

    // 4. Fetch ke Deno (Dengan Logging Response)
    fetch(process.env.DENO_ENDPOINT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vercel-secret": process.env.API_SECRET,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const text = await res.text();
        console.log(`[Vercel] ✅ Deno merespon! Status: ${res.status} | Body: ${text}`);
      })
      .catch((err) => {
        console.error(`[Vercel] ❌ Gagal fetch ke Deno:`, err.message);
      });
  },
};