export default {
  name: "delete",
  aliases: ["d"],

  async execute(ctx) {
    const replyMessage = ctx.message?.reply_to_message;

    if (!replyMessage) {
      return ctx.reply(
        "❌ Please reply to the message you want to delete."
      );
    }

    if (!replyMessage.from?.is_bot) {
      return ctx.reply(
        "❌ Only bot messages can be deleted."
      );
    }

    try {
      await ctx.api.deleteMessage(
        ctx.chat.id,
        replyMessage.message_id
      );

      // Delete the user's command message (optional)
      try {
        await ctx.deleteMessage();
      } catch {
        // silently ignore if we can't delete the command
      }

    } catch (error) {
      console.error("[DELETE_COMMAND]", error);

      return ctx.reply(
        "⚠️ Failed to delete the message. It might already be deleted or the bot lacks permissions."
      );
    }
  },
};