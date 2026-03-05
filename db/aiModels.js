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

/* ================= EXPORT ================= */
// Pakai pola ini agar tidak error "Cannot overwrite model once compiled"
// yang sering terjadi di ESM / hot-reload

const AiHistory =
  mongoose.models["AiHistory"] ?? model("AiHistory", aiHistorySchema);

const AiMessage =
  mongoose.models["AiMessage"] ?? model("AiMessage", aiMessageSchema);

export { AiHistory, AiMessage };