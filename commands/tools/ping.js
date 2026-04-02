export default {
  name: "ping",
  async execute(ctx) {
    await ctx.reply("Pong!");
  },
};