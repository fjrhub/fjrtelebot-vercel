import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { InputFile } from "grammy";
import Groq from "groq-sdk";

/* =========================
   CONFIG
========================= */
if (!process.env.GROQ_API_KEY) {
  throw new Error("Missing GROQ_API_KEY");
}

/* =========================
   GROQ CLIENT
========================= */
const groq =
  global._groq ??
  new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

global._groq = groq;

/* =========================
   MEMORY HISTORY
========================= */
global.aiHistory = global.aiHistory || {};

// maksimal history yang disimpan
const MAX_HISTORY = 10;

/* =========================
   GROQ HANDLER
========================= */
async function sendToGroq(messages) {
  try {
    const completion = await groq.chat.completions.create({
      model: "compound-beta",
      messages,
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
   COMMAND
========================= */
export default {
  name: "ai",
  description: "AI chat",

  async execute(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text) return;

    const chatId = ctx.chat.id;

    // init history
    if (!global.aiHistory[chatId]) {
      global.aiHistory[chatId] = [];
    }

    /* =========================
       /ai history
    ========================= */
    if (text === "/ai history") {
      const history = global.aiHistory[chatId];

      if (!history.length) {
        return ctx.reply("History kosong.");
      }

      const content = history
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join("\n\n");

      const buffer = Buffer.from(content, "utf-8");

      return ctx.replyWithDocument(new InputFile(buffer, "ai-history.txt"));
    }

    const replyText = ctx.message?.reply_to_message?.text;
    const inputText = text.replace(/^\/ai\s*/i, "").trim();

    if (!replyText && !inputText) {
      return ctx.reply("Gunakan:\n/ai pertanyaan\natau reply chat lalu /ai");
    }

    let prompt;

    if (replyText && inputText) {
      prompt = `${inputText}\n\n${replyText}`;
    } else if (replyText) {
      prompt = replyText;
    } else {
      prompt = inputText;
    }

    try {
      await ctx.replyWithChatAction("typing");

      const history = global.aiHistory[chatId];

      history.push({
        role: "user",
        content: prompt,
      });

      // batasi history
      if (history.length > MAX_HISTORY) {
        history.shift();
      }

      const reply = await sendToGroq(history);

      history.push({
        role: "assistant",
        content: reply,
      });

      if (history.length > MAX_HISTORY) {
        history.shift();
      }

      await ctx.reply(reply.slice(0, 4096));
    } catch (err) {
      console.error("AI COMMAND ERROR:", err);
      ctx.reply("❌ Error saat menjalankan AI.");
    }
  },
};
