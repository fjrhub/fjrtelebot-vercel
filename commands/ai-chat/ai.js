import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { InputFile } from "grammy";
import Groq from "groq-sdk";

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

/* ================= MEMORY ================= */

global.aiHistory = global.aiHistory || {};

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

/**
 * Escape semua karakter spesial MarkdownV2 yang TIDAK dipakai untuk formatting.
 * Karakter yang perlu di-escape: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
function escapeMarkdownV2(text) {
  // Escape semua karakter special kecuali yang kita handle sendiri
  return text.replace(/([_*[\]()~`>#+=|{}.!\\-])/g, "\\$1");
}

/**
 * Convert markdown biasa dari AI response ke format MarkdownV2 Telegram.
 *
 * Urutan penting:
 * 1. Lindungi blok code (```) dan inline code (`) dari escaping
 * 2. Lindungi bold (**text**) dan italic (*text* / _text_)
 * 3. Escape sisa teks biasa
 */
function convertToMarkdownV2(text) {
  const segments = [];
  let remaining = text;

  // Regex untuk menangkap semua elemen markdown secara berurutan
  const tokenRegex =
    /```[\s\S]*?```|`[^`]+`|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)|\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g;

  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    // Escape plain text sebelum match ini
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      segments.push(escapeMarkdownV2(plain));
    }

    const full = match[0];

    if (full.startsWith("```")) {
      // Code block - escape backtick content
      const inner = full.slice(3, full.length - 3);
      // Escape hanya karakter ` di dalam
      const safeInner = inner.replace(/`/g, "\\`");
      segments.push("```" + safeInner + "```");
    } else if (full.startsWith("`")) {
      // Inline code
      const inner = full.slice(1, full.length - 1);
      const safeInner = inner.replace(/`/g, "\\`");
      segments.push("`" + safeInner + "`");
    } else if (match[1] !== undefined) {
      // **bold**
      segments.push("*" + escapeMarkdownV2(match[1]) + "*");
    } else if (match[2] !== undefined) {
      // __bold__
      segments.push("*" + escapeMarkdownV2(match[2]) + "*");
    } else if (match[3] !== undefined) {
      // *italic*
      segments.push("_" + escapeMarkdownV2(match[3]) + "_");
    } else if (match[4] !== undefined) {
      // _italic_
      segments.push("_" + escapeMarkdownV2(match[4]) + "_");
    } else if (match[5] !== undefined && match[6] !== undefined) {
      // [link text](url)
      const linkText = escapeMarkdownV2(match[5]);
      const url = match[6].replace(/[)]/g, "\\)");
      segments.push(`[${linkText}](${url})`);
    } else {
      // Fallback: escape seluruh match
      segments.push(escapeMarkdownV2(full));
    }

    lastIndex = match.index + full.length;
  }

  // Sisa teks setelah match terakhir
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

    // Coba kirim dengan MarkdownV2
    if (converted) {
      try {
        await ctx.api.sendMessage(ctx.chat.id, converted, {
          parse_mode: "MarkdownV2",
          disable_web_page_preview: true,
        });
        continue;
      } catch (err) {
        console.error("MarkdownV2 SEND ERROR:", err.message);
        // Log converted text untuk debug
        console.error("Converted text:\n", converted);
      }
    }

    // Fallback: kirim plain text tanpa formatting
    try {
      await ctx.api.sendMessage(ctx.chat.id, chunk, {
        disable_web_page_preview: true,
      });
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

    // Hapus tag <think>...</think> dari model reasoning
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

/* ================= COMMAND ================= */

export default {
  name: "ai",
  description: "AI chat",

  async execute(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text) return;

    const chatId = ctx.chat.id;

    if (!global.aiHistory[chatId]) {
      global.aiHistory[chatId] = [];
    }

    /* ================= RESET ================= */

    if (text === "/ai reset") {
      global.aiHistory[chatId] = [];
      return ctx.reply("✅ History dihapus.");
    }

    /* ================= HISTORY ================= */

    if (text === "/ai history") {
      const history = global.aiHistory[chatId];

      if (!history.length) {
        return ctx.reply("History kosong.");
      }

      const content = history
        .map((msg) => `${msg.role}\n${msg.content}`)
        .join("\n\n");

      const buffer = Buffer.from(content);

      return ctx.replyWithDocument(new InputFile(buffer, "ai-history.txt"));
    }

    /* ================= INPUT ================= */

    const inputText = text.replace(/^\/ai\s*/i, "").trim();

    if (!inputText) {
      return ctx.reply("Gunakan:\n/ai pertanyaan");
    }

    try {
      await ctx.replyWithChatAction("typing");

      const history = global.aiHistory[chatId];

      /* ================= REPLIED MESSAGE CONTEXT ================= */

      // Cek apakah user sedang reply ke pesan lain
      const repliedMsg = ctx.message?.reply_to_message;
      let repliedContext = "";

      if (repliedMsg) {
        const repliedText = repliedMsg.text || repliedMsg.caption || "";
        const repliedFrom = repliedMsg.from?.first_name || "Unknown";
        const isFromBot = repliedMsg.from?.is_bot ?? false;

        if (repliedText) {
          if (isFromBot) {
            // Reply ke pesan bot — jadikan sebagai konteks assistant
            repliedContext = `[User sedang membahas pesan bot ini]\n"""\n${repliedText}\n"""`;
          } else {
            // Reply ke pesan user lain atau diri sendiri
            repliedContext = `[User sedang membahas pesan dari ${repliedFrom}]\n"""\n${repliedText}\n"""`;
          }
        }
      }

      // Gabungkan konteks reply (jika ada) dengan pertanyaan user
      const fullUserInput = repliedContext
        ? `${repliedContext}\n\n${inputText}`
        : inputText;

      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: fullUserInput },
      ];

      let reply = await sendToGroq(messages);

      // Simpan ke history — pakai fullUserInput supaya konteks reply ikut tersimpan
      history.push({ role: "user", content: fullUserInput });
      history.push({ role: "assistant", content: reply });

      while (history.length > MAX_HISTORY * 2) {
        history.shift();
      }

      await sendMarkdownMessage(ctx, reply);
    } catch (err) {
      console.error(err);
      ctx.reply("❌ Terjadi error.");
    }
  },
};