// file: /pages/api/webhook/[secret].js
import { webhookCallback } from "grammy";
import { Bot } from "grammy";
import { handleMessage, handleCallback, handleDocument } from "../../../lib/handler.js";
import { connectDB } from "../../../db/db.js";

export const config = {
  api: { bodyParser: true },
};

if (!global._botReady) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("Missing BOT_TOKEN");

  const bot = new Bot(token);

  bot.on("message:document", handleDocument);
  bot.on("message", handleMessage);
  bot.on("callback_query", handleCallback);

  // Simpan promise init, bukan bot mentah
  global._botReady = bot.init().then(() => bot);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const { secret } = req.query;
  const expected = process.env.TELEGRAM_SECRET;
  if (!expected) return res.status(500).send("Server misconfiguration");
  if (secret !== expected) return res.status(401).send("Unauthorized");

  try {
    const [bot] = await Promise.all([
      global._botReady,
      connectDB(),
    ]);

    await bot.handleUpdate(req.body);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    return res.status(500).send("Internal Server Error");
  }
}