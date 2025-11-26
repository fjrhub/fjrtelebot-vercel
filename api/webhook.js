import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// ==========================
// Konfigurasi mode dan token
// ==========================
const MODE = process.env.TELEGRAM_MODE || "webhook"; // default webhook
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN must be set in environment variables!");
}

// ==========================
// Buat Bot instance
// ==========================
const bot = new Bot(BOT_TOKEN);

// ==========================
// Handler contoh
// ==========================
bot.command("start", (ctx) => ctx.reply("Bot aktif!"));
bot.on("message", (ctx) => ctx.reply("Pesan diterima ✔️"));

// ==========================
// Debug log untuk setiap update
// ==========================
bot.on("message", (ctx) => console.log("Received message:", ctx.message));

// ==========================
// Export handler top-level untuk Vercel webhook
// ==========================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    console.log("Incoming update:", JSON.stringify(req.body));
    await bot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (err) {
    console.error("Handler error:", err);
    res.status(500).send("Internal Server Error");
  }
}

// ==========================
// Jalankan polling jika MODE=polling (dev/local)
// ==========================
if (MODE === "polling") {
  console.log("[BOT] Running in POLLING mode for development...");
  bot.start();
} else {
  console.log("[BOT] Webhook mode active for production (Vercel handler)");
}
