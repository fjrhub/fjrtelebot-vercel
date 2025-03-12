const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// Fungsi membaca file dengan berbagai format
const readFile = (fileName) => {
  try {
    const filePath = path.join(__dirname, "data", fileName);
    if (!fs.existsSync(filePath)) {
      return { error: "File tidak ditemukan." };
    }

    const ext = path.extname(fileName).toLowerCase();
    const data = fs.readFileSync(filePath, "utf-8");

    if (ext === ".json") {
      return JSON.parse(data); // Parse JSON
    } else if (ext === ".txt") {
      return { content: data }; // Kembalikan teks biasa
    } else if (ext === ".csv") {
      const rows = data.split("\n").map(row => row.split(","));
      return { csv: rows }; // Kembalikan CSV sebagai array
    } else if (ext === ".xml") {
      return { xml: data }; // Kembalikan XML sebagai string
    } else {
      return { error: "Format file tidak didukung." };
    }
  } catch (error) {
    return { error: "Terjadi kesalahan membaca file." };
  }
};

// Endpoint dinamis berdasarkan nama file
app.get("/api/:filename", (req, res) => {
  const fileName = req.params.filename;
  res.json(readFile(fileName));
});

// Route default
app.get("/", (req, res) => res.json({ message: "API File Reader Berjalan di Vercel!" }));

// Export untuk Vercel
module.exports = app;

