export default {
  name: "format",
  async execute(ctx) {
    const text = ctx.message?.text || "";

    // Ambil data
    const token = text.match(/(\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4})/)?.[1] || "-";
    const orderId = text.match(/Nomor pesanan:(\d+)/)?.[1] || "-";
    const customerId = text.match(/Nomor pelanggan:(\d+)/)?.[1] || "-";
    const customerName = text.match(/Nama pelanggan:(.+)/)?.[1]?.trim() || "-";
    const product = text.match(/Produk:(.+)/)?.[1]?.trim() || "-";
    const date = text.match(/Tanggal transaksi:(.+)/)?.[1]?.trim() || "-";

    const formatLine = (label, value) => {
      return label.padEnd(18, " ") + ": " + value;
    };

    // ======================
    // 1. TOKEN (pesan 1)
    // ======================
    await ctx.reply(token);

    // ======================
    // 2. DETAIL (pesan 2)
    // ======================
    const detailMsg = `
${formatLine("No Pesanan", orderId)}
${formatLine("No Pelanggan", customerId)}
${formatLine("Nama Pelanggan", customerName)}
${formatLine("Produk", product)}
${formatLine("Tanggal", date)}
    `.trim();

    await ctx.reply("```\n" + detailMsg + "\n```", {
      parse_mode: "Markdown",
    });
  },
};