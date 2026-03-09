import mongoose, { Schema, model } from "mongoose";

/* ================= AI CHAT HISTORY ================= */

const aiHistorySchema = new Schema(
  {
    chatId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    messages: [
      {
        role: {
          type: String,
          enum: ["user", "assistant"],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

aiHistorySchema.pre("save", function () {
  this.updatedAt = new Date();
});

/* ================= AI MESSAGE IDS ================= */

const aiMessageSchema = new Schema(
  {
    chatId: {
      type: Number,
      required: true,
      index: true,
    },
    messageId: {
      type: Number,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      // Auto-delete setelah 7 hari
      expires: 60 * 60 * 24 * 7,
    },
  },
  { timestamps: false }
);

aiMessageSchema.index({ chatId: 1, messageId: 1 }, { unique: true });

/* ================= AI PROCESSING LOCK ================= */
// Distributed lock per chatId — mencegah spam request diproses paralel.
// Dokumen dibuat saat mulai proses, dihapus saat selesai/gagal.
// TTL 60 detik sebagai safety net kalau bot crash di tengah proses.

const aiLockSchema = new Schema(
  {
    chatId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 60, // auto-release lock setelah 60 detik kalau bot crash
    },
  },
  { timestamps: false }
);

/* ================= GENERIC PROCESSING LOCK ================= */
// Lock generic yang bisa dipakai semua command, bukan hanya AI.
// Key format: "scope:userId" — contoh: "auto:123456", "ai:123456"
// TTL 30 detik sebagai safety net.

const processingLockSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 30,
    },
  },
  { timestamps: false }
);

/* ================= EXPORT ================= */

const AiHistory =
  mongoose.models["AiHistory"] ?? model("AiHistory", aiHistorySchema);

const AiMessage =
  mongoose.models["AiMessage"] ?? model("AiMessage", aiMessageSchema);

const AiLock =
  mongoose.models["AiLock"] ?? model("AiLock", aiLockSchema);

const ProcessingLock =
  mongoose.models["ProcessingLock"] ?? model("ProcessingLock", processingLockSchema);

export { AiHistory, AiMessage, AiLock, ProcessingLock };