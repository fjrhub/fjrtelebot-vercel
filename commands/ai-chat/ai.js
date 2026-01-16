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
  try {
    const completion = await groq.chat.completions.create({
      model: "compound-beta",
      messages: [{ role: "user", content: userMessage }],
      temperature: 1,
      max_tokens: 256,
    });

    return completion.choices?.[0]?.message?.content || "❌ No response received from the AI.";
  } catch (err) {
    console.error("GROQ ERROR:", err);
    return "❌ Failed to get a response from the AI.";
  }
}


/* =========================
   COMMAND (GRAMMY)
========================= */
export default {
  name: "ai",
  description: "AI chat (Markdown output)",

  async execute(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text) return;

    // /ai
    if (text === "/ai") {
      return ctx.reply("*AI is active*\n\nUsage:\n`/ai <your question>`", {
        parse_mode: "Markdown",
      });
    }

    const input = text.replace(/^\/ai\s*/i, "");
    if (!input) return;

    try {
      const reply = await sendToGroq(input);

      await ctx.reply(reply.slice(0, 4096), {
        parse_mode: "Markdown",
      });
    } catch (err) {
      console.error("AI COMMAND ERROR:", err);
      ctx.reply("❌ An unexpected error occurred.");
    }
  },
};
