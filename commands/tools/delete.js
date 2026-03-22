export default {
  name: "delete",
  aliases: ["d"],
  async execute(ctx) {
    // 1. Cek apakah pesan ini merupakan reply dari pesan lain
    if (!ctx.message?.reply_to_message) {
      return await ctx.reply("❌ Harap reply pesan yang ingin dihapus!");
    }

    const replyMessage = ctx.message.reply_to_message;

    // 2. Cek apakah yang di-reply adalah pesan dari bot itu sendiri
    // Ini penting agar bot tidak mencoba menghapus pesan user lain atau pesan dari bot lain
    if (!replyMessage.from?.is_bot) {
      return await ctx.reply("❌ Hanya bisa menghapus pesan dari bot ini!");
    }

    // 3. (Opsional) Validasi Keamanan
    // Pastikan hanya pengirim pesan asli atau admin yang bisa menghapus
    const isOwner = ctx.from.id === replyMessage.from.id; 
    // const isAdmin = await ctx.getAuthor(); // Jika ingin cek admin grup

    if (!isOwner) {
       // Uncomment baris bawah jika ingin строго melarang user lain menghapus
       // return await ctx.reply("❌ Anda tidak memiliki izin menghapus pesan ini!");
    }

    try {
      // 4. Hapus pesan yang di-reply
      await ctx.api.deleteMessage(ctx.chat.id, replyMessage.message_id);
      
      // 5. Hapus juga perintah /delete milik user (opsional, agar rapi)
      await ctx.deleteMessage(); 
      
    } catch (error) {
      console.error("Gagal menghapus pesan:", error);
      await ctx.reply("⚠️ Gagal menghapus pesan. Mungkin pesan sudah terlalu lama.");
    }
  },
};