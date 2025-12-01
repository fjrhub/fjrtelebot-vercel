import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Mode & Token
const MODE = process.env.TELEGRAM_MODE || "webhook";
const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_HEADER = process.env.TELEGRAM_SECRET;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN harus diisi!");
if (!SECRET_HEADER) throw new Error("TELEGRAM_SECRET harus diisi!");

// Singleton bot (fix Vercel cold start)
const bot = global._botInstance ?? new Bot(BOT_TOKEN);
global._botInstance = bot;

// Tambahkan handler
bot.command("start", (ctx) => ctx.reply("Bot aktif!"));
bot.on("message", (ctx) => ctx.reply("Pesan diterima ✔️"));

// Untuk polling ketika development
if (MODE === "polling" && !global._botPollingStarted) {
  console.log("[BOT] Polling mode aktif");
  await bot.init();
  bot.start();
  global._botPollingStarted = true;
}

// ==========================
//  WEBHOOK HANDLER VERCEL
// ==========================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  // Validasi secret header Telegram
  const headerSecret = req.headers["x-telegram-bot-api-secret-token"];

  if (headerSecret !== SECRET_HEADER) {
    console.warn("[BOT] Unauthorized webhook request!");
    return res.status(401).send("Unauthorized");
  }

  try {
    // Pastikan bot sudah inisialisasi
    if (!bot.botInfo) {
      await bot.init();
    }

    await bot.handleUpdate(req.body);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("[BOT] Handler error:", err);
    return res.status(500).send("Internal Server Error");
  }
}
