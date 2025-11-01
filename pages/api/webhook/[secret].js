import bot from "@/lib/bot";

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  if (req.query.secret !== process.env.WEBHOOK_SECRET)
    return res.status(401).end("Unauthorized");

  try {
    await bot.handleUpdate(req.body);
    res.status(200).end("OK");
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).end("Internal Error");
  }
}