import startCommand from "../commands/tools/start.js";
import pingCommand from "../commands/tools/ping.js";
import waifuCommand from "../commands/entertainment/waifu.js";
import waifupicsCommand from "../commands/entertainment/waifupics.js";
import waifuimCommand from "../commands/entertainment/waifuim.js";
import autoCommand from "../commands/downloader/auto.js";
import pricelistCommand from "../commands/savings/pricelist.js";
import balanceCommand from "../commands/savings/balance.js";
import addbalanceCommand from "../commands/savings/addbalance.js";
import transactionsCommand from "../commands/savings/transactions.js";
import transactions_pdfCommand from "../commands/savings/transactions_pdf.js";
import transactions_txtCommand from "../commands/savings/transactions_txt.js";
import addpriceCommand from "../commands/savings/addprice.js";
import setupaccountCommand from "../commands/savings/setupaccount.js";
import aiCommand, { isAiMessage } from "../commands/ai-chat/ai.js";
import transferCommand from "../commands/savings/transfer.js";
import sellpulsaCommand from "../commands/savings/sellpulsa.js";
import profitCommand from "../commands/savings/profit.js";
import checkCommand from "../commands/savings/check.js";
import cashCommand from "../commands/savings/cash.js";
import sholatCommand from "../commands/tools/sholat.js";
import deleteCommand from "../commands/tools/delete.js";
// import other commands here


const commands = new Map([
  [startCommand.name, startCommand],
  [pingCommand.name, pingCommand],
  [waifuCommand.name, waifuCommand],
  [waifupicsCommand.name, waifupicsCommand],
  [waifuimCommand.name, waifuimCommand],
  [autoCommand.name, autoCommand],
  [pricelistCommand.name, pricelistCommand],
  [balanceCommand.name, balanceCommand],
  [addbalanceCommand.name, addbalanceCommand],
  [transactionsCommand.name, transactionsCommand],
  [addpriceCommand.name, addpriceCommand],
  [setupaccountCommand.name, setupaccountCommand],
  [aiCommand.name, aiCommand],
  [transferCommand.name, transferCommand],
  [sellpulsaCommand.name, sellpulsaCommand],
  [profitCommand.name, profitCommand],
  [checkCommand.name, checkCommand],
  [transactions_pdfCommand.name, transactions_pdfCommand],
  [transactions_txtCommand.name, transactions_txtCommand],
  [cashCommand.name, cashCommand],
  [sholatCommand.name, sholatCommand],
  [deleteCommand.name, deleteCommand],
  // ...add other commands
]);

export async function handleMessage(ctx) {
  const fromBot = ctx.from?.is_bot;
  if (fromBot) return;

  // Handle document messages (e.g. /ai import)
  if (ctx.message?.document) {
    await handleDocument(ctx);
    return;
  }

  const text = ctx.message?.text;

  // Ignore messages without text
  if (!text) return;

  /* ================= AUTO REPLY KE PESAN AI ================= */
  // Hanya proses kalau user reply ke pesan yang MEMANG dikirim oleh AI (bukan downloader/savings/dll)
  const repliedMsg = ctx.message?.reply_to_message;

  if (repliedMsg?.from?.is_bot && !text.startsWith("/")) {
    const replyIsAi = await isAiMessage(ctx.chat.id, repliedMsg.message_id);
    if (replyIsAi) {
      try {
        await aiCommand.handleReply(ctx);
      } catch (err) {
        console.error("Auto AI reply error:", err);
      }
      return;
    }
  }

  // Handle command messages (/start, /auto, etc.)
  if (text.startsWith("/")) {
    return handleCommand(ctx);
  }

  // Ignore messages containing both URL and text to prevent auto handler duplication
  if (/\bhttps?:\/\/\S+/.test(text) && text.trim().split(/\s+/).length > 1) {
    console.log("⚠️ Skipping mixed URL and text message to avoid duplicates");
    return;
  }

  // Handle normal text (non-command)
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
      console.error("Auto handler execution failed:", err);
    }
  }
}

export async function handleCommand(ctx) {
  const text = ctx.message.text;
  const args = text.slice(1).trim().split(/ +/);
  let commandName = args.shift().toLowerCase();

  const atIndex = commandName.indexOf("@");
  if (atIndex !== -1) {
    commandName = commandName.slice(0, atIndex);
  }

  /* ===== HANDLE /cancel ===== */
  if (commandName === "cancel") {
    const addbalance = commands.get("addbalance");
    if (addbalance?.cancel) {
      return addbalance.cancel(ctx);
    }
    return ctx.reply("❌ There is no active process to cancel.");
  }

  const command = commands.get(commandName);
  if (!command) return;

  try {
    await command.execute(ctx, args);
  } catch (err) {
    console.error(`Error executing command "${commandName}"`, err);
    await ctx.reply("⚠️ An error occurred while executing the command.");
  }
}

export async function handleDocument(ctx) {
  const fromBot = ctx.from?.is_bot;
  if (fromBot) return;

  // Cek semua command yang punya handleDocument
  for (const cmd of commands.values()) {
    if (typeof cmd.handleDocument === "function") {
      await cmd.handleDocument(ctx);
    }
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
    console.error(`Error handling callback "${prefix}"`, err);
    ctx.answerCallbackQuery({ text: "⚠️ Action execution failed." });
  }
}