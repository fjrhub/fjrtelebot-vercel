export default {
  name: "cash",
  async execute(ctx) {
    try {
      const args = ctx.message.text.split(" ").slice(1).map(Number);

      if (args.length !== 8 || args.some(isNaN)) {
        return ctx.reply(
          "Format salah.\nContoh:\n/uang 1 2 0 3 0 0 5 10\n\nUrutan:\n100000 50000 20000 10000 5000 2000 1000 500"
        );
      }

      const pecahan = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];

      let total = 0;
      for (let i = 0; i < pecahan.length; i++) {
        total += pecahan[i] * args[i];
      }

      const formatRupiah = total.toLocaleString("id-ID");

      await ctx.reply(`Total uang Anda: Rp ${formatRupiah}`);
    } catch (err) {
      await ctx.reply("Terjadi error saat menghitung uang.");
    }
  },
};
