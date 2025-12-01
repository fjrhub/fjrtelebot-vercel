import { Bot, webhookCallback } from "grammy";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN harus diisi!");

// Jangan pakai global._botInstance dulu, reset supaya bersih
const bot = new Bot(BOT_TOKEN);

bot.command("start", (ctx) => ctx.reply("Bot aktif di Vercel!"));
bot.on("message", (ctx) => ctx.reply("Pesan diterima ✔️"));

// Handler khusus untuk Vercel
export default webhookCallback(bot, "vercel");
