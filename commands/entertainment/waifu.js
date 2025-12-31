import axios from "axios";
import { createUrl } from "../../utils/api.js";

export default {
  name: "waifu",
  description: "Get a random waifu image from two fallback APIs",
  async execute(ctx) {
    const chatId = ctx.chat.id;
    let statusMessage = null;

    const sendOrEditStatus = async (text) => {
      if (!statusMessage) {
        statusMessage = await ctx.reply(text);
      } else {
        await ctx.api.editMessageText(chatId, statusMessage.message_id, text);
      }
    };

    const deleteStatus = async () => {
      if (statusMessage) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await ctx.api.deleteMessage(chatId, statusMessage.message_id);
        statusMessage = null;
      }
    };

    const sendPhoto = async (url) => {
      await ctx.replyWithPhoto(url);
      await deleteDateStatus();
    };

    const fetchFromWaifuPics = async () => {
      const res = await axios.get(createUrl("waifupics", "/sfw/waifu"), {
        timeout: 8000,
      });
      const url = res.data?.url;
      if (!url) throw new Error("Invalid response from waifupics API");
      return url;
    };

    const fetchFromWaifuIm = async () => {
      const res = await axios.get(
        createUrl("waifuim", "/search?included_tags=waifu"),
        { timeout: 8000 }
      );
      const url = res.data?.images?.[0]?.url;
      if (!url) throw new Error("Invalid response from waifu.im API");
      return url;
    };

    try {
      await sendOrEditStatus("📡 Trying API 1...");
      const imageUrl = await fetchFromWaifuPics();
      await sendPhoto(imageUrl);
    } catch (error1) {
      try {
        await sendOrEditStatus("📡 Trying API 2...");
        const imageUrl = await fetchFromWaifuIm();
        await sendPhoto(imageUrl);
      } catch (error2) {
        await sendOrEditStatus("❌ Failed to fetch images from both APIs.");
      }
    }
  },
};