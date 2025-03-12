const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

// Middleware untuk JSON
app.use(express.json());

// Fungsi membaca file JSON
const readJSONFile = (fileName) => {
  try {
    const filePath = path.join(__dirname, "data", fileName);
    if (!fs.existsSync(filePath)) {
      return { error: "File tidak ditemukan." };
    }
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return { error: "Terjadi kesalahan membaca file." };
  }
};

// 6 Endpoint untuk membaca data JSON
app.get("/api/data1", (req, res) => res.json(readJSONFile("data1.json")));
app.get("/api/data2", (req, res) => res.json(readJSONFile("data2.json")));
app.get("/api/data3", (req, res) => res.json(readJSONFile("data3.json")));
app.get("/api/data4", (req, res) => res.json(readJSONFile("data4.json")));
app.get("/api/data5", (req, res) => res.json(readJSONFile("data5.json")));
app.get("/api/data6", (req, res) => res.json(readJSONFile("data6.json")));

// Default route
app.get("/", (req, res) => res.send("API JSON Reader Berjalan di Vercel!"));

// Export untuk Vercel
module.exports = app;

