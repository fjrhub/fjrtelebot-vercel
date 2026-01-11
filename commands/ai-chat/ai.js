import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import Groq from "groq-sdk";

/* =========================
   CONFIG
========================= */
if (!process.env.GROQ_API_KEY) {
  throw new Error("Missing GROQ_API_KEY");
}

/* =========================
   GROQ CLIENT (SINGLETON)
========================= */
const groq =
  global._groq ??
  new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

global._groq = groq;

/* =========================
   GROQ HANDLER (NO HISTORY)
========================= */
async function sendToGroq(userMessage) {
  const startTime = Date.now();

  try {
    const completion = await withTimeout(
      groq.chat.completions.create({
        model: "compound-beta",
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.8,
        max_completion_tokens: 512,
      }),
      5000
    );

    const duration = Date.now() - startTime;

    const reply = completion.choices?.[0]?.message?.content;

    if (!reply) {
      console.warn(`[NO_RESPONSE] duration=${duration}ms`);
      return "❌ Tidak ada response dari AI.";
    }

    return reply;
  } catch (err) {
    if (err.code === "API_TIMEOUT") {
      return "❌ AI timeout (5 detik).";
    }

    return "❌ Gagal mendapatkan response AI.";
  }
}

/* =========================
   TIMEOUT HELPER
========================= */
function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        const err = new Error("API_TIMEOUT");
        err.code = "API_TIMEOUT";
        reject(err);
      }, ms)
    ),
  ]);
}

/* =========================
   COMMAND (GRAMMY)
========================= */
export default {
  name: "ai",
  description: "AI chat without history",

  async execute(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text) return;

    // /ai
    if (text === "/ai") {
      return ctx.reply("Gunakan:\n/ai <pertanyaan>");
    }

    const input = text.replace(/^\/ai\s*/i, "");
    if (!input) return;

    try {
      const reply = await sendToGroq(input);
      await ctx.reply(reply.slice(0, 4096));
    } catch (err) {
      console.error("AI ERROR:", err);
      ctx.reply("❌ Terjadi kesalahan.");
    }
  },
};
