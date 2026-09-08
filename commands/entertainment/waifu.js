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
const MAX_RETRIES = 2;

/**
 * Validates if the given URL is a valid image URL
 * @param {string} url - URL to validate
 * @returns {boolean} - Whether the URL is valid
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches an image from a specific API configuration
 * @param {Object} config - API configuration object
 * @returns {Promise<string>} - Image URL
 */
async function fetchImageFromApi(config) {
  const response = await axios.get(createUrl(config.name, config.endpoint), {
    timeout: TIMEOUT_MS,
    validateStatus: (status) => status >= 200 && status < 300,
  });

  const imageUrl = config.extractUrl(response.data);

  if (!isValidImageUrl(imageUrl)) {
    throw new Error(`${config.name} returned an invalid image URL`);
  }

  return imageUrl;
}

/**
 * Attempts to fetch image with retry logic for a single API
 * @param {Object} config - API configuration
 * @returns {Promise<string>} - Image URL
 */
async function fetchWithRetry(config) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchImageFromApi(config);
    } catch (error) {
      lastError = error;
      console.warn(
        `[${config.name}] Attempt ${attempt}/${MAX_RETRIES} failed:`,
        error.message
      );

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Fetches image with fallback to multiple APIs
 * @returns {Promise<string>} - Image URL
 */
async function fetchImageWithFallback() {
  const errors = [];

  for (const config of API_CONFIGS) {
    try {
      return await fetchWithRetry(config);
    } catch (error) {
      errors.push({ api: config.name, error: error.message });
      console.warn(`[${config.name}] All retries failed:`, error.message);
    }
  }

  const errorDetails = errors
    .map((e) => `${e.api}: ${e.error}`)
    .join("; ");
  throw new Error(`All APIs failed after retries. Details: ${errorDetails}`);
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
      await ctx.reply(
        "❌ Failed to fetch waifu image. Please try again later."
      );
    }
  },
};
