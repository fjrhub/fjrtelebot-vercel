import { Bot } from "grammy";

// ===== ENV =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_HEADER = process.env.TELEGRAM_SECRET || "";
const MODE = process.env.TELEGRAM_MODE || "webhook";

if (!BOT_TOKEN) throw new Error("BOT_TOKEN missing");
if (!SECRET_HEADER) throw new Error("TELEGRAM_SECRET missing");

// ===== BOT SINGLETON (fix cold start) =====
let bot = global._botInstance ?? new Bot(BOT_TOKEN);
global._botInstance = bot;

// ===== HANDLERS =====
bot.command("start", async (ctx) => {
  await ctx.reply("Bot aktif via webhook!");
});

bot.on("message", async (ctx) => {
  await ctx.reply("Pesan diterima ✔️");
});

// ===== DEVELOPMENT POLLING =====
if (MODE === "polling" && !global._botPollingStarted) {
  console.log("[DEV] Polling aktif...");
  await bot.init();
  bot.start();
  global._botPollingStarted = true;
}

// ======= SERVERLESS API (Vercel) =======
export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== "POST") {
    return res.status(200).send("Webhook OK");
  }

  // VALIDASI HEADER TELEGRAM
  const headerSecret = req.headers["x-telegram-bot-api-secret-token"];

  if (headerSecret !== SECRET_HEADER) {
    console.warn("[WEBHOOK] Invalid secret!");
    return res.status(401).send("Unauthorized");
  }

  try {
    // Init bot info -> WAJIB sebelum handleUpdate()
    if (!bot.botInfo) {
      console.log("[WEBHOOK] Initializing bot info...");
      await bot.init();
    }

    await bot.handleUpdate(req.body);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[WEBHOOK ERROR]", err);
    return res.status(500).send("Internal Server Error");
  }
}
