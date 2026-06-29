import { InputFile } from "grammy";

const DISCORD_HOSTS = [
  "media.discordapp.net",
  "cdn.discordapp.com",
  "images-ext-1.discordapp.net",
  "images-ext-2.discordapp.net",
];

export default {
  name: "img",
  async execute(ctx) {
    try {
      const url = extractUrl(ctx);
      
      if (!url) {
        return await ctx.reply(
          "⚠️ Usage format:\n/img https://media.discordapp.net/attachments/...\n\nOnly Discord CDN URLs are supported."
        );
      }

      if (!isValidDiscordUrl(url)) {
        return await ctx.reply(
          "❌ Only Discord CDN URLs are supported.\n\nExample:\nhttps://media.discordapp.net/attachments/..."
        );
      }

      const imageBuffer = await fetchImage(url);
      
      if (!imageBuffer) {
        return await ctx.reply("❌ Failed to fetch image from the provided link.");
      }

      await ctx.replyWithPhoto(new InputFile(imageBuffer, "image.png"));
      await ctx.deleteMessage().catch(() => {});
    } catch (err) {
      console.error("IMG Command Error:", err);
      await ctx.reply("❌ An error occurred.");
    }
  },
};

function extractUrl(ctx) {
  const text = ctx.message?.text?.trim() || "";
  const args = text.split(" ").slice(1);
  
  if (!args.length) return null;
  
  const url = args[0];
  
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

function isValidDiscordUrl(url) {
  try {
    const parsed = new URL(url);
    return DISCORD_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function fetchImage(url) {
  const res = await fetch(url);
  
  if (!res.ok) return null;
  
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}
