export default {
  name: "ping",
  async execute(ctx) {
    const OWNER_ID = Number(process.env.OWNER_ID);

    // validasi env
    if (Number.isNaN(OWNER_ID)) return;

    // validasi owner
    if (ctx.from?.id !== OWNER_ID) return;

    await ctx.reply(String(ctx.from.id));
  },
};
