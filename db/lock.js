// db/lock.js
// Generic distributed lock helper menggunakan MongoDB.
// Dipakai semua command untuk mencegah double execution di Vercel serverless.
//
// Usage:
//   import { withLock } from "../../db/lock.js";
//   await withLock("auto", userId, ctx, async () => { ... });

import { connectDB } from "./db.js";
import { ProcessingLock } from "./aiModels.js";

async function acquireLock(key) {
  await connectDB();
  try {
    await ProcessingLock.create({ key });
    return true;
  } catch (err) {
    if (err.code === 11000) return false; // sudah ada lock
    throw err;
  }
}

async function releaseLock(key) {
  await connectDB();
  await ProcessingLock.deleteOne({ key });
}

/**
 * Jalankan fn() dengan lock MongoDB.
 * Kalau lock tidak bisa didapat (sedang diproses), kirim pesan ke user dan stop.
 *
 * @param {string} scope   - Nama command, contoh: "auto", "ai"
 * @param {number} userId  - ID user Telegram
 * @param {object} ctx     - grammY context (untuk reply kalau locked)
 * @param {Function} fn    - Async function yang akan dijalankan
 * @param {string} [busyMsg] - Pesan custom kalau sedang diproses
 */
export async function withLock(scope, userId, ctx, fn, busyMsg) {
  const key = `${scope}:${userId}`;
  const locked = await acquireLock(key);

  if (!locked) {
    await ctx.reply(busyMsg ?? "⏳ Please wait, your previous request is still being processed.");
    return;
  }

  try {
    await fn();
  } finally {
    await releaseLock(key);
  }
}