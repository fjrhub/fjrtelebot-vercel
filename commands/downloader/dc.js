import { InputFile } from "grammy";

const DISCORD_HOSTS = [
  "media.discordapp.net",
  "cdn.discordapp.com",
  "images-ext-1.discordapp.net",
  "images-ext-2.discordapp.net",
];

export default {
  name: "dc",
  async execute(ctx) {
    try {
      const url = extractUrl(ctx);
      
      if (!url) {
        return await ctx.reply(
          "⚠️ Format penggunaan:\n/dc https://media.discordapp.net/attachments/...\n\nHanya URL CDN Discord yang didukung."
        );
      }

      if (!isValidDiscordUrl(url)) {
        return await ctx.reply(
          "❌ Hanya URL CDN Discord yang didukung.\n\nContoh:\nhttps://media.discordapp.net/attachments/..."
        );
      }

      const image = await fetchImage(url);
      
      if (!image) {
        return await ctx.reply("❌ Gagal mengambil gambar dari tautan. Tautan mungkin kedaluwarsa, kadaluarsa, atau tidak valid.");
      }

      const filename = getFilenameFromUrl(url);
      
      await ctx.replyWithPhoto(new InputFile(image.data, filename));
      await ctx.deleteMessage().catch(() => {});
    } catch (err) {
      console.error("DC Command Error:", err);
      
      // Penanganan error spesifik untuk batas ukuran/dimensi dari Telegram API
      if (err.message?.includes("IMAGE_PROCESS_FAILED") || err.message?.includes("PHOTO_INVALID_DIMENSIONS")) {
        await ctx.reply("❌ Telegram gagal memproses gambar. Gambar mungkin terlalu besar atau formatnya tidak didukung.");
      } else {
        await ctx.reply("❌ Terjadi kesalahan tak terduga saat mengirim gambar.");
      }
    }
  },
};

function extractUrl(ctx) {
  // Mendukung ekstraksi dari teks biasa maupun caption
  const text = ctx.message?.text?.trim() || ctx.message?.caption?.trim() || "";
  const args = text.split(/\s+/).slice(1);
  
  if (!args.length) {
    // Fallback: Cek apakah command ini adalah balasan (reply) ke pesan yang mengandung URL
    const replyText = ctx.message?.reply_to_message?.text || ctx.message?.reply_to_message?.caption || "";
    const replyUrls = replyText.match(/https?:\/\/[^\s]+/g);
    if (replyUrls && replyUrls.length > 0) return replyUrls[0];
    return null;
  }
  
  const url = args[0];
  
  try {
    new URL(url);
    return url;
  } catch {
    // Fallback: cari URL di dalam teks jika argumen pertama bukan URL yang valid
    const urls = text.match(/https?:\/\/[^\s]+/g);
    return urls ? urls[0] : null;
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
  try {
    const res = await fetch(url);
    
    if (!res.ok) return null;
    
    // Validasi Content-Type untuk memastikan yang diunduh benar-benar gambar
    const contentType = res.headers.get('content-type');
    if (contentType && !contentType.startsWith('image/')) {
        return null;
    }

    const buffer = await res.arrayBuffer();
    return { data: new Uint8Array(buffer), contentType };
  } catch (err) {
    console.error("Fetch error:", err);
    return null;
  }
}

function getFilenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    const filename = parts[parts.length - 1];
    
    // Ambil nama file asli beserta ekstensinya (.gif, .webp, dll)
    if (filename && filename.includes('.')) {
      return decodeURIComponent(filename);
    }
  } catch {}
  
  return "discord-image.jpg"; // Fallback default
}