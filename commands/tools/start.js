const VIDEO_URL = "ISI_URL_VIDEO_DI_SINI";
// Contoh:
// const VIDEO_URL = "https://example.com/video.mp4";

const CAPTION = "🤖 Bot is now active on Vercel!";

export default {
  name: "start",

  async execute(ctx) {
    try {
      // Kalau framework-nya support kirim video langsung
      if (typeof ctx.replyWithVideo === "function") {
        await ctx.replyWithVideo(VIDEO_URL, {
          caption: CAPTION,
        });
        return;
      }

      // Fallback kalau pakai Telegraf/Telegram API dari ctx.telegram
      if (ctx.telegram?.sendVideo && ctx.chat?.id) {
        await ctx.telegram.sendVideo(ctx.chat.id, VIDEO_URL, {
          caption: CAPTION,
        });
        return;
      }

      // Fallback paling akhir: kirim URL sebagai teks
      await ctx.reply(`${CAPTION}\n${VIDEO_URL}`);
    } catch (error) {
      console.error("Gagal kirim video:", error);

      // Kalau gagal kirim video, tetap balas dengan pesan
      await ctx.reply(`${CAPTION}\n${VIDEO_URL}`);
    }
  },
};