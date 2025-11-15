import { Bot } from "grammy";
import { handleMessage, handleCommand, handleCallback } from "./handler.js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // baca file .env.local

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("Missing BOT_TOKEN");

if (!global._botInstance) {
  const bot = new Bot(token);

  // delegasikan semua ke handler.js
  bot.on("message", handleMessage);
  bot.command("*", handleCommand);
  bot.on("callback_query:data", handleCallback);

  global._botInstance = bot;
}

const bot = global._botInstance;

// === Development Mode (Polling) ===
if (process.env.TELEGRAM_MODE === "polling") {
  if (!global._botPollingStarted) {
    console.log("Bot berjalan dalam MODE POLLING ( development )");
    bot.start();
    global._botPollingStarted = true;
  }
}

export default bot;
