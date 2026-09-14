import axios from "axios";
import { createUrl } from "../../utils/api.js";

const WAIFUPICS_TIMEOUT = 8000;
const WAIFUPICS_ENDPOINT = "/sfw/waifu";

export default {
  name: "waifupics",
  description: "Get a random waifu image from waifu.pics",
  async execute(ctx) {
    try {
      const url = createUrl("waifupics", WAIFUPICS_ENDPOINT);
      const { data } = await axios.get(url, {
        timeout: WAIFUPICS_TIMEOUT,
        validateStatus: (status) => status === 200,
      });

      if (!data?.url || typeof data.url !== "string") {
        throw new Error("Invalid response format");
      }

      await ctx.replyWithPhoto(data.url);
    } catch (error) {
      const errorMessage = error.response 
        ? `API Error: ${error.response.status}` 
        : error.message;
      
      console.error("[waifupics] Error:", errorMessage);
      await ctx.reply("❌ Gagal mengambil gambar. Coba lagi nanti.");
    }
  },
};
