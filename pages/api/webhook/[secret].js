// file: /pages/api/webhook/[secret].js
import bot from "../../../lib/bot.js";
import { handleMessage, handleCallback } from "../../../lib/handler.js";

export const config = {
  api: { bodyParser: true },
};

// Install the listener only ONCE
if (!bot._handlersSet) {
  bot.on("message", handleMessage);
  bot.on("callback_query", handleCallback);
  bot._handlersSet = true; // marker to prevent double installation
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
    await bot.init();
    await bot.handleUpdate(req.body);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    return res.status(500).send("Internal Server Error");
  }
}
