import startCommand from "../commands/start.js";
import pingCommand from "../commands/ping.js";
import waifuCommand from "../commands/waifu.js"
// import command lainnya di sini

const commands = new Map([
  [startCommand.name, startCommand],
  [pingCommand.name, pingCommand],
  [waifuCommand.name, waifuCommand],
  // ...tambahkan command lainnya
]);

export async function handleMessage(ctx) {
  const text = ctx.message?.text;
  if (!text) return;

  if (text.startsWith("/")) return handleCommand(ctx);

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

  const command = commands.get(commandName);
  if (!command) return;

  try {
    await command.execute(ctx, args); // <--- tambahkan await di sini
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
