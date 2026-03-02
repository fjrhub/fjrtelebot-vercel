import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { InputFile } from "grammy";
import Groq from "groq-sdk";

/* ========================= CONFIG ========================= */
if (!process.env.GROQ_API_KEY) {
    throw new Error("Missing GROQ_API_KEY");
}

/* ========================= GROQ CLIENT ========================= */
const groq = global._groq ?? new Groq({
    apiKey: process.env.GROQ_API_KEY,
});
global._groq = groq;

/* ========================= MEMORY HISTORY ========================= */
global.aiHistory = global.aiHistory || {};

// Maksimal history yang disimpan per chat
const MAX_HISTORY = 10;

// Telegram message limit
const TELEGRAM_LIMIT = 4096;

/* ========================= SMART MESSAGE SPLIT ========================= */
/**
 * Split message jadi multiple chunks tanpa potong di tengah kata
 * @param {string} text - Text yang mau di-split
 * @param {number} limit - Max karakter per chunk (default: 4096 untuk Telegram)
 * @returns {string[]} - Array of chunks
 */
function splitMessage(text, limit = TELEGRAM_LIMIT) {
    const chunks = [];
    
    while (text.length > limit) {
        // Cari last newline sebelum limit
        let splitIndex = text.lastIndexOf('\n', limit);
        
        // Kalau gak ada newline, cari last space
        if (splitIndex === -1) {
            splitIndex = text.lastIndexOf(' ', limit);
        }
        
        // Kalau gak ada space juga, potong di limit (fallback)
        if (splitIndex === -1) {
            splitIndex = limit;
        }
        
        chunks.push(text.slice(0, splitIndex));
        text = text.slice(splitIndex + 1); // +1 untuk skip newline/space
    }
    
    // Push sisa text
    if (text.length > 0) {
        chunks.push(text);
    }
    
    return chunks;
}

/* ========================= SEND MESSAGE WITH MARKDOWN ========================= */
/**
 * Kirim message dengan Markdown support + auto split kalau panjang
 * @param {Context} ctx - Grammy context
 * @param {string} text - Text yang mau dikirim
 */
async function sendMarkdownMessage(ctx, text) {
    const chunks = splitMessage(text);
    
    for (let i = 0; i < chunks.length; i++) {
        try {
            await ctx.api.sendMessage(ctx.chat.id, chunks[i], {
                parse_mode: "Markdown",
                disable_web_page_preview: true,
            });
            
            // Delay dikit biar gak hit rate limit (kecuali chunk terakhir)
            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (err) {
            console.error("SEND MESSAGE ERROR:", err);
            
            // Fallback ke plain text kalau Markdown fail
            if (err.description?.includes("Markdown")) {
                await ctx.api.sendMessage(ctx.chat.id, chunks[i], {
                    parse_mode: undefined,
                    disable_web_page_preview: true,
                });
            }
        }
    }
}

/* ========================= GROQ HANDLER ========================= */
async function sendToGroq(messages) {
    try {
        const completion = await groq.chat.completions.create({
            model: "moonshotai/kimi-k2-instruct-0905",
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

/* ========================= COMMAND ========================= */
export default {
    name: "ai",
    description: "AI chat dengan Markdown support",
    
    async execute(ctx) {
        const text = ctx.message?.text?.trim();
        if (!text) return;
        
        const chatId = ctx.chat.id;
        
        // Init history untuk chat ini
        if (!global.aiHistory[chatId]) {
            global.aiHistory[chatId] = [];
        }
        
        /* ========================= /ai history ========================= */
        if (text === "/ai history") {
            const history = global.aiHistory[chatId];
            
            if (!history.length) {
                return ctx.reply("History kosong.");
            }
            
            const content = history
                .map((msg) => `*${msg.role}*:\n${msg.content}`)
                .join("\n\n");
            
            const buffer = Buffer.from(content, "utf-8");
            return ctx.replyWithDocument(new InputFile(buffer, "ai-history.txt"));
        }
        
        /* ========================= /ai reset ========================= */
        if (text === "/ai reset") {
            global.aiHistory[chatId] = [];
            return ctx.reply("✅ History chat sudah di-reset.");
        }
        
        /* ========================= /ai help ========================= */
        if (text === "/ai help") {
            const helpText = `
*🤖 AI Bot Commands*

/ai <pertanyaan> - Chat dengan AI
/ai reply <pertanyaan> - Reply chat + pertanyaan
/ai history - Download history chat
/ai reset - Reset history chat
/ai help - Tampilkan bantuan ini

*Format Markdown yang support:*
**Bold**, *Italic*, \`Code\`, [Link](url)
            `.trim();
            
            return sendMarkdownMessage(ctx, helpText);
        }
        
        /* ========================= PROCESS INPUT ========================= */
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
            
            // Add user message to history
            history.push({ role: "user", content: prompt });
            
            // Batasi history
            if (history.length > MAX_HISTORY) {
                history.shift();
            }
            
            // Get response from Groq
            const reply = await sendToGroq(history);
            
            // Add assistant response to history
            history.push({ role: "assistant", content: reply });
            
            if (history.length > MAX_HISTORY) {
                history.shift();
            }
            
            // Send dengan Markdown + auto split
            await sendMarkdownMessage(ctx, reply);
            
        } catch (err) {
            console.error("AI COMMAND ERROR:", err);
            ctx.reply("❌ Error saat menjalankan AI.");
        }
    },
};
