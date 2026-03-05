import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // load env
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI in .env.local");
}

let isConnected = false;

// Panggil ini saat startup polling untuk buang semua update lama
// yang antri di Telegram selama bot mati
export async function dropPendingUpdates(bot) {
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log("✅ Pending updates cleared");
  } catch (err) {
    console.error("⚠️ Failed to drop pending updates:", err.message);
  }
}

export async function connectDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: "cahayamalam_bot",
    });

    isConnected = true;
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    throw err;
  }
}