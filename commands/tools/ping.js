export default {
  name: "ping",
  async execute(ctx) {
    if (ctx.from?.id !== Number(process.env.OWNER_ID)) return;
    await ctx.reply("Pong!");
  },
};
