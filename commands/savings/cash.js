export default {
  name: "cash",
  async execute(ctx) {
    try {
      const text = ctx.message.text.replace("/cash", "").trim();

      if (!text) {
        return ctx.reply(
`Masukkan jumlah lembar uang untuk setiap pecahan:
Format:
/cash 4 2 1 5 7 1 1 2`
        );
      }

      const numbers = text
        .split(/[\s,]+/)
        .map(v => Number(v))
        .filter(v => !isNaN(v));

      if (numbers.length !== 8) {
        return ctx.reply(
"Harus memasukkan 8 angka sesuai urutan pecahan."
        );
      }

      const pecahan = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];

      let total = 0;
      for (let i = 0; i < pecahan.length; i++) {
        total += pecahan[i] * numbers[i];
      }

      const hasil =
`Masukkan jumlah lembar uang untuk setiap pecahan:
100.000: ${numbers[0]}
50.000: ${numbers[1]}
20.000: ${numbers[2]}
10.000: ${numbers[3]}
5.000: ${numbers[4]}
2.000: ${numbers[5]}
1.000: ${numbers[6]}
500: ${numbers[7]}
Total uang Anda: Rp ${total.toLocaleString("en-US")}.`;

      await ctx.reply(hasil);
    } catch (err) {
      await ctx.reply("Terjadi error saat menghitung uang.");
    }
  },
};
