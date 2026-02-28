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

    return (
      completion.choices?.[0]?.message?.content ||
      "❌ No response received from the AI."
    );
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
  description: "AI chat",

  async execute(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text) return;

    const replyText = ctx.message?.reply_to_message?.text;
    const inputText = text.replace(/^\/ai\s*/i, "").trim();

    // jika user hanya kirim /ai tanpa apa apa
    if (!replyText && !inputText) {
      return ctx.reply("Usage:\n/ai pertanyaan\natau reply chat lalu /ai");
    }

    let finalPrompt;

    if (replyText && inputText) {
      finalPrompt = `${inputText}\n\n${replyText}`;
    } else if (replyText) {
      finalPrompt = replyText;
    } else {
      finalPrompt = inputText;
    }

    try {
      await ctx.replyWithChatAction("typing");

      const reply = await sendToGroq(finalPrompt);

      await ctx.reply(reply.slice(0, 4096), {
        parse_mode: "Markdown",
      });
    } catch (err) {
      console.error("AI COMMAND ERROR:", err);
      ctx.reply("❌ An unexpected error occurred.");
    }
  },
};
