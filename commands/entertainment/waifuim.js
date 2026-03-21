import axios from "axios";
import { createUrl } from "../../utils/api.js";

export default {
  name: "waifuim",
  description: "Get a random waifu image from waifu.im",
  async execute(ctx) {
    try {
      const res = await axios.get(
        createUrl("waifuim", "/images?IncludedTags=waifu"),
        { timeout: 8000 }
      );

      const imageUrl = res.data?.items?.[0]?.url;
      if (!imageUrl) throw new Error("Invalid response from waifu.im");

      await ctx.replyWithPhoto(imageUrl);
    } catch (err) {
      console.error("waifuim error:", err.message);
      await ctx.reply("❌ Failed to fetch image from waifu.im.");
    }
  },
};