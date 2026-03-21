import axios from "axios";
import { createUrl } from "../../utils/api.js";

export default {
  name: "waifupics",
  description: "Get a random waifu image from waifu.pics",
  async execute(ctx) {
    try {
      const res = await axios.get(createUrl("waifupics", "/sfw/waifu"), {
        timeout: 8000,
      });
      const imageUrl = res.data?.url;
      if (!imageUrl) throw new Error("Invalid response from waifu.pics");
      await ctx.replyWithPhoto(imageUrl);
    } catch (err) {
      console.error("waifupics error:", err.message);
      await ctx.reply("❌ Failed to fetch image from waifu.pics.");
    }
  },
};