import startCommand from "../commands/tools/start.js";
import pingCommand from "../commands/tools/ping.js";
import waifuCommand from "../commands/entertainment/waifu.js";
import autoCommand from "../commands/downloader/auto.js";
import pricelistCommand from "../commands/savings/pricelist.js";
import balanceCommand from "../commands/savings/balance.js";
import addbalanceCommand from "../commands/savings/addbalance.js";
import transactionsCommand from "../commands/savings/transactions.js";
// import other commands here

const commands = new Map([
  [startCommand.name, startCommand],
  [pingCommand.name, pingCommand],
  [waifuCommand.name, waifuCommand],
  [autoCommand.name, autoCommand],
  [pricelistCommand.name, pricelistCommand],
  [balanceCommand.name, balanceCommand],
  [addbalanceCommand.name, addbalanceCommand],
  [transactionsCommand.name, transactionsCommand],
  // ...add other commands
]);

export async function handleMessage(ctx) {
  const text = ctx.message?.text;
  const fromBot = ctx.from?.is_bot;

  // Ignore messages without text or from bots themselves
  if (!text || fromBot) return;

  // If the command message (/start, /auto, etc.)
  if (text.startsWith("/")) {
    return handleCommand(ctx);
  }

  // If the message contains another URL + text, ignore auto.js
  if (/\bhttps?:\/\/\S+/.test(text) && text.trim().split(/\s+/).length > 1) {
    console.log("⚠️ Mixed URL + text messages are skipped to avoid duplicates");
    return;
  }

  // text biasa (non-command)
  for (const cmd of commands.values()) {
    if (typeof cmd.handleText === "function") {
      await cmd.handleText(ctx);
    }
  }

  // Run auto.js only once
  const autoHandler = commands.get("auto");
  if (autoHandler) {
    try {
      await autoHandler.execute(ctx);
    } catch (err) {
      console.error("Auto handler error:", err);
    }
  }
}

export async function handleCommand(ctx) {
  const text = ctx.message.text;
  const args = text.slice(1).trim().split(/ +/);
  let commandName = args.shift().toLowerCase();

  const at = commandName.indexOf("@");
  if (at !== -1) commandName = commandName.slice(0, at);

  /* ===== HANDLE /cancel ===== */
  if (commandName === "cancel") {
    const addbalance = commands.get("addbalance");
    if (addbalance?.cancel) {
      return addbalance.cancel(ctx);
    }
    return ctx.reply("❌ Tidak ada proses yang bisa dibatalkan.");
  }

  const command = commands.get(commandName);
  if (!command) return;

  try {
    await command.execute(ctx, args);
  } catch (err) {
    console.error(`Error in command "${commandName}"`, err);
    await ctx.reply("⚠️ Error executing command.");
  }
}


export async function handleCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const [prefix] = data.split(":");
  const command = commands.get(prefix);

  if (!command || typeof command.handleCallback !== "function") {
    return ctx.answerCallbackQuery({ text: "❌ Unknown action." });
  }

  try {
    await command.handleCallback(ctx);
  } catch (err) {
    console.error(`Error in callback "${prefix}"`, err);
    ctx.answerCallbackQuery({ text: "⚠️ Action failed." });
  }
}
