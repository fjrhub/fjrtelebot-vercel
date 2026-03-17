import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { InputFile } from "grammy";
import Groq from "groq-sdk";
import mongoose, { Schema, model } from "mongoose";

/* ================= CONFIG ================= */
if (!process.env.GROQ_API_KEY || !process.env.MONGODB_URI) {
  throw new Error("Missing GROQ_API_KEY or MONGODB_URI");
}

const MODEL = "qwen/qwen3-32b";
const MAX_HISTORY = 10;
const SAFE_LIMIT = 4000;
const CACHE_TTL = 5 * 60 * 1000; // 5 menit

/* ================= GROQ CLIENT ================= */
const groq = global._groq ?? new Groq({ apiKey: process.env.GROQ_API_KEY });
global._groq = groq;

/* ================= MONGODB SCHEMAS ================= */
const aiHistorySchema = new Schema({
  chatId: { type: Number, required: true, unique: true, index: true },
  messages: [{
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: false });
aiHistorySchema.pre("save", function () { this.updatedAt = new Date(); });

const aiMessageSchema = new Schema({
  chatId: { type: Number, required: true, index: true },
  messageId: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 }
}, { timestamps: false });
aiMessageSchema.index({ chatId: 1, messageId: 1 }, { unique: true });

const aiLockSchema = new Schema({
  chatId: { type: Number, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now, expires: 30 } // 30 detik, lebih aman
}, { timestamps: false });

const AiHistory = mongoose.models.AiHistory ?? model("AiHistory", aiHistorySchema);
const AiMessage = mongoose.models.AiMessage ?? model("AiMessage", aiMessageSchema);
const AiLock = mongoose.models.AiLock ?? model("AiLock", aiLockSchema);

/* ================= DB CONNECTION ================= */
let dbConnected = false;
export async function connectDB() {
  if (dbConnected) return;
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "cahayamalam_bot" });
  dbConnected = true;
  console.log("🗄️ MongoDB connected");
}

export async function dropPendingUpdates(bot) {
  try { await bot.api.deleteWebhook({ drop_pending_updates: true }); }
  catch (err) { console.error("⚠️ Drop pending failed:", err.message); }
}

/* ================= IN-MEMORY CACHE ================= */
const historyCache = new Map();

function getCachedHistory(chatId) {
  const cached = historyCache.get(chatId);
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > CACHE_TTL) {
    historyCache.delete(chatId);
    return null;
  }
  return cached.messages;
}

function setCachedHistory(chatId, messages) {
  historyCache.set(chatId, { messages, updatedAt: Date.now() });
}

function invalidateCache(chatId) {
  historyCache.delete(chatId);
}

// Cleanup expired entries tiap menit
setInterval(() => {
  const now = Date.now();
  for (const [chatId, data] of historyCache.entries()) {
    if (now - data.updatedAt > CACHE_TTL) {
      historyCache.delete(chatId);
    }
  }
}, 60_000);

// Monitoring cache size (opsional)
setInterval(() => {
  console.log(`📦 Cache size: ${historyCache.size} chats`);
}, 5 * 60_000);

/* ================= DB HELPERS ================= */
async function getHistory(chatId) {
  // 1. Cek cache dulu
  const cached = getCachedHistory(chatId);
  if (cached) return cached;

  // 2. Fallback ke DB
  await connectDB();
  const doc = await AiHistory.findOne({ chatId }).lean(); // lean() = plain object, lebih cepat
  const messages = doc?.messages?.map(m => ({ role: m.role, content: m.content })) || [];

  // 3. Isi cache
  setCachedHistory(chatId, messages);
  return messages;
}

async function saveHistory(chatId, messages) {
  const trimmed = messages.slice(-MAX_HISTORY * 2);
  
  // 1. Update cache segera (optimistic)
  setCachedHistory(chatId, trimmed);

  // 2. Simpan ke DB (fire-and-forget dengan error handling)
  connectDB().then(() =>
    AiHistory.findOneAndUpdate(
      { chatId },
      { $set: { messages: trimmed, updatedAt: new Date() } },
      { upsert: true, returnDocument: "after" }
    ).catch(err => console.error(`❌ DB save error chat ${chatId}:`, err.message))
  ).catch(err => console.error("❌ DB connect error:", err.message));
}

async function clearHistory(chatId) {
  invalidateCache(chatId);
  await connectDB();
  await AiHistory.findOneAndUpdate(
    { chatId },
    { $set: { messages: [], updatedAt: new Date() } },
    { upsert: true }
  );
}

async function trackAiMessage(chatId, messageId) {
  await connectDB();
  try { await AiMessage.create({ chatId, messageId }); }
  catch (err) { if (err.code !== 11000) console.error("trackAiMessage:", err); }
}

async function acquireLock(chatId) {
  await connectDB();
  try { await AiLock.create({ chatId }); return true; }
  catch (err) { return err.code === 11000 ? false : Promise.reject(err); }
}

async function releaseLock(chatId) {
  await connectDB();
  await AiLock.deleteOne({ chatId });
}

/* ================= MESSAGE UTILS ================= */
function splitMessage(text, limit = SAFE_LIMIT) {
  const chunks = [];
  while (text.length > limit) {
    let idx = text.lastIndexOf("\n\n", limit);
    if (idx === -1) idx = text.lastIndexOf("\n", limit);
    if (idx === -1) idx = text.lastIndexOf(" ", limit);
    if (idx === -1) idx = limit;
    chunks.push(text.slice(0, idx).trim());
    text = text.slice(idx).trim();
  }
  if (text.length) chunks.push(text);
  return chunks;
}

function escapeMarkdownV2(text) {
  return text.replace(/([_*[\]()~`>#+=|{}.!\\-])/g, "\\$1");
}

function convertToMarkdownV2(text) {
  const segments = [];
  const regex = /```[\s\S]*?```|`[^`]+`|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)|\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) segments.push(escapeMarkdownV2(text.slice(last, match.index)));
    const [full, b1, b2, i1, i2, lt, url] = match;
    if (full.startsWith("```")) segments.push("```" + full.slice(3, -3).replace(/`/g, "\\`") + "```");
    else if (full.startsWith("`")) segments.push("`" + full.slice(1, -1).replace(/`/g, "\\`") + "`");
    else if (b1 || b2) segments.push("*" + escapeMarkdownV2(b1 || b2) + "*");
    else if (i1 || i2) segments.push("_" + escapeMarkdownV2(i1 || i2) + "_");
    else if (lt && url) segments.push(`[${escapeMarkdownV2(lt)}](${url.replace(/[)]/g, "\\)")})`);
    else segments.push(escapeMarkdownV2(full));
    last = match.index + full.length;
  }
  if (last < text.length) segments.push(escapeMarkdownV2(text.slice(last)));
  return segments.join("");
}

async function sendMarkdownMessage(ctx, text) {
  for (const chunk of splitMessage(text)) {
    let converted;
    try { converted = convertToMarkdownV2(chunk); } catch { converted = null; }
    if (converted) {
      try {
        const sent = await ctx.api.sendMessage(ctx.chat.id, converted, { parse_mode: "MarkdownV2", disable_web_page_preview: true });
        await trackAiMessage(ctx.chat.id, sent.message_id);
        continue;
      } catch (e) { console.error("MarkdownV2 error:", e.message); }
    }
    try {
      const sent = await ctx.api.sendMessage(ctx.chat.id, chunk, { disable_web_page_preview: true });
      await trackAiMessage(ctx.chat.id, sent.message_id);
    } catch (e) { console.error("Plain send error:", e.message); }
  }
}

/* ================= GROQ REQUEST ================= */
async function sendToGroq(messages) {
  try {
    const res = await groq.chat.completions.create({
      model: MODEL, messages, temperature: 0.9, max_tokens: 6000
    });
    let content = res.choices?.[0]?.message?.content || "❌ No response.";
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    content = content.replace(/^#{1,6}\s+\*\*(.+?)\s*\*\*\s*$/gm, "**$1**");
    content = content.replace(/^#{1,6}\s+(.+)$/gm, "**$1**");
    content = content.replace(/\*\*(.+?)\s+\*\*/g, "**$1**");
    return content;
  } catch (err) {
    console.error("GROQ ERROR:", err);
    if (err.status === 429) return "⏳ Rate limit\\. Coba lagi sebentar\\.";
    if (err.status === 401) return "❌ API key salah\\.";
    return "❌ Gagal mengambil jawaban AI\\.";
  }
}

/* ================= SYSTEM PROMPT ================= */
function buildSystemPrompt(ctx) {
  const from = ctx.from;
  const user = from?.username ? `@${from.username}` : from?.first_name ? from.first_name + (from.last_name ? ` ${from.last_name}` : "") : "Unknown";
  return `Kamu adalah CahayaMalamBot, AI assistant yang friendly dan helpful.

**Karakter:**
- Santai, friendly, kayak temen ngobrol
- Langsung to the point, gak pake filler words
- Boleh punya opini, boleh disagree, boleh ketawa
- Pake bahasa Indonesia casual
- Pake emoji secukupnya 🎯

**Format Response:**
- Gunakan **bold** untuk penekanan
- Gunakan • untuk bullet points
- Gunakan \`backticks\` untuk inline code
- Gunakan triple backtick untuk code block
- Paragraf pendek, mudah dibaca
- Jangan gunakan tabel markdown
- DILARANG KERAS gunakan heading markdown (# ## ### #### dst) dalam bentuk apapun, ganti dengan **bold** kalau butuh judul

**PENTING - Telegram Limit:**
- Sistem otomatis memecah dan mengirim jawaban, TIDAK perlu kamu urus sama sekali
- DILARANG KERAS: nulis "Bagian 1", "Bagian 2", "lanjut ke bagian berikutnya", "karakter: xxx", atau apapun yang nunjukin kamu sadar soal limit
- DILARANG KERAS: tanya izin, minta konfirmasi, atau kasih preview sebelum jawab
- Cukup tulis jawaban lengkap dari awal sampai akhir seperti biasa, seolah tidak ada limit

**Rules:**
- Jawab lengkap tapi jangan bertele-tele
- JANGAN tampilkan <think> atau proses berpikir
- Langsung jawaban final
- Kalau tidak tahu, katakan jujur
- Kalau butuh info, tanya

**Context:**
- User: ${user}
- Timezone: Asia/Jakarta
- Location: Mojokerto, Jawa Timur`;
}

/* ================= CORE AI HANDLER ================= */
async function handleAICore(ctx, inputText) {
  const chatId = ctx.chat.id;
  const locked = await acquireLock(chatId);
  if (!locked) {
    await ctx.reply("⏳ Lagi proses pesanmu sebelumnya, tunggu sebentar ya.");
    return;
  }
  try {
    await ctx.replyWithChatAction("typing");
    
    // Get history (dari cache atau DB)
    const history = await getHistory(chatId);
    
    // Handle replied message context
    const replied = ctx.message?.reply_to_message;
    let repliedContext = "";
    if (replied) {
      const txt = replied.text || replied.caption || "";
      const nm = replied.from?.first_name || "Unknown";
      const isBot = replied.from?.is_bot ?? false;
      if (txt) repliedContext = `[User sedang membahas pesan ${isBot ? "bot" : `dari ${nm}`}]\n"""\n${txt}\n"""`;
    }
    
    const fullInput = repliedContext ? `${repliedContext}\n\n${inputText}` : inputText;
    
    const messages = [
      { role: "system", content: buildSystemPrompt(ctx) },
      ...history,
      { role: "user", content: fullInput }
    ];
    
    const reply = await sendToGroq(messages);
    
    // Save ke history (cache + DB async)
    await saveHistory(chatId, [
      ...history,
      { role: "user", content: fullInput },
      { role: "assistant", content: reply }
    ]);
    
    await sendMarkdownMessage(ctx, reply);
  } finally {
    await releaseLock(chatId);
  }
}

/* ================= EXPORTED HELPER ================= */
export async function isAiMessage(chatId, messageId) {
  await connectDB();
  return !!(await AiMessage.exists({ chatId, messageId }));
}

/* ================= COMMAND EXPORT ================= */
export default {
  name: "ai",
  description: "AI chat",

  async handleDocument(ctx) {
    const doc = ctx.message?.document;
    if (!doc) return;
    const isExport = doc.file_name?.startsWith("ai-history-") && doc.file_name?.endsWith(".json");
    if (!isExport) return;
    
    try {
      const file = await ctx.api.getFile(doc.file_id);
      const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Download failed");
      
      const parsed = JSON.parse(await res.text());
      if (!Array.isArray(parsed.messages) || parsed.messages.some(m => !m.role || !m.content)) {
        return ctx.reply("❌ Format file tidak valid.");
      }
      
      const msgs = parsed.messages.filter(m => ["user", "assistant"].includes(m.role));
      await saveHistory(ctx.chat.id, msgs);
      
      return ctx.reply(`✅ History di-import!\n• ${msgs.length} pesan\n• Export: ${parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString("id-ID") : "unknown"}`);
    } catch (err) {
      console.error("IMPORT ERROR:", err);
      return ctx.reply(err instanceof SyntaxError ? "❌ File JSON korup." : "❌ Gagal import.");
    }
  },

  async handleReply(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text || text.startsWith("/")) return;
    try { await handleAICore(ctx, text); }
    catch (err) { console.error(err); ctx.reply("❌ Terjadi error."); }
  },

  async execute(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text) return;
    const chatId = ctx.chat.id;

    if (text === "/ai reset") {
      await clearHistory(chatId);
      return ctx.reply("✅ History dihapus.");
    }

    if (text === "/ai export") {
      const history = await getHistory(chatId);
      if (!history.length) return ctx.reply("History kosong.");
      
      const data = {
        exportedAt: new Date().toISOString(),
        chatId,
        messageCount: history.length,
        messages: history
      };
      const buf = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
      
      return ctx.replyWithDocument(new InputFile(buf, `ai-history-${chatId}-${Date.now()}.json`), {
        caption: `📦 *Export History*\n• ${history.length} pesan\n• Kirim balik file ini dengan /ai import untuk restore`,
        parse_mode: "Markdown"
      });
    }

    if (text === "/ai import") return ctx.reply("Kirim file JSON export sebagai dokumen.");
    if (text === "/ai history") { ctx.message.text = "/ai export"; return this.execute(ctx); }

    const input = text.replace(/^\/ai\s*/i, "").trim();
    if (!input) return ctx.reply("Gunakan:\n/ai pertanyaan");

    try { await handleAICore(ctx, input); }
    catch (err) { console.error(err); ctx.reply("❌ Terjadi error."); }
  }
};