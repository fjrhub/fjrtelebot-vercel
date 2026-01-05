import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // load env

import { MongoClient, ServerApiVersion } from "mongodb";

/* =========================
   ENV
========================= */
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGO_DB || "ai_bot";
const collectionName = process.env.MONGO_COLLECTION || "ai_history";

if (!uri) throw new Error("Missing MONGODB_URI");

/* =========================
   SINGLETON CLIENT
========================= */
const client =
  global._mongoClient ??
  new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

global._mongoClient = client;

/* =========================
   MAIN TEST
========================= */
async function run() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    if (!client.topology?.isConnected()) {
      await client.connect();
    }

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // simulasi chatId (nanti di bot = userId / group:userId)
    const chatId = "test_user_123";

    /* 1️⃣ Insert pesan user */
    await collection.insertOne({
      chatId,
      role: "user",
      content: "Halo AI, jelaskan MongoDB secara singkat",
      createdAt: new Date(),
    });

    /* 2️⃣ Insert balasan AI (dummy) */
    await collection.insertOne({
      chatId,
      role: "assistant",
      content: "MongoDB adalah database NoSQL berbasis dokumen JSON-like.",
      createdAt: new Date(),
    });

    console.log("✅ Messages inserted");

    /* 3️⃣ Ambil history */
    const history = await collection
      .find({ chatId })
      .sort({ createdAt: 1 })
      .limit(10)
      .toArray();

    console.log("\n📜 Chat History:");
    history.forEach((h, i) => {
      console.log(`${i + 1}. [${h.role}] ${h.content}`);
    });

    /* 4️⃣ Reset history (optional) */
    // await collection.deleteMany({ chatId });
    // console.log("\n🗑️ History reset");

  } catch (err) {
    console.error("❌ Mongo Test Error:", err);
  } finally {
    // sengaja TIDAK close, mirip bot singleton
    console.log("\nℹ️ MongoDB client kept alive (singleton)");
  }
}

run();

export default client;
