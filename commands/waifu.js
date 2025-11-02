const axios = require("axios");

module.exports = {
  name: "waifu",
  description: "Get a random waifu image from the API WaifuPics",
  async execute(ctx) {
    try {
      const response = await axios.get("https://api.waifu.pics/sfw/waifu", {
        timeout: 8000,
      });
      const imageUrl = response.data?.url;

      if (!imageUrl) {
        return ctx.reply("❌ Failed to retrieve a valid image from WaifuPics.");
      }

      await ctx.replyWithPhoto(imageUrl);
    } catch {
      await ctx.reply("❌ Failed to retrieve data from WaifuPics.");
    }
  },
};
