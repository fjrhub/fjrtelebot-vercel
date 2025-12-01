import { Bot } from "grammy";

const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET_HEADER = process.env.TELEGRAM_SECRET;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN missing");
if (!SECRET_HEADER) throw new Error("TELEGRAM_SECRET missing");

let bot = global._telegramBot;
let botReady = global._telegramBotReady;

if (!bot) {
  bot = new Bot(BOT_TOKEN);

  // Handler
  bot.command("start", (ctx) => ctx.reply("Bot aktif via webhook!"));
  bot.on("message", (ctx) => ctx.reply("Pesan diterima ✔️"));

  global._telegramBot = bot;
}

// Lazy init (dipanggil hanya sekali)
async function ensureBotInit() {
  if (!botReady) {
    await bot.init();
    global._telegramBotReady = true;
  }
}

// FIX: Body parser manual (wajib untuk Vercel)
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  // Secret check
  const headerSecret = req.headers["x-telegram-bot-api-secret-token"];
  if (headerSecret !== SECRET_HEADER) {
    return res.status(401).send("Unauthorized");
  }

  try {
    // Pastikan init SEBELUM update
    await ensureBotInit();

    const update = await readBody(req);
    await bot.handleUpdate(update);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[WEBHOOK ERROR]", err);
    return res.status(500).send("Internal Server Error");
  }
}
