import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { MongoClient, ServerApiVersion } from "mongodb";
import Groq from "groq-sdk";
import { InputFile } from "grammy";

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
   DB HELPERS
========================= */
async function getCollection() {
  if (!mongoClient.topology?.isConnected()) {
    await mongoClient.connect();
  }
  return mongoClient.db(dbName).collection(collectionName);
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

async function getHistory(chatId, limit = 100) {
  const col = await getCollection();
  return col.find({ chatId }).sort({ createdAt: 1 }).limit(limit).toArray();
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

  const history = await getHistory(chatId, 20);
  const messages = history.map((h) => ({
    role: h.role,
    content: h.content,
  }));

  const startTime = Date.now();

  try {
    const completion = await withTimeout(
      groq.chat.completions.create({
        model: "compound-beta",
        messages,
        temperature: 0.8,
        max_completion_tokens: 512,
      }),
      9000
    );

    const duration = Date.now() - startTime;

    const reply = completion.choices?.[0]?.message?.content;

    if (!reply) {
      console.warn(`[NO_RESPONSE] chatId=${chatId} duration=${duration}ms`);
      return "❌ Tidak ada response dari API.";
    }

    await addMessage(chatId, "assistant", reply);
    return reply;
  } catch (err) {
    const duration = Date.now() - startTime;

    if (err.code === "API_TIMEOUT") {
      return "❌ Tidak ada response dari API (timeout 9 detik).";
    }

    return "❌ Tidak ada response dari API.";
  }
}

function withTimeout(promise, ms = 9000) {
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
   COMMAND
========================= */
export default {
  name: "ai",
  description: "AI chat with history (grammy)",

  async execute(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text) return;

    const chatId =
      ctx.chat.type === "private"
        ? String(ctx.from.id)
        : `${ctx.chat.id}:${ctx.from.id}`;

    // /ai
    if (text === "/ai") {
      return ctx.reply(
        "AI aktif\n\n" + "/ai <pertanyaan>\n" + "/ai history\n" + "/ai new"
      );
    }

    const input = text.replace(/^\/ai\s*/i, "");

    /* =========================
       /ai history → FILE TXT
    ========================= */
    if (input.toLowerCase() === "history") {
      const history = await getHistory(chatId);

      if (!history.length) {
        return ctx.reply("Belum ada history.");
      }

      // ISI FILE POLOS
      let content = "";
      for (const h of history) {
        content += `${h.role}: ${h.content}\n`;
      }

      const file = new InputFile(Buffer.from(content, "utf-8"), "history.txt");

      return ctx.api.sendDocument(ctx.chat.id, file);
    }

    // /ai new
    if (input.toLowerCase() === "new") {
      await resetHistory(chatId);
      return ctx.reply("History direset.");
    }

    /* =========================
       CHAT AI
    ========================= */
    try {
      const reply = await sendToGroq(chatId, input);
      await ctx.reply(reply.slice(0, 4096));
    } catch (err) {
      console.error("AI ERROR:", err);
      ctx.reply("Gagal memproses AI.");
    }
  },
};
