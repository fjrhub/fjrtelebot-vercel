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
import aiCommand from "../commands/ai-chat/ai.js";
import transferCommand from "../commands/savings/transfer.js";
import sellpulsaCommand from "../commands/savings/sellpulsa.js";
import profitCommand from "../commands/savings/profit.js";

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
  [aiCommand.name, aiCommand],
  [transferCommand.name, transferCommand],
  [sellpulsaCommand.name, sellpulsaCommand],
  [profitCommand.name, profitCommand],
]);

/* =========================
   MESSAGE HANDLER
========================= */
export async function handleMessage(ctx) {
  const text = ctx.message?.text;
  if (!text || ctx.from?.is_bot) return;

  if (text.startsWith("/")) {
    const args = text.slice(1).trim().split(/ +/);
    let cmd = args.shift().toLowerCase();
    if (cmd.includes("@")) cmd = cmd.split("@")[0];

    if (cmd === "cancel") {
      const addbalance = commands.get("addbalance");
      return addbalance?.cancel
        ? addbalance.cancel(ctx)
        : ctx.reply("❌ Tidak ada proses aktif.");
    }

    const command = commands.get(cmd);
    if (command) {
      try {
        await command.execute(ctx, args);
      } catch (e) {
        console.error(e);
        await ctx.reply("⚠️ Terjadi kesalahan.");
      }
    }
    return;
  }

  for (const cmd of commands.values()) {
    if (typeof cmd.handleText === "function") {
      await cmd.handleText(ctx);
    }
  }

  const autoHandler = commands.get("auto");
  if (autoHandler) {
    try {
      await autoHandler.execute(ctx);
    } catch {}
  }
}

/* =========================
   CALLBACK HANDLER (PENTING)
========================= */
export async function handleCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  // JAWAB CEPAT (HANYA SEKALI)
  await ctx.answerCallbackQuery().catch(() => {});

  const [prefix] = data.split(":");
  const command = commands.get(prefix);
  if (!command || typeof command.handleCallback !== "function") return;

  try {
    await command.handleCallback(ctx);
  } catch (e) {
    console.error("Callback error:", e);
  }
}
