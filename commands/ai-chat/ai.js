import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { MongoClient, ServerApiVersion } from "mongodb";
import Groq from "groq-sdk";

/* =========================
   CONFIG
========================= */
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGO_DB || "ai_bot";
const collectionName = process.env.MONGO_COLLECTION || "ai_history";

if (!uri) throw new Error("Missing MONGODB_URI");
if (!process.env.GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY");

/* =========================
   MONGO SINGLETON
========================= */
const mongoClient =
  global._mongoClient ??
  new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

global._mongoClient = mongoClient;

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
   MARKDOWN HELPER
========================= */
function replyMarkdown(ctx, text) {
  return ctx.reply(text, {
    parse_mode: "Markdown", // ⬅️ PENTING
    disable_web_page_preview: true,
  });
}

/* =========================
   DB HELPERS
========================= */
async function getCollection() {
  if (!mongoClient.topology?.isConnected()) {
    await mongoClient.connect();
  }
  const db = mongoClient.db(dbName);
  return db.collection(collectionName);
}

async function addMessage(chatId, role, content) {
  const col = await getCollection();
  await col.insertOne({
    chatId,
    role,
    content,
    createdAt: new Date(),
  });
}

async function getHistory(chatId, limit = 15) {
  const col = await getCollection();
  return col
    .find({ chatId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();
}

async function resetHistory(chatId) {
  const col = await getCollection();
  await col.deleteMany({ chatId });
}

/* =========================
   GROQ HANDLER
========================= */
async function sendToGroq(chatId, userMessage) {
  await addMessage(chatId, "user", userMessage);

  const history = await getHistory(chatId);
  const messages = history.map(h => ({
    role: h.role,
    content: h.content,
  }));

  const completion = await groq.chat.completions.create({
    model: "compound-beta",
    messages,
    temperature: 1,
    max_completion_tokens: 1024,
  });

  const reply =
    completion.choices[0]?.message?.content || "No response.";

  await addMessage(chatId, "assistant", reply);
  return reply;
}

/* =========================
   COMMAND EXPORT
========================= */
export default {
  name: "ai",
  description: "Chat AI with Groq + MongoDB history",

  async execute(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text) return;

    // chatId unik
    const chatId =
      ctx.chat.type === "private"
        ? String(ctx.from.id)
        : `${ctx.chat.id}:${ctx.from.id}`;

    // /ai
    if (text === "/ai") {
      return replyMarkdown(
        ctx,
        `🤖 *AI aktif!*

Gunakan:
• \`/ai <pertanyaan>\`
• \`/ai history\`
• \`/ai new\``
      );
    }

    const input = text.replace(/^\/ai\s*/i, "");

    // /ai history
    if (input.toLowerCase() === "history") {
      const history = await getHistory(chatId);
      if (!history.length) {
        return replyMarkdown(ctx, "_Belum ada history._");
      }

      let msg = "📜 *History:*\n\n";
      history.forEach(h => {
        msg += `*${h.role.toUpperCase()}*\n${h.content}\n\n`;
      });

      return replyMarkdown(ctx, msg.slice(0, 4096));
    }

    // /ai new
    if (input.toLowerCase() === "new") {
      await resetHistory(chatId);
      return replyMarkdown(ctx, "🔄 *History berhasil direset.*");
    }

    // CHAT AI
    try {
      const reply = await sendToGroq(chatId, input);
      await replyMarkdown(ctx, reply.slice(0, 4096));
    } catch (err) {
      console.error("AI ERROR:", err);
      ctx.reply("❌ Gagal memproses AI.");
    }
  },
};
