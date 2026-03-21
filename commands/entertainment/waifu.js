import axios from "axios";
import { createUrl } from "../../utils/api.js";

export default {
  name: "waifu",
  description: "Get a random waifu image from two fallback APIs",
  async execute(ctx) {
    try {
      const res1 = await axios.get(createUrl("waifupics", "/sfw/waifu"), {
        timeout: 8000,
      });
      const imageUrl1 = res1.data?.url;
      if (!imageUrl1) throw new Error("API 1 returned an invalid response.");
      await ctx.replyWithPhoto(imageUrl1);
    } catch {
      try {
        const res2 = await axios.get(
          createUrl("waifuim", "/images?included_tags=waifu"),
          { timeout: 8000 }
        );
        const imageUrl2 = res2.data?.items?.[0]?.url;
        if (!imageUrl2) throw new Error("API 2 returned an invalid response.");
        await ctx.replyWithPhoto(imageUrl2);
      } catch {
        await ctx.reply("❌ Failed to fetch images from both APIs.");
      }
    }
  },
};