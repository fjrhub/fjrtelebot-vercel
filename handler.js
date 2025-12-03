import fs from "fs";
import path from "path";
import { checkAnswer } from "./utils/games.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = new Map();

// 🔁 Load semua commands (.js)
async function loadCommands(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      await loadCommands(fullPath);
    } else if (file.endsWith(".js")) {
      // ESM → pakai dynamic import
      const command = await import(fullPath);

      if (command.name && typeof command.execute === "function") {
        commands.set(command.name, command);

        // Alias
        if (Array.isArray(command.aliases)) {
          for (const alias of command.aliases) {
            commands.set(alias, command);
          }
        }
      }
    }
  }
}

// ⬇ Load command sekali saja
if (!global._commandsLoaded) {
  await loadCommands(path.join(__dirname, "commands"));
  global._commandsLoaded = true;
}

// 🔧 Handle pesan biasa
export async function handleMessage(ctx) {
  if (!ctx.message?.text) return;

  const text = ctx.message.text;

  // Jika command
  if (text.startsWith("/")) {
    return handleCommand(ctx);
  }

  // Auto-handler
  const autoHandler = commands.get("auto");
  if (autoHandler) {
    try {
      await autoHandler.execute(ctx);
    } catch (err) {
      console.error("❌ Auto error:", err.message);
    }
  }

  // Game engine
  await checkAnswer(ctx);
}

// 🔨 Handle command
export async function handleCommand(ctx) {
  const text = ctx.message.text;
  if (!text.startsWith("/")) return;

  const args = text.slice(1).trim().split(/ +/);
  let commandName = args.shift().toLowerCase();

  // Hapus @BotName
  const atIndex = commandName.indexOf("@");
  if (atIndex !== -1) {
    commandName = commandName.slice(0, atIndex);
  }

  const command = commands.get(commandName);
  if (!command) return;

  if (command.strict && args.length > 0) {
    return;
  }

  try {
    await command.execute(ctx, args);
  } catch (err) {
    console.error(`Error in "${commandName}"`, err);
    ctx.reply("⚠️ Terjadi kesalahan saat memproses perintah.");
  }
}

// 🎯 Handle callback
export async function handleCallback(ctx) {
  const query = ctx.callbackQuery;
  if (!query?.data) return;

  const [prefix] = query.data.split(":");

  const command = commands.get(prefix);
  if (!command || typeof command.handleCallback !== "function") {
    return ctx.answerCallbackQuery({ text: "❌ Aksi tidak dikenali." });
  }

  try {
    if (!query.message) {
      return ctx.answerCallbackQuery({ text: "⚠️ Tidak bisa memproses inline message." });
    }

    await command.handleCallback(ctx, query);
  } catch (err) {
    console.error(`Error callback "${prefix}"`, err);
    ctx.answerCallbackQuery({ text: "⚠️ Error memproses aksi." });
  }
}
