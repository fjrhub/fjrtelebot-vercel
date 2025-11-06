const axios = require("axios");
import { createUrl } from "../utils/api";

module.exports = {
  name: "auto",
  async execute(ctx) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const text = ctx.message?.text?.trim();
    if (!text) return;

    const tiktokRegex =
      /^(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+$/i;
    const instagramRegex =
      /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+\/?(?:\?[^ ]*)?$/i;
    const facebookRegex =
      /^(?:https?:\/\/)?(?:www\.|web\.)?facebook\.com\/(?:share\/(?:r|v|p)\/|reel\/|watch\?v=|permalink\.php\?story_fbid=|[^\/]+\/posts\/|video\.php\?v=)[^\s]+$/i;

    const isTikTok = tiktokRegex.test(text);
    const isInstagram = instagramRegex.test(text);
    const isFacebook = facebookRegex.test(text);
    if (!isTikTok && !isInstagram && !isFacebook) return;

    try {
      await ctx.api.deleteMessage(chatId, ctx.message.message_id);
    } catch (err) {
      console.warn("Could not delete original message:", err?.message);
    }

    const input = text;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const toNumberFormat = (n) =>
      n === undefined || n === null
        ? "0"
        : n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const chunkArray = (arr, size) => {
      if (!Array.isArray(arr)) return [];
      const result = [];
      for (let i = 0; i < arr.length; i += size)
        result.push(arr.slice(i, i + size));
      return result;
    };
    const formatNumber = (num) => {
      if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
      if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
      return num.toString();
    };

    // ---------- HANDLERS ----------
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

      const stats = metadata?.stats || {};
      const caption = `❤️ ${formatNumber(
        stats.likeCount || 0
      )} ▶️ ${formatNumber(stats.playCount || 0)} 💬 ${formatNumber(
        stats.commentCount || 0
      )} ↗️ ${formatNumber(stats.shareCount || 0)}`;

      if (videos.length) {
        await ctx.api.sendVideo(chatId, videos[1] || videos[0], { caption });
        return;
      }
      if (photos.length) {
        const groups = chunkArray(photos, 10);
        for (const grp of groups) {
          const mediaGroup = grp.map((url, i) => ({
            type: "photo",
            media: url,
            caption: i === 0 ? caption : undefined,
          }));
          await ctx.api.sendMediaGroup(chatId, mediaGroup);
          await delay(1500);
        }
      }
    };

    const tthandler2 = async (ctx, chatId, data) => {
      if (!data || typeof data !== "object" || !data.metadata)
        throw new Error("Invalid data format: metadata missing.");
      const md = data.metadata;
      const caption = `${
        md.durasi && md.durasi > 0 ? `Duration: ${md.durasi}s\n` : ""
      }Views: ${toNumberFormat(md.view)}\nComments: ${toNumberFormat(
        md.comment
      )}\nShares: ${toNumberFormat(md.share)}\nDownloads: ${toNumberFormat(
        md.download
      )}`;

      if (
        Array.isArray(data.media?.image_slide) &&
        data.media.image_slide.length > 0
      ) {
        const groups = chunkArray(data.media.image_slide, 10);
        for (const grp of groups) {
          const mediaGroup = grp.map((url, i) => ({
            type: "photo",
            media: url,
            caption: i === 0 ? caption : undefined,
          }));
          await ctx.api.sendMediaGroup(chatId, mediaGroup);
          await delay(1500);
        }
        return;
      }

      if (data.media?.play && md.durasi > 0) {
        await ctx.api.sendVideo(chatId, data.media.play, {
          caption,
          supports_streaming: true,
        });
        return;
      }
      throw new Error("API 2 returned no valid downloadable content.");
    };

    const tthandler3 = async (ctx, chatId, data) => {
      const photos = Array.isArray(data.data)
        ? data.data.filter((i) => i.type === "photo")
        : [];
      const video = Array.isArray(data.data)
        ? data.data.find(
            (i) => i.type === "nowatermark" || i.type === "nowatermark_hd"
          )
        : null;
      const stats = data.stats || {};
      const caption = `👁 ${stats.views ?? "?"} ❤️ ${stats.likes ?? "?"} 💬 ${
        stats.comment ?? "?"
      } 🔁 ${stats.share ?? "?"}`;
      if (photos.length > 0) {
        const groups = chunkArray(
          photos.map((p) => p.url),
          10
        );
        for (const grp of groups) {
          const mediaGroup = grp.map((url, idx) => ({
            type: "photo",
            media: url,
            caption: idx === 0 ? caption : undefined,
          }));
          await ctx.api.sendMediaGroup(chatId, mediaGroup);
          await delay(1500);
        }
        return;
      }
      if (video?.url) {
        await ctx.api.sendVideo(chatId, video.url, {
          caption,
          supports_streaming: true,
        });
        return;
      }
      throw new Error("API 3 returned no valid downloadable content.");
    };

    const fbHandler1 = async (ctx, chatId, data) => {
      const hd = data.data?.find(
        (i) => i.format === "mp4" && i.resolution === "HD"
      );
      if (!hd?.url) throw new Error("HD MP4 not found.");
      await ctx.api.sendVideo(chatId, hd.url);
    };
    const fbHandler2 = async (ctx, chatId, data) => {
      const videoUrl = data.media?.[2] || data.media?.[0];
      if (!videoUrl) throw new Error("No HD video URL found.");
      await ctx.api.sendVideo(chatId, videoUrl);
    };
    const fbHandler3 = async (ctx, chatId, data) => {
      const videoUrl = data.result?.download?.hd;
      if (!videoUrl) throw new Error("No HD URL from API 3.");
      await ctx.api.sendVideo(chatId, videoUrl, {
        caption: `Duration: ${data.result.durasi || "?"}s`,
      });
    };

    const igHandler1 = async (ctx, chatId, data) => {
      const results = data.data;
      if (!Array.isArray(results) || !results.length) return;

      const urls = results.map((i) => i?.url).filter(Boolean);
      if (!urls.length) return;

      const video = urls.find((u) => u.includes(".mp4"));
      const photos = urls.filter((u) => !u.includes(".mp4"));

      const formatNumber = (num) =>
        typeof num === "number" ? num.toLocaleString("id-ID") : "0";
      const caption = `❤️ ${formatNumber(data.like)}\n💬 ${formatNumber(
        data.comment
      )}`;

      if (video) {
        await ctx.api.sendVideo(chatId, video, {
          caption,
          supports_streaming: true,
        });
        return;
      }

      if (photos.length) {
        const groups = chunkArray(photos, 10);
        for (const grp of groups) {
          const mediaGroup = grp.map((u, i) => ({
            type: "photo",
            media: u,
            caption: i === 0 ? caption : undefined,
          }));
          await ctx.api.sendMediaGroup(chatId, mediaGroup);
          await delay(1500);
        }
      }
    };

    // ================================
    // Instagram Handler 2 (Archive)
    // ================================
    async function igHandler2(ctx, chatId, payload) {
      try {
        if (!payload || typeof payload !== "object") {
          console.warn("⚠️ [igHandler2] Payload kosong atau bukan object.");
          return ctx.reply("⚠️ Gagal membaca data dari API Instagram Archive.");
        }

        // Ambil URL
        const urls = Array.isArray(payload.url)
          ? payload.url
          : typeof payload.url === "string"
          ? [payload.url]
          : [];

        const validUrls = urls.filter(
          (u) => typeof u === "string" && u.startsWith("http")
        );
        if (validUrls.length === 0) {
          console.warn("⚠️ [igHandler2] Tidak ada URL valid.");
          return ctx.reply(
            "⚠️ Tidak ada media yang ditemukan dari Instagram Archive."
          );
        }

        // Caption hanya like & comment
        const caption = `❤️ ${payload.like || 0}\n💬 ${payload.comment || 0}`;

        if (payload.isVideo) {
          // Video hanya 1 URL
          await ctx.api.sendVideo(chatId, validUrls[0], {
            caption,
            supports_streaming: true,
          });
        } else {
          // Foto
          if (validUrls.length === 1) {
            await ctx.api.sendPhoto(chatId, validUrls[0], { caption });
          } else {
            // Bagi per 10 foto untuk sendMediaGroup
            const chunkArray = (arr, size) => {
              const chunks = [];
              for (let i = 0; i < arr.length; i += size)
                chunks.push(arr.slice(i, i + size));
              return chunks;
            };
            const groups = chunkArray(validUrls, 10);

            for (const grp of groups) {
              const mediaGroup = grp.map((url, idx) => ({
                type: "photo",
                media: url,
                caption: idx === 0 ? caption : undefined, // caption hanya di media pertama
              }));
              await ctx.api.sendMediaGroup(chatId, mediaGroup);
              await new Promise((r) => setTimeout(r, 1500));
            }
          }
        }
      } catch (err) {
        await ctx.reply("⚠️ Terjadi kesalahan saat mengirim media Instagram.");
      }
    }

    const igHandler3 = async (ctx, chatId, data) => {
      console.log("📥 [IG Handler 3] Raw data:", JSON.stringify(data, null, 2));

      const media = data?.result?.data || [];
      const stats = data?.result?.statistics || {};

      console.log("📊 [IG Handler 3] Stats:", stats);
      console.log("📦 [IG Handler 3] Media count:", media.length);

      if (!Array.isArray(media) || !media.length)
        throw new Error("Invalid IG API 3 media data.");

      const images = media.filter((i) => i.type === "image").map((i) => i.url);
      const videos = media.filter((i) => i.type === "video").map((i) => i.url);

      console.log("🎞️ [IG Handler 3] Videos:", videos);
      console.log("🖼️ [IG Handler 3] Images:", images);

      const caption = [
        stats.like_count ? `❤️ ${stats.like_count}` : null,
        stats.comment_count ? `💬 ${stats.comment_count}` : null,
        stats.play_count ? `▶️ ${stats.play_count}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      if (videos.length) {
        console.log("📤 Sending video:", videos[0]);
        await ctx.api.sendVideo(chatId, videos[0], {
          caption,
          supports_streaming: true,
        });
        return;
      }

      if (images.length) {
        console.log("📤 Sending photos...");
        const groups = chunkArray(images, 10);
        for (const grp of groups) {
          await ctx.api.sendMediaGroup(
            chatId,
            grp.map((u, i) => ({
              type: "photo",
              media: u,
              caption: i === 0 ? caption : undefined,
            }))
          );
          await delay(1500);
        }
        return;
      }

      throw new Error("No downloadable media found in IG API 3.");
    };

    // ---------- MAIN FLOW DENGAN ABORT ----------
    try {
      const apis = [];

      // ✅ Konfigurasi toggle untuk tiap API
      const apiToggle = {
        tiktok: {
          siputzx: true,
          archive: true,
          vreden: true,
        },
        instagram: {
          siputzx: true,
          archive: false,
          vreden: false,
        },
        facebook: {
          siputzx: true,
          archive: true,
          vreden: true,
        },
      };

      // ================================
      // TikTok
      // ================================
      if (isTikTok) {
        if (apiToggle.tiktok.siputzx)
          apis.push({
            url: createUrl(
              "siputzx",
              `/api/d/tiktok/v2?url=${encodeURIComponent(input)}`
            ),
            handler: tthandler1,
            label: "Siputzx - TikTok",
          });

        if (apiToggle.tiktok.archive)
          apis.push({
            url: createUrl(
              "archive",
              `/api/download/tiktok?url=${encodeURIComponent(input)}`
            ),
            handler: tthandler2,
            label: "Archive - TikTok",
          });

        if (apiToggle.tiktok.vreden)
          apis.push({
            url: createUrl(
              "vreden",
              `/api/v1/download/tiktok?url=${encodeURIComponent(input)}`
            ),
            handler: tthandler3,
            label: "Vreden - TikTok",
          });
      }

      // ================================
      // Instagram
      // ================================
      if (isInstagram) {
        if (apiToggle.instagram.siputzx)
          apis.push({
            url: createUrl(
              "siputzx",
              `/api/d/igdl?url=${encodeURIComponent(input)}`
            ),
            handler: igHandler1,
            label: "Siputzx - Instagram",
          });

        if (apiToggle.instagram.archive)
          apis.push({
            url: createUrl(
              "archive",
              `/api/download/instagram?url=${encodeURIComponent(input)}`
            ),
            handler: igHandler2,
            label: "Archive - Instagram",
          });

        if (apiToggle.instagram.vreden)
          apis.push({
            url: createUrl(
              "vreden",
              `/api/v1/download/instagram?url=${encodeURIComponent(input)}`
            ),
            handler: igHandler3,
            label: "Vreden - Instagram",
          });
      }

      // ================================
      // Facebook
      // ================================
      if (isFacebook) {
        if (apiToggle.facebook.siputzx)
          apis.push({
            url: createUrl(
              "siputzx",
              `/api/d/facebook?url=${encodeURIComponent(input)}`
            ),
            handler: fbHandler1,
            label: "Siputzx - Facebook",
          });

        if (apiToggle.facebook.archive)
          apis.push({
            url: createUrl(
              "archive",
              `/api/download/facebook?url=${encodeURIComponent(input)}`
            ),
            handler: fbHandler2,
            label: "Archive - Facebook",
          });

        if (apiToggle.facebook.vreden)
          apis.push({
            url: createUrl(
              "vreden",
              `/api/v1/download/facebook?url=${encodeURIComponent(input)}`
            ),
            handler: fbHandler3,
            label: "Vreden - Facebook",
          });
      }

      // ================================
      // Eksekusi API
      // ================================
      if (apis.length === 0) {
        console.log("🚫 Semua API dinonaktifkan untuk platform ini.");
        return;
      }

      const controllers = apis.map(() => new AbortController());
      let finished = false;

      const requests = apis.map((api, idx) =>
        (async () => {
          const start = Date.now();
          try {
            const res = await axios.get(api.url, {
              signal: controllers[idx].signal,
              timeout: 8000,
            });

            if (finished) return;
            finished = true;

            const data = res.data;
            if (!data || !data.status)
              throw new Error(`Invalid response from ${api.label}`);

            // ✅ Extract payload safely
            let payload = {};
            if (data?.result && typeof data.result === "object") {
              payload = data.result;
            } else if (data?.data && typeof data.data === "object") {
              payload = data.data;
            } else {
              payload = data;
            }

            console.log(`🔍 [${api.label}] Data mentah dari API:`, data);
            console.log(
              `📦 [${api.label}] Payload final dikirim ke handler:`,
              payload
            );

            await api.handler(ctx, chatId, payload);

            controllers.forEach((c, i) => i !== idx && c.abort());

            const duration = ((Date.now() - start) / 1000).toFixed(2);
            console.log(`✅ ${api.label} sukses (${duration}s)`);
            return api.label;
          } catch (err) {
            if (err.name === "CanceledError" || err.name === "AbortError")
              return;
            throw err;
          }
        })()
      );

      const result = await Promise.any(requests);
      console.log(`🎯 API tercepat: ${result || "unknown"}`);
      return;
    } catch (err) {
      console.error("❌ Semua API gagal:", err.message);
      await ctx.reply("⚠️ Gagal memproses link dari semua sumber API.");
    }
  },
};
