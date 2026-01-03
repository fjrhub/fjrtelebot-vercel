import startCommand from "../commands/tools/start.js";
import pingCommand from "../commands/tools/ping.js";
import waifupicsCommand from "../commands/entertainment/waifupics.js";
import waifuimCommand from "../commands/entertainment/waifuim.js";
import autoCommand from "../commands/downloader/auto.js";
import pricelistCommand from "../commands/savings/pricelist.js";
import balanceCommand from "../commands/savings/balance.js";
import addbalanceCommand from "../commands/savings/addbalance.js";
import transactionsCommand from "../commands/savings/transactions.js";
import addpriceCommand from "../commands/savings/addprice.js";
import setupaccountCommand from "../commands/savings/setupaccount.js";
// import editbalanceCommand from "../commands/savings/editbalance.js";
import transferCommand from "../commands/savings/transfer.js";
import sellpulsaCommand from "../commands/savings/sellpulsa.js";
// import other commands here

const commands = new Map([
  [startCommand.name, startCommand],
  [pingCommand.name, pingCommand],
  [waifupicsCommand.name, waifupicsCommand],
  [waifuimCommand.name, waifuimCommand],
  [autoCommand.name, autoCommand],
  [pricelistCommand.name, pricelistCommand],
  [balanceCommand.name, balanceCommand],
  [addbalanceCommand.name, addbalanceCommand],
  [transactionsCommand.name, transactionsCommand],
  [addpriceCommand.name, addpriceCommand],
  [setupaccountCommand.name, setupaccountCommand],
  // [editbalanceCommand.name, editbalanceCommand],
  [transferCommand.name, transferCommand],
  [sellpulsaCommand.name, sellpulsaCommand],
  // ...add other commands
]);

export async function handleMessage(ctx) {
  const text = ctx.message?.text;
  const fromBot = ctx.from?.is_bot;

  // Ignore messages without text or messages sent by bots
  if (!text || fromBot) return;

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
