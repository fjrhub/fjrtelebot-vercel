import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { InputFile } from "grammy";
import Groq from "groq-sdk";
import { connectDB } from "../../db/db.js";
import { AiHistory, AiMessage } from "../../db/aiModels.js";

/* ================= CONFIG ================= */

if (!process.env.GROQ_API_KEY) {
  throw new Error("Missing GROQ_API_KEY");
}

const MODEL = "qwen/qwen3-32b";
const MAX_HISTORY = 10;
const SAFE_LIMIT = 3500;

/* ================= GROQ CLIENT ================= */

const groq =
  global._groq ??
  new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

global._groq = groq;

/* ================= DB HELPERS ================= */

async function getHistory(chatId) {
  await connectDB();
  const doc = await AiHistory.findOne({ chatId });
  return doc ? doc.messages.map((m) => ({ role: m.role, content: m.content })) : [];
}

async function saveHistory(chatId, messages) {
  await connectDB();
  await AiHistory.findOneAndUpdate(
    { chatId },
    {
      $set: {
        messages: messages.slice(-MAX_HISTORY * 2),
        updatedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after' }
  );
}

async function clearHistory(chatId) {
  await connectDB();
  await AiHistory.findOneAndUpdate(
    { chatId },
    { $set: { messages: [], updatedAt: new Date() } },
    { upsert: true }
  );
}

async function trackAiMessage(chatId, messageId) {
  await connectDB();
  try {
    await AiMessage.create({ chatId, messageId });
  } catch (err) {
    // Duplicate key = sudah ada, abaikan
    if (err.code !== 11000) console.error("trackAiMessage error:", err);
  }
}

/* ================= SPLIT MESSAGE ================= */

function splitMessage(text, limit = SAFE_LIMIT) {
  const chunks = [];

  while (text.length > limit) {
    let splitIndex = text.lastIndexOf("\n\n", limit);
    if (splitIndex === -1) splitIndex = text.lastIndexOf("\n", limit);
    if (splitIndex === -1) splitIndex = text.lastIndexOf(" ", limit);
    if (splitIndex === -1) splitIndex = limit;

    chunks.push(text.slice(0, splitIndex).trim());
    text = text.slice(splitIndex).trim();
  }

  if (text.length) chunks.push(text);

  return chunks;
}

/* ================= MARKDOWN V2 CONVERSION ================= */

function escapeMarkdownV2(text) {
  return text.replace(/([_*[\]()~`>#+=|{}.!\\-])/g, "\\$1");
}

function convertToMarkdownV2(text) {
  const segments = [];

  const tokenRegex =
    /```[\s\S]*?```|`[^`]+`|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)|\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g;

  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(escapeMarkdownV2(text.slice(lastIndex, match.index)));
    }

    const full = match[0];

    if (full.startsWith("```")) {
      const inner = full.slice(3, full.length - 3).replace(/`/g, "\\`");
      segments.push("```" + inner + "```");
    } else if (full.startsWith("`")) {
      const inner = full.slice(1, full.length - 1).replace(/`/g, "\\`");
      segments.push("`" + inner + "`");
    } else if (match[1] !== undefined) {
      segments.push("*" + escapeMarkdownV2(match[1]) + "*");
    } else if (match[2] !== undefined) {
      segments.push("*" + escapeMarkdownV2(match[2]) + "*");
    } else if (match[3] !== undefined) {
      segments.push("_" + escapeMarkdownV2(match[3]) + "_");
    } else if (match[4] !== undefined) {
      segments.push("_" + escapeMarkdownV2(match[4]) + "_");
    } else if (match[5] !== undefined && match[6] !== undefined) {
      const linkText = escapeMarkdownV2(match[5]);
      const url = match[6].replace(/[)]/g, "\\)");
      segments.push(`[${linkText}](${url})`);
    } else {
      segments.push(escapeMarkdownV2(full));
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    segments.push(escapeMarkdownV2(text.slice(lastIndex)));
  }

  return segments.join("");
}

/* ================= SEND MESSAGE ================= */

async function sendMarkdownMessage(ctx, text) {
  const chunks = splitMessage(text);

  for (const chunk of chunks) {
    let converted;
    try {
      converted = convertToMarkdownV2(chunk);
    } catch {
      converted = null;
    }

    if (converted) {
      try {
        const sent = await ctx.api.sendMessage(ctx.chat.id, converted, {
          parse_mode: "MarkdownV2",
          disable_web_page_preview: true,
        });
        await trackAiMessage(ctx.chat.id, sent.message_id);
        continue;
      } catch (err) {
        console.error("MarkdownV2 SEND ERROR:", err.message);
        console.error("Converted text:\n", converted);
      }
    }

    // Fallback: plain text
    try {
      const sent = await ctx.api.sendMessage(ctx.chat.id, chunk, {
        disable_web_page_preview: true,
      });
      await trackAiMessage(ctx.chat.id, sent.message_id);
    } catch (err) {
      console.error("PLAIN SEND ERROR:", err.message);
    }
  }
}

/* ================= GROQ REQUEST ================= */

async function sendToGroq(messages) {
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.9,
      max_tokens: 2048,
    });

    let content =
      completion.choices?.[0]?.message?.content || "❌ No response received.";

    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    return content;
  } catch (err) {
    console.error("GROQ ERROR:", err);

    if (err.status === 429) return "⏳ Rate limit\\. Coba lagi sebentar\\.";
    if (err.status === 401) return "❌ API key salah\\.";

    return "❌ Gagal mengambil jawaban AI\\.";
  }
}

/* ========================= SYSTEM PROMPT ========================= */

const SYSTEM_PROMPT = `Kamu adalah CahayaMalamBot, AI assistant yang friendly dan helpful.

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
- Jangan gunakan heading (# ## ###)

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

/* ================= CORE AI HANDLER ================= */

async function handleAICore(ctx, inputText) {
  const chatId = ctx.chat.id;

  await ctx.replyWithChatAction("typing");

  const history = await getHistory(chatId);

  /* ================= REPLIED MESSAGE CONTEXT ================= */

  const repliedMsg = ctx.message?.reply_to_message;
  let repliedContext = "";

  if (repliedMsg) {
    const repliedText = repliedMsg.text || repliedMsg.caption || "";
    const repliedFrom = repliedMsg.from?.first_name || "Unknown";
    const isFromBot = repliedMsg.from?.is_bot ?? false;

    if (repliedText) {
      if (isFromBot) {
        repliedContext = `[User sedang membahas pesan bot ini]\n"""\n${repliedText}\n"""`;
      } else {
        repliedContext = `[User sedang membahas pesan dari ${repliedFrom}]\n"""\n${repliedText}\n"""`;
      }
    }
  }

  const fullUserInput = repliedContext
    ? `${repliedContext}\n\n${inputText}`
    : inputText;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: fullUserInput },
  ];

  const reply = await sendToGroq(messages);

  const updatedHistory = [
    ...history,
    { role: "user", content: fullUserInput },
    { role: "assistant", content: reply },
  ];

  await saveHistory(chatId, updatedHistory);
  await sendMarkdownMessage(ctx, reply);
}

/* ================= EXPORTED HELPER ================= */

// Dipanggil dari handler.js untuk cek apakah message_id tertentu adalah pesan AI
export async function isAiMessage(chatId, messageId) {
  await connectDB();
  const found = await AiMessage.exists({ chatId, messageId });
  return !!found;
}

/* ================= COMMAND ================= */

export default {
  name: "ai",
  description: "AI chat",

  // Dipanggil saat user kirim dokumen — untuk handle /ai import
  async handleDocument(ctx) {
    const doc = ctx.message?.document;
    if (!doc) return;

    // Hanya proses kalau nama file cocok dengan pola export kita
    const isAiExport =
      doc.file_name?.startsWith("ai-history-") && doc.file_name?.endsWith(".json");

    if (!isAiExport) return;

    const chatId = ctx.chat.id;

    try {
      // Download file dari Telegram
      const file = await ctx.api.getFile(doc.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error("Gagal download file");

      const raw = await res.text();
      const parsed = JSON.parse(raw);

      // Validasi struktur JSON
      if (
        !Array.isArray(parsed.messages) ||
        parsed.messages.some((m) => !m.role || !m.content)
      ) {
        return ctx.reply("❌ Format file tidak valid. Pastikan file dari /ai export.");
      }

      const messages = parsed.messages.filter((m) =>
        ["user", "assistant"].includes(m.role)
      );

      await saveHistory(chatId, messages);

      return ctx.reply(
        `✅ History berhasil di-import!

• ${messages.length} pesan dimuat
• Export dari: ${parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString("id-ID") : "unknown"}`
      );
    } catch (err) {
      console.error("IMPORT ERROR:", err);
      if (err instanceof SyntaxError) {
        return ctx.reply("❌ File JSON tidak valid atau korup.");
      }
      return ctx.reply("❌ Gagal import history.");
    }
  },

  // Dipanggil otomatis saat user reply pesan AI tanpa ketik /ai
  async handleReply(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text || text.startsWith("/")) return;

    try {
      await handleAICore(ctx, text);
    } catch (err) {
      console.error(err);
      ctx.reply("❌ Terjadi error.");
    }
  },

  async execute(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text) return;

    const chatId = ctx.chat.id;

    /* ================= RESET ================= */

    if (text === "/ai reset") {
      await clearHistory(chatId);
      return ctx.reply("✅ History dihapus.");
    }

    /* ================= EXPORT ================= */

    if (text === "/ai export") {
      const history = await getHistory(chatId);

      if (!history.length) {
        return ctx.reply("History kosong, belum ada yang bisa di-export.");
      }

      // Format JSON yang bisa langsung di-import ulang
      const exportData = {
        exportedAt: new Date().toISOString(),
        chatId,
        messageCount: history.length,
        messages: history,
      };

      const json = JSON.stringify(exportData, null, 2);
      const buffer = Buffer.from(json, "utf-8");
      const filename = `ai-history-${chatId}-${Date.now()}.json`;

      return ctx.replyWithDocument(new InputFile(buffer, filename), {
        caption: `📦 *Export History*\n\n• ${history.length} pesan\n• Kirim balik file ini dengan /ai import untuk restore`,
        parse_mode: "Markdown",
      });
    }

    /* ================= IMPORT ================= */

    if (text === "/ai import") {
      return ctx.reply(
        "Kirim file JSON hasil export sebagai dokumen. Bot akan otomatis mendeteksi dan import history-nya."
      );
    }

    /* ================= HISTORY (alias export) ================= */

    if (text === "/ai history") {
      // Redirect ke export supaya konsisten
      ctx.message.text = "/ai export";
      return this.execute(ctx);
    }

    /* ================= INPUT ================= */

    const inputText = text.replace(/^\/ai\s*/i, "").trim();

    if (!inputText) {
      return ctx.reply("Gunakan:\n/ai pertanyaan");
    }

    try {
      await handleAICore(ctx, inputText);
    } catch (err) {
      console.error(err);
      ctx.reply("❌ Terjadi error.");
    }
  },
};