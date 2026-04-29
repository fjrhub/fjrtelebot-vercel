import { InputFile } from "grammy";

export default {
  name: "img",
  async execute(ctx) {
    try {
      const text = ctx.message?.text?.trim() || "";
      const args = text.split(" ").slice(1);

      // jika hanya /img tanpa link
      if (!args.length) {
        return await ctx.reply(
          "⚠️ Gunakan format:\n/img https://link-gambar.com/image.png\n\nContoh link Discord CDN juga bisa."
        );
      }

      const url = args[0];

      // validasi URL
      try {
        new URL(url);
      } catch {
        return await ctx.reply("❌ Link tidak valid.");
      }

      // ambil gambar
      const res = await fetch(url);

      if (!res.ok) {
        return await ctx.reply("❌ Gagal mengambil gambar dari link tersebut.");
      }

      const bytes = new Uint8Array(await res.arrayBuffer());

      // kirim gambar tanpa caption
      await ctx.replyWithPhoto(
        new InputFile(bytes, "image.png")
      );

      // hapus pesan command user biar rapi
      await ctx.deleteMessage().catch(() => {});
    } catch (err) {
      console.error("IMG Command Error:", err);
      await ctx.reply("❌ Terjadi kesalahan.");
    }
  },
};