const OWNER_ID = Number(process.env.OWNER_ID);

if (Number.isNaN(OWNER_ID)) {
  throw new Error("OWNER_ID di .env bukan angka atau tidak terbaca");
}

export const isOwner = (ctx) => {
  const id =
    ctx.from?.id ||
    ctx.callbackQuery?.from?.id ||
    ctx.chat?.id;

  console.log("VALIDATE ID:", id, "OWNER:", OWNER_ID);

  return Number(id) === OWNER_ID;
};
export default {
  name: "ping",
  async execute(ctx) {
    if (!isOwner(ctx)) return;
    await ctx.reply("🤖 pong!");
  },
};
