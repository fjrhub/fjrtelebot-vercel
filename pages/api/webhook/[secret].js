// pages/api/webhook/[secret].js
import bot from "@lib/bot.js";

export const config = {
  api: { bodyParser: true },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const { secret } = req.query;
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return res.status(500).send("Server misconfiguration");
  if (secret !== expected) return res.status(401).send("Unauthorized");

  try {
    // Inisialisasi bot sebelum handle update
    await bot.init(); 

    const update = req.body;
    await bot.handleUpdate(update);

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).send("Internal Server Error");
  }
}