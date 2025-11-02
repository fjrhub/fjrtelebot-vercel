const axios = require("axios");

module.exports = {
  name: "waifu",
  description: "Get a random waifu image from WaifuPics",
  async execute(ctx) {
    console.log("🚀 /waifu command executed");
    await ctx.reply("🔍 Fetching your waifu...");

    try {
      const res = await fetch("https://api.waifu.pics/sfw/waifu");
      console.log("✅ Fetched WaifuPics:", res.status);
      const data = await res.json();
      const imageUrl = data?.url;

      if (!imageUrl) {
        console.log("❌ Invalid image URL");
        return ctx.reply("❌ Failed to retrieve a valid image.");
      }

      await ctx.replyWithPhoto(imageUrl);
    } catch (err) {
      console.error("🔥 Error fetching WaifuPics:", err);
      await ctx.reply("❌ Failed to retrieve data from WaifuPics.");
    }
  },
};
