import axios from "axios";
import { createUrl } from "../../utils/api.js";

const API_CONFIGS = [
  {
    name: "waifupics",
    endpoint: "/sfw/waifu",
    extractUrl: (data) => data?.url,
  },
  {
    name: "waifuim",
    endpoint: "/images?included_tags=waifu",
    extractUrl: (data) => data?.items?.[0]?.url,
  },
];

const TIMEOUT_MS = 8000;

async function fetchImageFromApi(config) {
  const response = await axios.get(createUrl(config.name, config.endpoint), {
    timeout: TIMEOUT_MS,
  });

  const imageUrl = config.extractUrl(response.data);

  if (!imageUrl) {
    throw new Error(`${config.name} returned an invalid response`);
  }

  return imageUrl;
}

async function fetchImageWithFallback() {
  const errors = [];

  for (const config of API_CONFIGS) {
    try {
      return await fetchImageFromApi(config);
    } catch (error) {
      errors.push({ api: config.name, error: error.message });
      console.warn(`[${config.name}] Failed:`, error.message);
    }
  }

  throw new Error(
    `All APIs failed: ${errors.map((e) => `${e.api} (${e.error})`).join(", ")}`
  );
}

export default {
  name: "waifu",
  description: "Get a random waifu image with multiple API fallbacks",

  async execute(ctx) {
    try {
      const imageUrl = await fetchImageWithFallback();
      await ctx.replyWithPhoto(imageUrl);
    } catch (error) {
      console.error("Waifu command failed:", error.message);
      await ctx.reply("❌ Failed to fetch waifu image. Please try again later.");
    }
  },
};
