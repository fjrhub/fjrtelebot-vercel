import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { Bot } from "grammy";
import { handleMessage, handleCallback, handleDocument } from "./handler.js";

const token = process.env.BOT_TOKEN;
const mode = process.env.TELEGRAM_MODE;

if (!token) throw new Error("Missing BOT_TOKEN");

// === SINGLETON ===
const bot = global._botInstance ?? new Bot(token);
global._botInstance = bot;

// === POLLING MODE (development only) ===
// Di Vercel/production, bot dijalankan via webhook di pages/api/webhook/[secret].js
if (mode === "polling" && !global._botPollingStarted) {
  console.log("🚀 Bot running in POLLING MODE (Development)");

  bot.on("message:document", handleDocument);
  bot.on("message", handleMessage);
  bot.on("callback_query", handleCallback);

  bot.start();
  global._botPollingStarted = true;
}

export default bot;  