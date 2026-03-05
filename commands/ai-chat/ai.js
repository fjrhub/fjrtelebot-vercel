import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { InputFile } from "grammy";
import Groq from "groq-sdk";

/* ========================= CONFIG ========================= */
if (!process.env.GROQ_API_KEY) {
  throw new Error("Missing GROQ_API_KEY");
}

const MODEL = "qwen/qwen3-32b";
const MAX_HISTORY = 10;
const TELEGRAM_LIMIT = 4096;
const SAFE_LIMIT = 3500;

/* ========================= GROQ CLIENT ========================= */
const groq = global._groq ?? new Groq({
  apiKey: process.env.GROQ_API_KEY,
});
global._groq = groq;

/* ========================= MEMORY HISTORY ========================= */
global.aiHistory = global.aiHistory || {};

/* ========================= SMART MESSAGE SPLIT ========================= */
function splitMessage(text, limit = SAFE_LIMIT) {
  const chunks = [];
  
  while (text.length > limit) {
    let splitIndex = text.lastIndexOf('\n\n', limit);
    if (splitIndex === -1) splitIndex = text.lastIndexOf('\n', limit);
    if (splitIndex === -1) splitIndex = text.lastIndexOf(' ', limit);
    if (splitIndex === -1 || splitIndex < limit - 100) splitIndex = limit;
    
    chunks.push(text.slice(0, splitIndex).trim());
    text = text.slice(splitIndex).trim();
  }
  
  if (text.length > 0) chunks.push(text.trim());
  return chunks;
}

/* ========================= MARKDOWNV2 ESCAPE HELPER ========================= */
function escapeMarkdownV2(text) {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/* ========================= SEND MESSAGE WITH MARKDOWNV2 ========================= */
async function sendMarkdownMessage(ctx, text) {
  const chunks = splitMessage(text);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isLast = i === chunks.length - 1;
    
    try {
      await ctx.api.sendMessage(ctx.chat.id, chunk, {
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      });
    } catch (err) {
      console.error("MARKDOWNV2 ERROR:", err.message);
      await ctx.api.sendMessage(ctx.chat.id, chunk, {
        parse_mode: undefined,
        disable_web_page_preview: true,
      });
    }
    
    if (!isLast) await new Promise(resolve => setTimeout(resolve, 150));
  }
}

/* ========================= GROQ HANDLER ========================= */
async function sendToGroq(messages) {
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.9,
      max_tokens: 2048,
    });
    
    let content = completion.choices?.[0]?.message?.content || "❌ No response received from the AI.";
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    return content || "❌ No response received from the AI.";
  } catch (err) {
    console.error("GROQ ERROR:", err);
    if (err.status === 429) return "⏳ Rate limit! Tunggu bentar ya...";
    if (err.status === 401) return "❌ API key invalid!";
    return "❌ Failed to get a response from the AI.";
  }
}

/* ========================= SYSTEM PROMPT ========================= */
const SYSTEM_PROMPT = `Kamu adalah ClawBot, AI assistant yang friendly dan helpful.

**Karakter:**
- Santai, friendly, kayak temen ngobrol
- Langsung to the point, gak pake filler words
- Boleh punya opini, boleh disagree, boleh ketawa
- Pake bahasa Indonesia casual
- Pake emoji secukupnya 🎯

**Format Response:**
- Gunakan **bold** untuk penekanan
- Gunakan • untuk bullet points
- Gunakan \`backticks\` untuk code
- Paragraf pendek, mudah dibaca
- Jangan gunakan tabel markdown

**PENTING - Telegram Limit:**
- Maksimal 4096 karakter per pesan
- Jika jawaban panjang, akan otomatis terbagi jadi beberapa pesan
- Fokus ke jawaban lengkap dan jelas

**Rules:**
- Jawab lengkap tapi jangan bertele-tele
- JANGAN tampilkan <think> atau proses berpikir
- Langsung jawaban final
- Kalau tidak tahu, katakan jujur
- Kalau butuh info, tanya

**Context:**
- User: FJR
- Timezone: Asia/Jakarta
- Location: Mojokerto, Jawa Timur`;

/* ========================= COMMAND ========================= */
export default {
  name: "ai",
  description: "AI chat dengan MarkdownV2 support",
  
  async execute(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text) return;
    
    const chatId = ctx.chat.id;
    if (!global.aiHistory[chatId]) global.aiHistory[chatId] = [];
    
    if (text === "/ai history") {
      const history = global.aiHistory[chatId];
      if (!history.length) return ctx.reply("History kosong.");
      
      const content = history
        .map((msg) => `*${escapeMarkdownV2(msg.role)}*:\n${escapeMarkdownV2(msg.content)}`)
        .join("\n\n");
      
      const buffer = Buffer.from(content, "utf-8");
      return ctx.replyWithDocument(new InputFile(buffer, "ai-history.txt"));
    }
    
    if (text === "/ai reset") {
      global.aiHistory[chatId] = [];
      return ctx.reply("✅ History chat sudah di-reset.");
    }
    
    if (text === "/ai help") {
      // Build help text dengan escaping manual yang benar untuk template literal
      const helpText = 
        '*🤖 AI Bot Commands*\n\n' +
        '/ai <pertanyaan> - Chat dengan AI\n' +
        '/ai reply <pertanyaan> - Reply chat + pertanyaan\n' +
        '/ai history - Download history chat\n' +
        '/ai reset - Reset history chat\n' +
        '/ai help - Tampilkan bantuan ini\n\n' +
        '*Format yang didukung:*\n' +
        '\\\\*Bold\\\\*, \\\\_Italic\\\\_, \\\\\\`Code\\\\\\`, \\\\[Link\\\\]\\\\(url\\\\)\n\n' +
        '*Catatan:*\n' +
        '- Auto split jika >4096 karakter\n' +
        '- AI tahu limit ini';
      
      return sendMarkdownMessage(ctx, helpText);
    }
    
    const replyText = ctx.message?.reply_to_message?.text;
    const inputText = text.replace(/^\/ai\s*/i, "").trim();
    
    if (!replyText && !inputText) {
      return ctx.reply("Gunakan:\\n/ai pertanyaan\\natau reply chat lalu /ai");
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
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: prompt }
      ];
      
      const reply = await sendToGroq(messages);
      
      history.push({ role: "user", content: prompt });
      history.push({ role: "assistant", content: reply });
      
      while (history.length > MAX_HISTORY * 2) history.shift();
      
      await sendMarkdownMessage(ctx, reply);
      
    } catch (err) {
      console.error("AI COMMAND ERROR:", err);
      ctx.reply("❌ Error saat menjalankan AI.");
    }
  },
};