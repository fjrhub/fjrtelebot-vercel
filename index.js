import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" }); // load env

const bot = new Bot(process.env.BOT_TOKEN);
const MODE = process.env.TELEGRAM_MODE || "polling";

// Handler contoh
bot.command("start", (ctx) => ctx.reply("Bot aktif!"));
bot.on("message", (ctx) => ctx.reply("Pesan diterima ✔️"));

// ==========================
// POLLING MODE
// ==========================
if (MODE === "polling") {
  console.log("[BOT] Running in POLLING mode...");
  bot.start();
}

// ==========================
// WEBHOOK MODE
// ==========================
// Untuk host seperti Vercel / server Node biasa
else if (MODE === "webhook") {
  console.log("[BOT] Running in WEBHOOK mode...");

  const express = await import("express");
  const app = express.default();

  app.use(express.json());

  // Endpoint webhook → /api/webhook
  app.use("/api/webhook", bot.webhookCallback("/api/webhook"));

  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Webhook listening on port ${PORT}`);
  });
} else {
  console.error("Unknown TELEGRAM_MODE. Use polling or webhook.");
}
