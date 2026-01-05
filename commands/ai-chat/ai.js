const { MongoClient, ServerApiVersion } = require("mongodb");

/* =========================
   CONFIG
========================= */
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGO_DB || "ai_bot";
const collectionName = process.env.MONGO_COLLECTION || "ai_history";

// simulasi chatId (user / group)
const chatId = "123456";

/* =========================
   MONGO CLIENT
========================= */
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

/* =========================
   FUNCTIONS
========================= */
async function addMessage(collection, role, content) {
  return collection.insertOne({
    chatId,
    role, // "user" | "assistant"
    content,
    createdAt: new Date(),
  });
}

async function getHistory(collection, limit = 10) {
  return collection
    .find({ chatId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();
}

async function resetHistory(collection) {
  return collection.deleteMany({ chatId });
}

/* =========================
   MAIN TEST
========================= */
async function run() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    /* 1️⃣ Simpan pesan user */
    await addMessage(collection, "user", "Halo AI, apa itu MongoDB?");
    console.log("✅ User message saved");

    /* 2️⃣ Simpan balasan AI (dummy dulu) */
    await addMessage(
      collection,
      "assistant",
      "MongoDB adalah database NoSQL berbasis dokumen."
    );
    console.log("✅ AI reply saved");

    /* 3️⃣ Ambil history */
    const history = await getHistory(collection, 5);
    console.log("\n📜 Chat History:");
    history.forEach((h, i) => {
      console.log(
        `${i + 1}. [${h.role}] ${h.content} (${h.createdAt.toISOString()})`
      );
    });

    /* 4️⃣ Reset history (opsional, uncomment kalau mau test) */
    // await resetHistory(collection);
    // console.log("\n🗑️ History reset");

  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await client.close();
    console.log("\n🔒 MongoDB connection closed");
  }
}

run();
