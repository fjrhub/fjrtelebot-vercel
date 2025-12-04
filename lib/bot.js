import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // load env
import { Bot } from "grammy";
import { handleMessage, handleCallback } from "./handler.js";

// === ENV ===
const token = process.env.BOT_TOKEN;
const mode = process.env.TELEGRAM_MODE;

if (!token) throw new Error("Missing BOT_TOKEN");

// === SINGLETON ===
const bot = global._botInstance ?? new Bot(token);
global._botInstance = bot;

// === HANDLERS ===
bot.on("message", handleMessage);
bot.on("callback_query", handleCallback);

// === POLLING MODE (development) ===
if (mode === "polling" && !global._botPollingStarted) {
  console.log("🚀 Bot berjalan dalam MODE POLLING (Development)");
  bot.start();
  global._botPollingStarted = true;
}

export default bot;
