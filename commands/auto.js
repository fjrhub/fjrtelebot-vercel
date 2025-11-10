const axios = require("axios");
import { createUrl } from "../utils/api";

// === LOCK GLOBAL UNTUK MENCEGAH DOUBEL EXECUTION ===
const processingUsers = new Set();

module.exports = {
  name: "auto",
  async execute(ctx) {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId) return;

    const text = ctx.message?.text?.trim();
    if (!text) return;

    // 🛑 Cegah dobel kirim / spam
    if (processingUsers.has(userId)) {
      await ctx.reply("⏳ Tunggu dulu, sedang memproses permintaan kamu sebelumnya...");
      return;
    }
    processingUsers.add(userId);

    try {
      const tiktokRegex = /^(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+$/i;
      const instagramRegex = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+\/?(?:\?[^ ]*)?$/i;
      const facebookRegex = /^(?:https?:\/\/)?(?:www\.|web\.)?facebook\.com\/(?:share\/(?:r|v|p)\/|reel\/|watch\?v=|permalink\.php\?story_fbid=|[^\/]+\/posts\/|video\.php\?v=)[^\s]+$/i;

      const isTikTok = tiktokRegex.test(text);
      const isInstagram = instagramRegex.test(text);
      const isFacebook = facebookRegex.test(text);
      if (!isTikTok && !isInstagram && !isFacebook) return;

      try {
        await ctx.api.deleteMessage(chatId, ctx.message.message_id);
      } catch {}

      const input = text;
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      const chunkArray = (arr, size) => {
        const res = [];
        for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
        return res;
      };
      const toNumberFormat = (n) => new Intl.NumberFormat("id-ID").format(n || 0);
      const formatNumber = (n) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : n.toString());

    // -------------------- HANDLERS --------------------

    // TikTok handler variations
    const tthandler1 = async (ctx, chatId, data) => {
      if (!data?.data || !data.data.download)
        throw new Error("Invalid TikTok API response structure.");

      const { download, metadata } = data.data;

      const videos = Array.isArray(download.video)
        ? download.video.filter(Boolean)
        : [];
      const photos = Array.isArray(download.photo)
        ? download.photo.filter(Boolean)
        : [];

      if (!videos.length && !photos.length)
        throw new Error("No downloadable media found from TikTok API.");

      // Ambil statistik
      const stats = metadata?.stats || {};
      const like = stats.likeCount || 0;
      const play = stats.playCount || 0;
      const comment = stats.commentCount || 0;
      const share = stats.shareCount || 0;

      // Format caption (pakai emoji + format singkat)
      const caption = `❤️ ${formatNumber(like)} ▶️ ${formatNumber(
        play
      )} 💬 ${formatNumber(comment)} ↗️ ${formatNumber(share)}`;

      // Jika ada video
      if (videos.length) {
        const firstVideo = videos[1];
        try {
          await ctx.api.sendVideo(chatId, firstVideo, { caption });
        } catch (e) {
          console.error("Gagal kirim video:", e.message);
          throw e; // ⬅️ tambahkan ini agar error dilempar keluar
        }
        return;
      }

      // Jika ada foto
      if (photos.length) {
        const groups = chunkArray(photos, 10);

        for (const grp of groups) {
          const mediaGroup = grp.map((url, i) => ({
            type: "photo",
            media: url,
            caption: i === 0 ? caption : undefined, // caption hanya di foto pertama
          }));

          try {
            await ctx.api.sendMediaGroup(chatId, mediaGroup);
          } catch (e) {
            if (
              e.error_code === 429 ||
              e.description?.includes("Too Many Requests")
            ) {
              console.warn("⚠️ Rate limited! Waiting 5 seconds...");
              await delay(5000); // tunggu 5 detik kalau rate limit
            } else {
              console.error("❌ Gagal kirim media group:", e.message);
            }
          }

          // Delay 1.5 detik antar batch kiriman
          await delay(1500);
        }
      }
    };

    const tthandler2 = async (ctx, chatId, data) => {
      if (!data || typeof data !== "object" || !data.metadata) {
        throw new Error("Invalid data format: metadata missing.");
      }

      const md = data.metadata;
      const statsOnly = [
        `Views: ${toNumberFormat(md.view)}`,
        `Comments: ${toNumberFormat(md.comment)}`,
        `Shares: ${toNumberFormat(md.share)}`,
        `Downloads: ${toNumberFormat(md.download)}`,
      ].join("\n");

      const caption = `${
        md.durasi && md.durasi > 0 ? `Duration: ${md.durasi}s\n` : ""
      }${statsOnly}`;

      // Jika ada image slide
      if (
        Array.isArray(data.media?.image_slide) &&
        data.media.image_slide.length > 0
      ) {
        const groups = chunkArray(data.media.image_slide, 10);

        for (const grp of groups) {
          const mediaGroup = grp.map((url, idx) => ({
            type: "photo",
            media: url,
            ...(idx === 0 ? { caption, parse_mode: "Markdown" } : {}),
          }));

          try {
            await ctx.api.sendMediaGroup(chatId, mediaGroup);
          } catch (err) {
            console.error(
              "⚠️ Failed to send media group:",
              err.description || err.message
            );
          }

          // Delay 1.5 detik antar batch kiriman foto
          await delay(1500);
        }
        return;
      }

      // Jika ada video
      if (data.media?.play && md.durasi > 0) {
        try {
          await ctx.api.sendVideo(chatId, data.media.play, {
            caption,
            parse_mode: "Markdown",
            supports_streaming: true,
          });
        } catch (err) {
          console.error(
            "⚠️ Failed to send video:",
            err.description || err.message
          );
        }
        return; // tanpa delay di bagian video
      }

      throw new Error("API 2 returned no valid downloadable content.");
    };

    const tthandler3 = async (ctx, chatId, data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Invalid API 3 data.");
      }

      const photos = Array.isArray(data.data)
        ? data.data.filter((item) => item.type === "photo")
        : [];
      const video = Array.isArray(data.data)
        ? data.data.find(
            (item) =>
              item.type === "nowatermark" || item.type === "nowatermark_hd"
          )
        : null;

      const stats = data.stats || {};
      const statsText = [
        `👁 Views: ${stats.views ?? "?"}`,
        `❤️ Likes: ${stats.likes ?? "?"}`,
        `💬 Comments: ${stats.comment ?? "?"}`,
        `🔁 Shares: ${stats.share ?? "?"}`,
        `⬇️ Downloads: ${stats.download ?? "?"}`,
      ].join("\n");

      const caption = `${statsText}`;

      // Jika foto
      if (photos.length > 0) {
        const groups = chunkArray(
          photos.map((p) => p.url),
          10
        );

        for (const grp of groups) {
          const mediaGroup = grp.map((url, idx) => ({
            type: "photo",
            media: url,
            ...(idx === 0 ? { caption, parse_mode: "Markdown" } : {}),
          }));

          await ctx.api.sendMediaGroup(chatId, mediaGroup);
          await delay(1500); // Delay kecil untuk Telegram rate limit
        }

        return;
      }

      // Jika video
      if (video?.url) {
        await ctx.api.sendVideo(chatId, video.url, {
          caption,
          parse_mode: "Markdown",
          supports_streaming: true,
        });
        return;
      }

      throw new Error("API 3 returned no valid downloadable content.");
    };

    // Facebook handlers
    const fbHandler1 = async (ctx, chatId, data) => {
      if (!data || !Array.isArray(data.data))
        throw new Error("Invalid FB API 1 format.");
      const hdMp4Video = data.data.find(
        (item) => item.format === "mp4" && item.resolution === "HD"
      );
      if (!hdMp4Video?.url) throw new Error("HD MP4 URL not found.");
      await ctx.api.sendVideo(chatId, hdMp4Video.url);
    };

    const fbHandler2 = async (ctx, chatId, data) => {
      if (!data) throw new Error("Invalid FB API 2 format.");
      const videoUrl = data.media?.[2] || data.media?.[0] || null;
      if (!videoUrl) throw new Error("No HD video URL found in API 2.");
      await ctx.api.sendVideo(chatId, videoUrl);
    };

    const fbHandler3 = async (ctx, chatId, data) => {
      if (!data?.result?.download?.hd)
        throw new Error("Tidak ada URL video HD dari API 3 (Vreden).");

      const videoUrl = data.result.download.hd;
      const durasion = data.result.durasi || "Video durasion";
      const thumb = data.result.thumbnail;

      // Kirim video dengan caption dan thumbnail (jika ada)
      await ctx.api.sendVideo(chatId, videoUrl, {
        caption: `Duration: ${durasion}s`,
        parse_mode: "Markdown",
        thumbnail: thumb,
      });
    };

    // Instagram handlers
    const igHandler1 = async (ctx, chatId, data) => {
      const results = Array.isArray(data)
        ? data
        : Array.isArray(data.data)
        ? data.data
        : [];

      if (!results.length) throw new Error("Invalid or empty API data format.");

      const urls = results.map((i) => i?.url).filter(Boolean);
      if (!urls.length) throw new Error("No valid media URLs found.");

      const video = urls.find((u) => u.includes(".mp4"));
      const photos = urls.filter((u) => !u.includes(".mp4"));

      try {
        if (video) {
          await ctx.api.sendVideo(chatId, video);
          return;
        }

        if (photos.length) {
          // kirim maksimal 10 foto agar tidak melebihi waktu eksekusi
          const maxSend = photos.slice(0, 10);
          await ctx.api.sendMediaGroup(
            chatId,
            maxSend.map((url) => ({ type: "photo", media: url }))
          );
          return;
        }

        throw new Error("No media content detected.");
      } catch (err) {
        console.error("❌ IG Handler 1 error:", err.message);
      }
    };

    const igHandler2 = async (ctx, chatId, data) => {
      // Cek validitas dasar
      if (!data || typeof data !== "object") {
        console.warn("⚠️ IG API 2 invalid root data:", data);
        return;
      }

      // Deteksi otomatis apakah formatnya pakai result atau tidak
      const result =
        data.result && typeof data.result === "object" ? data.result : data;

      // Ambil URL media
      const mediaUrls = Array.isArray(result.url)
        ? result.url.filter(Boolean)
        : typeof result.url === "string"
        ? [result.url]
        : [];

      if (!mediaUrls.length) {
        console.warn("⚠️ IG API 2 returned empty or invalid URLs:", result);
        return;
      }

      // Ambil properti lain
      const isVideo = Boolean(result.isVideo);
      const likes = result.like || 0;
      const comments = result.comment || 0;

      // Caption hanya emoji ❤️ 💬
      const caption = `❤️ ${toNumberFormat(likes)}   💬 ${toNumberFormat(
        comments
      )}`;

      try {
        if (isVideo) {
          // kirim video tunggal
          await ctx.api.sendVideo(chatId, mediaUrls[0], {
            caption,
            parse_mode: "Markdown",
            supports_streaming: true,
          });
          return;
        }

        // kirim foto (single / multiple)
        const groups = chunkArray(mediaUrls, 10);
        for (const grp of groups) {
          const mediaGroup = grp.map((url, idx) => ({
            type: "photo",
            media: url,
            ...(idx === 0 ? { caption, parse_mode: "Markdown" } : {}),
          }));

          await ctx.api.sendMediaGroup(chatId, mediaGroup);
          if (groups.length > 1) await delay(1500);
        }
      } catch (err) {
        console.error("❌ Send Error (IG Handler 2):", err.message);
      }
    };

    const igHandler3 = async (ctx, chatId, data) => {
      const mediaItems = Array.isArray(data?.result?.data)
        ? data.result.data
        : [];
      const stats = data?.result?.statistics || {};

      if (!mediaItems.length) {
        throw new Error("IG API 3 returned empty media array.");
      }

      const images = mediaItems
        .filter((i) => i.type === "image" && i.url)
        .map((i) => i.url);

      const videos = mediaItems
        .filter((i) => i.type === "video" && i.url)
        .map((i) => i.url);

      // 🔹 Format statistik (hanya yang ada nilainya)
      const statLines = [
        stats.like_count && stats.like_count !== "-"
          ? `❤️ ${stats.like_count}`
          : null,
        stats.comment_count && stats.comment_count !== "-"
          ? `💬 ${stats.comment_count}`
          : null,
        stats.play_count && stats.play_count !== "-"
          ? `▶️ ${stats.play_count}`
          : null,
        stats.share_count && stats.share_count !== "-"
          ? `🔁 ${stats.share_count}`
          : null,
        stats.save_count && stats.save_count !== "-"
          ? `💾 ${stats.save_count}`
          : null,
      ].filter(Boolean);

      const statCaption = statLines.length
        ? statLines.join(" · ")
        : "ℹ️ No statistics available.";

      // --- Jika video tersedia ---
      if (videos.length) {
        await ctx.api.sendVideo(chatId, videos[0], {
          supports_streaming: true,
          caption: statCaption,
        });
        return;
      }

      // --- Jika foto tersedia ---
      if (images.length) {
        const groups = chunkArray(images, 10);
        for (const grp of groups) {
          const mediaGroup = grp.map((u) => ({
            type: "photo",
            media: u,
            caption: statCaption, // caption hanya di foto pertama, opsional
          }));
          await ctx.api.sendMediaGroup(chatId, mediaGroup);
          await delay(1500); // jeda agar tidak spam API Telegram
        }
        return;
      }

      throw new Error("IG API 3 returned unsupported media.");
    };

      const enableStatus = {
        tiktok: { siputzx: true, archive: false, vreden: true },
        instagram: { siputzx: true, archive: false, vreden: false },
        facebook: { siputzx: true, archive: true, vreden: true },
      };

      const apis = [];
      
      if (isTikTok) {
        const active = enableStatus.tiktok;
        apis.push(
          active.siputzx && {
            url: createUrl(
              "siputzx",
              `/api/d/tiktok/v2?url=${encodeURIComponent(input)}`
            ),
            handler: tthandler1,
            label: "Siputzx - TikTok",
          },
          active.archive && {
            url: createUrl(
              "archive",
              `/api/download/tiktok?url=${encodeURIComponent(input)}`
            ),
            handler: tthandler2,
            label: "Archive - TikTok",
          },
          active.vreden && {
            url: createUrl(
              "vreden",
              `/api/v1/download/tiktok?url=${encodeURIComponent(input)}`
            ),
            handler: tthandler3,
            label: "Vreden - TikTok",
          }
        );
      }

      if (isInstagram) {
        const active = enableStatus.instagram;
        apis.push(
          active.siputzx && {
            url: createUrl(
              "siputzx",
              `/api/d/igdl?url=${encodeURIComponent(input)}`
            ),
            handler: igHandler1,
            label: "Siputzx - Instagram",
          },
          active.archive && {
            url: createUrl(
              "archive",
              `/api/download/instagram?url=${encodeURIComponent(input)}`
            ),
            handler: igHandler2,
            label: "Archive - Instagram",
          },
          active.vreden && {
            url: createUrl(
              "vreden",
              `/api/v1/download/instagram?url=${encodeURIComponent(input)}`
            ),
            handler: igHandler3,
            label: "Vreden - Instagram",
          }
        );
      }

      if (isFacebook) {
        const active = enableStatus.facebook;
        apis.push(
          active.siputzx && {
            url: createUrl(
              "siputzx",
              `/api/d/facebook?url=${encodeURIComponent(input)}`
            ),
            handler: fbHandler1,
            label: "Siputzx - Facebook",
          },
          active.archive && {
            url: createUrl(
              "archive",
              `/api/download/facebook?url=${encodeURIComponent(input)}`
            ),
            handler: fbHandler2,
            label: "Archive - Facebook",
          },
          active.vreden && {
            url: createUrl(
              "vreden",
              `/api/v1/download/facebook?url=${encodeURIComponent(input)}`
            ),
            handler: fbHandler3,
            label: "Vreden - Facebook",
          }
        );
      }

      const validApis = apis.filter(Boolean);
      if (validApis.length === 0) return;

      let sent = false;
      const controllers = validApis.map(() => new AbortController());
      const requests = validApis.map((api, i) => {
        const controller = controllers[i];
        const start = Date.now();
        return axios
          .get(api.url, { signal: controller.signal, timeout: 8000 })
          .then((res) => {
            const duration = ((Date.now() - start) / 1000).toFixed(2);
            console.log(`✅ ${api.label} fetched in ${duration}s`);
            return { api, res: res.data, duration };
          })
          .catch((err) => {
            const duration = ((Date.now() - start) / 1000).toFixed(2);
            console.warn(`⚠️ ${api.label} failed after ${duration}s: ${err.message}`);
            return null;
          });
      });

      const results = await Promise.allSettled(requests);
      for (const r of results) {
        if (!r.value || sent) continue;
        const { api, res, duration } = r.value;
        const data = res.result || res.data;
        if (res.status || res.result) {
          sent = true;
          console.log(`🚀 Using fastest API: ${api.label} (${duration}s)`);
          controllers.forEach((ctrl) => ctrl.abort());
          await api.handler(ctx, chatId, data);
          return;
        }
      }

      if (!sent) await ctx.reply("⚠️ Semua API gagal merespons atau tidak valid.");
    } catch (err) {
      console.error("❌ Fatal Error:", err);
      await ctx.reply("⚠️ Terjadi kesalahan saat memproses permintaan.");
    } finally {
      processingUsers.delete(userId);
    }
  },
};
