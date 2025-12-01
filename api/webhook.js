import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const MODE = process.env.TELEGRAM_MODE || "webhook";
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN harus diisi!");

const bot = global._botInstance ?? new Bot(BOT_TOKEN);
global._botInstance = bot;

bot.command("start", (ctx) => ctx.reply("Bot aktif!"));
bot.on("message", (ctx) => ctx.reply("Pesan diterima ✔️"));

if (MODE === "polling" && !global._botPollingStarted) {
  console.log("[BOT] Polling mode aktif");
  bot.start();
  global._botPollingStarted = true;
} else {
  console.log("[BOT] Webhook mode aktif");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    if (!bot.isInited()) {
      await bot.init();
    }

    await bot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (err) {
    console.error("Handler error:", err);
    res.status(500).send("Internal Server Error");
  }
}
