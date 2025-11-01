import { Bot } from "grammy";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("Missing BOT_TOKEN in environment variables");

let bot;

// Gunakan singleton supaya bot tidak dibuat ulang di setiap request
if (!global._botInstance) {
  global._botInstance = new Bot(token);

  // Tambahkan command di sini
  global._botInstance.command("start", (ctx) => ctx.reply("🤖 Bot aktif di Vercel!"));
}

bot = global._botInstance;

// Inisialisasi hanya sekali (hindari fetch berulang)
if (!bot.isInited) {
  bot.init().then(() => {
    bot.isInited = true;
    console.log("✅ Bot initialized successfully");
  }).catch((err) => {
    console.error("❌ Failed to init bot:", err);
  });
}

export default bot;