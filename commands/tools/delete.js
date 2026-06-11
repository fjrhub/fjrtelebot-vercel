export default {
  name: "delete",
  aliases: ["d"],

  async execute(ctx) {
    const replyMessage = ctx.message?.reply_to_message;

    if (!replyMessage) {
      return ctx.reply(
        "❌ Reply pesan yang ingin dihapus."
      );
    }

    if (!replyMessage.from?.is_bot) {
      return ctx.reply(
        "❌ Hanya pesan bot yang dapat dihapus."
      );
    }

    try {
      await ctx.api.deleteMessage(
        ctx.chat.id,
        replyMessage.message_id
      );

      // Hapus command pengguna (opsional)
      try {
        await ctx.deleteMessage();
      } catch {}

    } catch (error) {
      console.error("[DELETE_COMMAND]", error);

      return ctx.reply(
        "⚠️ Gagal menghapus pesan. Pesan mungkin sudah dihapus atau bot tidak memiliki izin."
      );
    }
  },
};
