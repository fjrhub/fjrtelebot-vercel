const OPTIONS = {
  jenis: ["Pemasukan", "Pengeluaran"],

  kategori: {
    Pengeluaran: ["Konsumsi", "Transportasi", "Hiburan", "Utilitas", "Pendidikan", "Administrasi", "Belanja", "Investasi", "Hutang", "Keluarga", "Amal", "Penyesuaian", "Lainnya"],
    Pemasukan: ["Gaji", "Usaha", "Investasi", "Hadiah", "Refund", "Hutang", "Keluarga", "Donasi", "Penyesuaian", "Lainnya"],
  },

  subKategori: {
    Pengeluaran: {
      Konsumsi: ["Makan Berat", "Jajan", "Kopi", "Minuman"],
      Transportasi: ["Bensin", "Ojol", "Parkir", "Servis", "Darurat"],
      Hiburan: ["Game", "Streaming"],
      Utilitas: ["Internet", "Listrik", "Pulsa"],
      Pendidikan: ["Buku", "Fotokopi", "ATK", "Print", "Foto Dokumen", "Modul", "Iuran Sekolah"],
      Administrasi: ["SKCK", "KTP", "SIM", "STNK", "Paspor", "Materai", "Foto Dokumen", "Fotokopi", "Pajak", "BPJS", "Biaya Pemerintah"],
      Belanja: ["Online", "Offline", "Langganan"],
      Investasi: ["Crypto", "Saham", "Emas", "Reksa Dana"],
      Hutang: ["Bayar Hutang", "Cicilan", "Potongan Hutang"],
      Keluarga: ["Uang Bulanan Ortu", "Biaya Kesehatan Ortu", "Kebutuhan Harian Ortu", "Oleh-oleh", "Bantuan Keluarga Lain"],
      Amal: ["Sedekah", "Zakat", "Infaq", "Sumbangan", "Kotak Amal"],
      Penyesuaian: ["Penyesuaian Bank", "Biaya Admin Bank", "Koreksi Saldo", "Rounding"],
      Lainnya: ["Uang Kas", "Kewajiban", "Pengeluaran Rutin", "Pengeluaran Lain"],
    },
    Pemasukan: {
      Gaji: ["Gaji Bulanan", "Bonus", "THR"],
      Usaha: ["Penjualan", "Jasa", "Komisi"],
      Investasi: ["Crypto", "Saham", "Emas", "Dividen", "Bunga Bank"],
      Hadiah: ["Uang Saku", "Hadiah", "Donasi"],
      Refund: ["Refund Belanja", "Cashback"],
      Hutang: ["Pinjaman Ibu", "Pinjaman Teman", "Talangan", "Utang Baru"],
      Keluarga: ["Uang Saku dari Ortu", "Bantuan Darurat", "Hibah"],
      Donasi: ["Donasi Masuk", "Bantuan", "Crowdfunding"],
      Penyesuaian: ["Penyesuaian Bank", "Koreksi Bunga", "Bonus Saldo", "Rounding Positif"],
      Lainnya: ["Uang Saku", "Bantuan", "Pemasukan Lain"],
    },
  },

  akun: ["Wallet", "Dana", "Gopay", "Seabank", "Bank", "Binance", "Fjlsaldo", "Jago"],
  metode: ["Cash", "Transfer", "QRIS", "Debit", "Virtual Account"],
  mataUang: ["Rp", "USDT"],
};