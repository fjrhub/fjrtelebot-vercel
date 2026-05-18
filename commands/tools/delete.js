export default {
  name: "delete",
  aliases: ["d"],

  async execute(ctx) {
    // 1. Check if the message is replying to another message
    if (!ctx.message?.reply_to_message) {
      return await ctx.reply("❌ Please reply to the message you want to delete!");
    }

    const replyMessage = ctx.message.reply_to_message;

    // 2. Ensure the replied message is from a bot
    // Prevents deleting other users' messages or messages from different bots
    if (!replyMessage.from?.is_bot) {
      return await ctx.reply("❌ You can only delete messages sent by this bot!");
    }

    // 3. (Optional) Security validation
    // Allow only the original sender or admins to delete
    const isOwner = ctx.from.id === replyMessage.from.id;
    // const isAdmin = await ctx.getAuthor(); // Use this if you want admin checking

    if (!isOwner) {
      // Uncomment the line below to strictly prevent other users from deleting
      // return await ctx.reply("❌ You do not have permission to delete this message!");
    }

    try {
      // 4. Delete the replied message
      await ctx.api.deleteMessage(
        ctx.chat.id,
        replyMessage.message_id
      );

      // 5. Delete the user's /delete command message as well (optional)
      await ctx.deleteMessage();

    } catch (error) {
      console.error("Failed to delete message:", error);

      await ctx.reply(
        "⚠️ Failed to delete the message. It may be too old or already deleted."
      );
    }
  },
};