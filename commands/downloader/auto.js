import axios from "axios";
import { createUrl } from "../../utils/api.js";

// === GLOBAL LOCK TO PREVENT DOUBLE EXECUTION ===
const processingUsers = new Set();

export default {
  name: "auto",
  async execute(ctx) {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId) return;

    const input = ctx.message?.text?.trim();
    if (!input) return;

    // === GLOBAL LOCK TO PREVENT DOUBLE EXECUTION ===
    if (processingUsers.has(userId)) {
      await ctx.reply(
        "⏳ Please wait, we are processing your previous request..."
      );
      return;
    }
    processingUsers.add(userId);

    try {
      const tiktokRegex =
        /^(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+$/i;
      const instagramRegex =
        /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+\/?(?:\?[^ ]*)?$/i;
      const facebookRegex =
        /^(?:https?:\/\/)?(?:www\.|web\.)?facebook\.com\/(?:share\/(?:r|v|p)\/|reel\/|watch\?v=|permalink\.php\?story_fbid=|[^\/]+\/posts\/|video\.php\?v=)[^\s]+$/i;

      const isTikTok = tiktokRegex.test(input);
      const isInstagram = instagramRegex.test(input);
      const isFacebook = facebookRegex.test(input);
      if (!isTikTok && !isInstagram && !isFacebook) return;

      try {
        await ctx.api.deleteMessage(chatId, ctx.message.message_id);
      } catch {}

      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      const chunkArray = (arr, size) => {
        const res = [];
        for (let i = 0; i < arr.length; i += size)
          res.push(arr.slice(i, i + size));
        return res;
      };

      const toNumberFormat = (n) =>
        new Intl.NumberFormat("id-ID").format(n || 0);
      const formatNumber = (n) =>
        n >= 1_000_000
          ? (n / 1_000_000).toFixed(1) + "M"
          : n >= 1_000
          ? (n / 1_000).toFixed(1) + "K"
          : n.toString();

      // -------------------- HANDLERS --------------------

      // TikTok handler variations
      const tthandler1 = async (ctx, chatId, data) => {
        try {
          const payload = data?.data ? data.data : data;
          if (!payload || !payload.download)
            throw new Error("Invalid TikTok API response structure.");

          const { download } = payload;
          const videos = Array.isArray(download.video)
            ? download.video.filter(Boolean)
            : [];
          const photos = Array.isArray(download.photo)
            ? download.photo.filter(Boolean)
            : [];

          if (!videos.length && !photos.length)
            throw new Error("No downloadable media found from TikTok API.");

          if (videos.length) {
            const firstVideo = videos[0];
            await ctx.api.sendVideo(chatId, firstVideo);
            return;
          }

          if (photos.length) {
            const groups = chunkArray(photos, 10);
            for (const grp of groups) {
              const mediaGroup = grp.map((url) => ({
                type: "photo",
                media: url,
              }));

              try {
                await ctx.api.sendMediaGroup(chatId, mediaGroup);
              } catch (e) {
                if (
                  e.error_code === 429 ||
                  e.description?.includes("Too Many Requests")
                ) {
                  await delay(5000);
                }
              }

              await delay(1500);
            }
          }
        } catch (err) {
          throw new Error("Handler 1 failed to process media.");
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

            // 1.5 second delay between photo submission batches
            await delay(1500);
          }
          return;
        }

        // If there is a video
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
          return; // without delay in the video section
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

        // If the photo
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
            await delay(1500); // Small delay for Telegram rate limit
          }

          return;
        }

        // If the video
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
        if (!data || !data.download)
          throw new Error("Invalid API data structure.");

        const videoUrl = data.download.hd || data.download.sd;
        const thumb = data.thumbnail || null;

        if (!videoUrl)
          throw new Error("No valid video URL found from API 3 (Vreden).");

        await ctx.api.sendVideo(chatId, videoUrl, {
          ...(thumb ? { thumbnail: thumb } : {}),
        });

        // Add this at the end just in case
        throw new Error("API 3 returned no valid downloadable content.");
      };

      // Instagram handlers
      const igHandler1 = async (ctx, chatId, data) => {
        const results = Array.isArray(data)
          ? data
          : Array.isArray(data.data)
          ? data.data
          : [];

        if (!results.length)
          throw new Error("Invalid or empty API data format.");

        const urls = results.map((i) => i?.url).filter(Boolean);
        if (!urls.length) throw new Error("No valid media URLs found.");

        const video = urls.find((u) => u.includes(".mp4"));
        const photos = urls.filter((u) => !u.includes(".mp4"));

        if (video) {
          await ctx.api.sendVideo(chatId, video);
          return;
        }

        if (photos.length) {
          const maxSend = photos.slice(0, 10);
          await ctx.api.sendMediaGroup(
            chatId,
            maxSend.map((url) => ({ type: "photo", media: url }))
          );
          return;
        }

        throw new Error("API 1 returned no valid downloadable content.");
      };

      const igHandler2 = async (ctx, chatId, data) => {
        // 🔹 Initial data validation
        if (!data || typeof data !== "object") {
          throw new Error(
            "Invalid IG API 2 format: Root data missing or invalid."
          );
        }

        // 🔹 Detect data structure (sometimes using 'result', sometimes directly object)
        const result =
          data.result && typeof data.result === "object" ? data.result : data;

        // 🔹 Fetch all media URLs
        const mediaUrls = Array.isArray(result.url)
          ? result.url.filter(Boolean)
          : typeof result.url === "string"
          ? [result.url]
          : [];

        if (!mediaUrls.length) {
          throw new Error("API 2 returned empty or invalid URLs.");
        }

        // 🔹 Ambil metadata (opsional)
        const isVideo = Boolean(result.isVideo);
        const likes = result.like || 0;
        const comments = result.comment || 0;

        // 🔹 Buat caption sederhana (emoji ❤️ 💬)
        const caption = `❤️ ${toNumberFormat(likes)}   💬 ${toNumberFormat(
          comments
        )}`;

        // 🔹 Jika formatnya video
        if (isVideo) {
          await ctx.api.sendVideo(chatId, mediaUrls[0], {
            caption,
            parse_mode: "Markdown",
            supports_streaming: true,
          });
          return;
        }

        const groups = chunkArray(mediaUrls, 10); // kirim per 10 agar tidak timeout
        for (const grp of groups) {
          const mediaGroup = grp.map((url, idx) => ({
            type: "photo",
            media: url,
            ...(idx === 0 ? { caption, parse_mode: "Markdown" } : {}),
          }));

          await ctx.api.sendMediaGroup(chatId, mediaGroup);
          if (groups.length > 1) await delay(1500); // delay antar batch
        }
        throw new Error("API 2 returned no valid downloadable content.");
      };

      const igHandler3 = async (ctx, chatId, data) => {
        const root = data.result ? data.result : data;

        if (!root?.data || !Array.isArray(root.data)) {
          throw new Error("Invalid Instagram API structure.");
        }

        const mediaList = root.data;
        const videos = mediaList.filter((m) => m.type === "video" && m.url);
        const images = mediaList.filter((m) => m.type === "image" && m.url);

        // Kirim video jika ada
        if (videos.length > 0) {
          await ctx.api.sendVideo(chatId, videos[0].url, {
            supports_streaming: true,
          });
          return;
        }

        // Kirim semua gambar jika tidak ada video
        if (images.length > 0) {
          const groups = chunkArray(
            images.map((img) => img.url),
            10
          );
          for (const group of groups) {
            const mediaGroup = group.map((url) => ({
              type: "photo",
              media: url,
            }));
            await ctx.api.sendMediaGroup(chatId, mediaGroup);
            await delay(1500);
          }
          return;
        }
        throw new Error("API 3 returned no valid downloadable content.");
      };

      const enableStatus = {
        tiktok: { siputzx: true, archive: true, vreden: true }, // All Instagram accounts are active and functional as of 12/11/25
        instagram: { siputzx: true, archive: true, vreden: true }, // All Instagram accounts are active and functional as of 12/11/25
        facebook: { siputzx: true, archive: true, vreden: true }, // Siputzx api error 500, Archive vreden api normal and functional as of 12/11/25
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

      // === PARALLEL REQUEST + HANDLER SEKALIGUS ===
      let sent = false;
      const controllers = validApis.map(() => new AbortController());

      await Promise.all(
        validApis.map(async (api, i) => {
          if (sent) return; // kalau sudah ada yang sukses, lewati

          const controller = controllers[i];
          const start = Date.now();

          try {
            const res = await axios.get(api.url, {
              signal: controller.signal,
              timeout: 8000,
            });

            // kalau sudah ada API lain yang sukses, langsung hentikan eksekusi
            if (sent) return;

            const duration = ((Date.now() - start) / 1000).toFixed(2);
            console.log(`✅ ${api.label} fetched in ${duration}s`);

            const data =
              res.result || res.data?.result || res.data?.data || res.data;
            if (!data) throw new Error("Data kosong");

            if (!sent) {
              sent = true;
              controllers.forEach((c) => c.abort()); // hentikan API lain
              console.log(`🚀 Menggunakan: ${api.label} (${duration}s)`);
              await api.handler(ctx, chatId, data);
            }
          } catch (err) {
            // stop log error kalau sudah ada yang sukses
            if (sent) return;

            const duration = ((Date.now() - start) / 1000).toFixed(2);
            console.warn(
              `⚠️ ${api.label} gagal setelah ${duration}s: ${err.message}`
            );
          }
        })
      );

      if (!sent) {
        await ctx.reply("⚠️ Semua API gagal merespons atau tidak valid.");
      }
    } catch (err) {
      console.error("❌ Fatal Error:", err);
      await ctx.reply("⚠️ Terjadi kesalahan saat memproses permintaan.");
    } finally {
      processingUsers.delete(userId);
    }
  },
};
