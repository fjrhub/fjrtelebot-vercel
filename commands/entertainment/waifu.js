import axios from "axios";
import { createUrl } from "../../utils/api.js";

export default {
  name: "waifu",
  description: "Fetch random waifu image with API fallback",
  async execute(ctx) {
    const chatId = ctx.chat.id;
    let progressMsg = null;

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    const updateProgress = async (text) => {
      if (!progressMsg) {
        progressMsg = await ctx.reply(text);
      } else {
        await ctx.api.editMessageText(
          chatId,
          progressMsg.message_id,
          text
        );
      }
    };

    const clearProgress = async () => {
      if (!progressMsg) return;
      await delay(1000);
      await ctx.api.deleteMessage(chatId, progressMsg.message_id);
      progressMsg = null;
    };

    const sendImage = async (imageUrl) => {
      await ctx.replyWithPhoto(imageUrl);
      await clearProgress();
    };

    const fetchFromApi1 = async () => {
      await updateProgress("📡 Fetching from API #1...");
      const res = await axios.get(
        createUrl("waifupics", "/sfw/waifu"),
        { timeout: 8000 }
      );

      const url = res?.data?.url;
      if (!url) throw new Error("Invalid response from API 1");
      return url;
    };

    const fetchFromApi2 = async () => {
      await updateProgress("📡 Fetching from API #2...");
      const res = await axios.get(
        createUrl("waifuim", "/search?included_tags=waifu"),
        { timeout: 8000 }
      );

      const url = res?.data?.images?.[0]?.url;
      if (!url) throw new Error("Invalid response from API 2");
      return url;
    };

    try {
      const image = await fetchFromApi1();
      await sendImage(image);
    } catch {
      try {
        const image = await fetchFromApi2();
        await sendImage(image);
      } catch {
        await updateProgress("❌ Unable to fetch waifu image.");
      }
    }
  },
};
