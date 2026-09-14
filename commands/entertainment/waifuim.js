import axios from "axios";
import { createUrl } from "../../utils/api.js";

const API_TIMEOUT = 10000;
const MAX_RETRIES = 2;
const ERROR_MESSAGES = {
  TIMEOUT: "⏱️ Request timeout. Silakan coba lagi.",
  NETWORK: "🌐 Network error. Periksa koneksi internet.",
  API_ERROR: "❌ Gagal mengambil gambar dari waifu.im.",
  INVALID_RESPONSE: "📭 Response tidak valid dari server.",
};

export default {
  name: "waifuim",
  description: "Get a random waifu image from waifu.im",
  aliases: ["waifu"],
  
  async execute(ctx) {
    const statusMsg = await ctx.reply("🔄 Fetching waifu image...");
    
    try {
      const imageUrl = await this.fetchImageWithRetry();
      
      await Promise.all([
        ctx.replyWithPhoto(imageUrl),
        statusMsg.delete().catch(() => {}),
      ]);
      
      console.log(`[waifuim] Success - Image sent to ${ctx.from.id}`);
    } catch (err) {
      await this.handleError(ctx, statusMsg, err);
    }
  },

  async fetchImageWithRetry(retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await axios.get(
          createUrl("waifuim", "/images?included_tags=waifu"),
          { 
            timeout: API_TIMEOUT,
            validateStatus: (status) => status === 200,
          }
        );

        const imageUrl = res.data?.images?.[0]?.url;
        if (!imageUrl) {
          throw new Error("INVALID_RESPONSE");
        }

        return imageUrl;
      } catch (err) {
        if (attempt === retries) throw err;
        console.warn(`[waifuim] Attempt ${attempt} failed:`, err.message);
        await this.delay(1000 * attempt);
      }
    }
  },

  async handleError(ctx, statusMsg, err) {
    let errorMessage = ERROR_MESSAGES.API_ERROR;

    if (err.code === "ECONNABORTED") {
      errorMessage = ERROR_MESSAGES.TIMEOUT;
    } else if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
      errorMessage = ERROR_MESSAGES.NETWORK;
    } else if (err.message === "INVALID_RESPONSE") {
      errorMessage = ERROR_MESSAGES.INVALID_RESPONSE;
    }

    console.error("[waifuim] Error:", {
      message: err.message,
      code: err.code,
      status: err.response?.status,
    });

    await statusMsg.editText(errorMessage).catch(() => {
      ctx.reply(errorMessage);
    });
  },

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};
