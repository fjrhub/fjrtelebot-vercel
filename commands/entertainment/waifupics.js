import axios from "axios";
import { createUrl } from "../../utils/api.js";

export default {
  name: "waifupics",
  description: "Get a random waifu image from waifu.pics",
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
        await new Promise((res) => setTimeout(res, 1000));
        await ctx.api.deleteMessage(chatId, statusMessage.message_id);
        statusMessage = null;
      }
    };

    try {
      await sendOrEditStatus("📡 Fetching image from waifu.pics...");
      const res = await axios.get(createUrl("waifupics", "/sfw/waifu"), {
        timeout: 8000,
      });
      const imageUrl = res.data?.url;
      if (!imageUrl) throw new Error("Invalid response from waifu.pics");
      await ctx.replyWithPhoto(imageUrl);
      await deleteStatus();
    } catch (err) {
      console.error("waifupics error:", err.message);
      await sendOrEditStatus("❌ Failed to fetch image from waifu.pics.");
    }
  },
};