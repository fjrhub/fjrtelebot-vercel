import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const MODE = process.env.TELEGRAM_MODE || "webhook";
const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET = process.env.TELEGRAM_SECRET;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN harus diisi!");
if (!SECRET) throw new Error("TELEGRAM_SECRET harus diisi!");

// Cegah double instance di Vercel
const bot = global._botInstance ?? new Bot(BOT_TOKEN);
global._botInstance = bot;

bot.command("start", (ctx) => ctx.reply("Bot aktif!"));
bot.on("message", (ctx) => ctx.reply("Pesan diterima ✔️"));

// Polling mode
if (MODE === "polling" && !global._botPollingStarted) {
  console.log("[BOT] Polling mode aktif");
  bot.start();
  global._botPollingStarted = true;
} else {
  console.log("[BOT] Webhook mode aktif");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // =====================================================
  // 🔐 SECURITY: Validasi SECRET di path
  // =====================================================
  const urlSecret = req.query.secret;
  if (urlSecret !== SECRET) {
    console.warn("Webhook ditolak! Secret tidak cocok.");
    return res.status(403).send("Forbidden");
  }

  try {
    if (!bot.isInited()) {
      await bot.init();
    }

    await bot.handleUpdate(req.body);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).send("Internal Server Error");
  }
}
