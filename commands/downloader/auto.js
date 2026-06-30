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

    // === PARSE INPUT FOR SLIDE EXCLUSION ===
    const parseInput = (input) => {
      let url = input;
      const excludedSlides = new Set();

      const match = input.match(/^(.+?)\s*-\s*(\d+)$/);
      if (match) {
        url = match[1].trim();
        const slideNumbers = match[2]
          .split("")
          .map(Number)
          .filter((n) => !isNaN(n));
        slideNumbers.forEach((n) => excludedSlides.add(n));
      }

      return { url, excludedSlides };
    };

    const { url: mediaUrl, excludedSlides } = parseInput(input);

    // === GLOBAL LOCK ===
    if (processingUsers.has(userId)) {
      await ctx.reply(
        "⏳ Please wait, we are processing your previous request...",
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

      const username = ctx.from.username;
      const firstName = ctx.from.first_name;
      const mention = username ? `@${username}` : firstName;

      const isTikTok = tiktokRegex.test(mediaUrl);
      const isInstagram = instagramRegex.test(mediaUrl);
      const isFacebook = facebookRegex.test(mediaUrl);
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

      const getPlatformFromUrl = () => {
        if (isTikTok) return "TikTok";
        if (isInstagram) return "Instagram";
        if (isFacebook) return "Facebook";
        return "Unknown";
      };
      const platform = getPlatformFromUrl();

      // -------------------- HANDLERS --------------------

      // ✅ TikTok handler 1 - FIXED: caption + friendly message if all excluded
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
            await ctx.api.sendVideo(chatId, videos[0], {
              caption: `🔗 Source: Siputzx\n📱 Platform: ${platform}\n👤 Request by: ${mention}`,
              parse_mode: "Markdown",
            });
            return;
          }

          if (photos.length) {
            const filteredPhotos = photos.filter(
              (_, index) => !excludedSlides.has(index + 1),
            );

            // ✅ Friendly reply if all excluded
            if (filteredPhotos.length === 0) {
              await ctx.reply(
                "⚠️ All selected slides were excluded. No photos to send.",
              );
              return;
            }

            const groups = chunkArray(filteredPhotos, 10);
            for (const grp of groups) {
              const mediaGroup = grp.map((url, idx) => ({
                type: "photo",
                media: url,
                // ✅ Caption on first photo of each batch
                ...(idx === 0
                  ? {
                      caption: `🔗 Source: Siputzx\n📱 Platform: ${platform}\n👤 Request by: ${mention}`,
                      parse_mode: "Markdown",
                    }
                  : {}),
              }));

              try {
                await ctx.api.sendMediaGroup(chatId, mediaGroup);
              } catch (e) {
                if (
                  e.error_code === 429 ||
                  e.description?.includes("Too Many Requests")
                )
                  await delay(1000);
              }
              await delay(500);
            }
          }
        } catch (err) {
          throw new Error("Handler 1 failed to process media.");
        }
      };

      // ✅ TikTok handler 2 - FIXED: friendly message if all excluded
      const tthandler2 = async (ctx, chatId, data) => {
        if (!data || typeof data !== "object" || !data.metadata)
          throw new Error("Invalid data format: metadata missing.");

        const md = data.metadata;
        const statsOnly = [
          `Views: ${toNumberFormat(md.view)}`,
          `Comments: ${toNumberFormat(md.comment)}`,
          `Shares: ${toNumberFormat(md.share)}`,
          `Downloads: ${toNumberFormat(md.download)}`,
        ].join("\n");
        const caption = `Duration: ${md.durasi}s\n\n${statsOnly}\n\n🔗 Source: Archive\n📱 Platform: ${platform}\n👤 Request by: ${mention}`;

        if (
          Array.isArray(data.media?.image_slide) &&
          data.media.image_slide.length > 0
        ) {
          const filteredSlides = data.media.image_slide.filter(
            (_, index) => !excludedSlides.has(index + 1),
          );

          // ✅ Friendly reply if all excluded
          if (filteredSlides.length === 0) {
            await ctx.reply(
              "⚠️ All selected slides were excluded. No photos to send.",
            );
            return;
          }

          const groups = chunkArray(filteredSlides, 10);
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
                err.description || err.message,
              );
            }
            await delay(500);
          }
          return;
        }

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
              err.description || err.message,
            );
          }
          return;
        }
        throw new Error("API 2 returned no valid downloadable content.");
      };

      // ✅ TikTok handler 3 - FIXED: friendly message if all excluded
      const tthandler3 = async (ctx, chatId, data) => {
        if (!data || typeof data !== "object")
          throw new Error("Invalid API 3 data.");

        const photos = Array.isArray(data.data)
          ? data.data.filter((item) => item.type === "photo")
          : [];
        const video = Array.isArray(data.data)
          ? data.data.find(
              (item) =>
                item.type === "nowatermark" || item.type === "nowatermark_hd",
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
        const caption = `${statsText}\n\n🔗 Source: Vreden\n📱 Platform: ${platform}\n👤 Request by: ${mention}`;

        if (photos.length > 0) {
          const filteredPhotos = photos.filter(
            (_, index) => !excludedSlides.has(index + 1),
          );

          // ✅ Friendly reply if all excluded
          if (filteredPhotos.length === 0) {
            await ctx.reply(
              "⚠️ All selected slides were excluded. No photos to send.",
            );
            return;
          }

          const groups = chunkArray(
            filteredPhotos.map((p) => p.url),
            10,
          );
          for (const grp of groups) {
            const mediaGroup = grp.map((url, idx) => ({
              type: "photo",
              media: url,
              ...(idx === 0 ? { caption, parse_mode: "Markdown" } : {}),
            }));
            await ctx.api.sendMediaGroup(chatId, mediaGroup);
            await delay(500);
          }
          return;
        }

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

      // Facebook handlers (video only - no changes needed)
      const fbHandler1 = async (ctx, chatId, data) => {
        if (!data || !Array.isArray(data.data))
          throw new Error("Invalid FB API 1 format.");
        const hdMp4Video = data.data.find(
          (item) => item.format === "mp4" && item.resolution === "HD",
        );
        if (!hdMp4Video?.url) throw new Error("HD MP4 URL not found.");
        await ctx.api.sendVideo(chatId, hdMp4Video.url, {
          caption: `🔗 Source: Siputzx\n📱 Platform: ${platform}\n👤 Request by: ${mention}`,
          parse_mode: "Markdown",
        });
      };
      const fbHandler2 = async (ctx, chatId, data) => {
        if (!data) throw new Error("Invalid FB API 2 format.");
        const videoUrl = data.media?.[2] || data.media?.[0] || null;
        if (!videoUrl) throw new Error("No HD video URL found in API 2.");
        await ctx.api.sendVideo(chatId, videoUrl, {
          caption: `🔗 Source: Archive\n📱 Platform: ${platform}\n👤 Request by: ${mention}`,
          parse_mode: "Markdown",
        });
      };
      const fbHandler3 = async (ctx, chatId, data) => {
        if (!data || !data.download)
          throw new Error("Invalid API data structure.");
        const videoUrl = data.download.hd || data.download.sd;
        const thumb = data.thumbnail || null;
        if (!videoUrl)
          throw new Error("No valid video URL found from API 3 (Vreden).");
        await ctx.api.sendVideo(chatId, videoUrl, {
          caption: `🔗 Source: Vreden\n📱 Platform: ${platform}\n👤 Request by: ${mention}`,
          parse_mode: "Markdown",
          ...(thumb ? { thumbnail: thumb } : {}),
        });
      };

      // ✅ Instagram handler 1 - FIXED: caption + friendly message if all excluded
      const igHandler1 = async (ctx, chatId, data) => {
        try {
          console.log(
            "📥 [igHandler1] Raw data received:",
            JSON.stringify(data, null, 2),
          );

          // ==================== HELPER: FORMAT METADATA ====================
          const formatMetadata = (meta, isMultiplePhotos = false) => {
            if (!meta) return "";

            const lines = [];

            // Like count
            if (meta.like_count && meta.like_count > 0) {
              lines.push(`❤️ ${meta.like_count.toLocaleString()} likes`);
            }

            // Comment count
            if (meta.comment_count && meta.comment_count > 0) {
              lines.push(`💬 ${meta.comment_count.toLocaleString()} comments`);
            }

            // Username
            if (meta.username) {
              lines.push(`👤 @${meta.username}`);
            }

            // Taken at (hanya untuk single photo/video, bukan multiple photos)
            if (!isMultiplePhotos && meta.taken_at && meta.taken_at > 0) {
              const date = new Date(meta.taken_at * 1000);
              const formattedDate = date.toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              lines.push(`📅 ${formattedDate}`);
            }

            return lines.length > 0 ? lines.join("\n") : "";
          };

          // ==================== NORMALISASI STRUKTUR DATA ====================
          let urlArrays = [];
          let meta = null;

          // Case 1: data langsung punya property url
          if (data?.url && Array.isArray(data.url)) {
            urlArrays.push(data.url);
            meta = data.meta || null;
            console.log("✅ Case 1: data.url detected");
          }
          // Case 2: data.data adalah object dengan property url
          else if (data?.data?.url && Array.isArray(data.data.url)) {
            urlArrays.push(data.data.url);
            meta = data.data.meta || null;
            console.log("✅ Case 2: data.data.url detected");
          }
          // Case 3: data.data adalah array (multiple posts)
          else if (Array.isArray(data?.data)) {
            data.data.forEach((item) => {
              if (item?.url && Array.isArray(item.url)) {
                urlArrays.push(item.url);
              }
            });
            meta = data.data[0]?.meta || null;
            console.log(
              `✅ Case 3: data.data array with ${urlArrays.length} items`,
            );
          }
          // Case 4: data sendiri adalah array
          else if (Array.isArray(data)) {
            data.forEach((item) => {
              if (item?.url && Array.isArray(item.url)) {
                urlArrays.push(item.url);
              }
            });
            meta = data[0]?.meta || null;
            console.log(`✅ Case 4: data array with ${urlArrays.length} items`);
          }

          if (urlArrays.length === 0) {
            console.error(
              "❌ [igHandler1] Could not find any url arrays in data structure",
            );
            throw new Error("Invalid or empty API data format.");
          }

          // Flatten semua URL arrays dan extract URL string
          const urls = urlArrays
            .flat()
            .map((item) => (typeof item === "string" ? item : item?.url))
            .filter(Boolean);

          console.log(`🔗 [igHandler1] Extracted ${urls.length} URLs`);

          if (!urls.length) {
            console.error("❌ [igHandler1] No valid URLs extracted");
            throw new Error("No valid media URLs found.");
          }

          // Separate video and photos
          const video = urls.find((u) => u.toLowerCase().includes(".mp4"));
          const photos = urls.filter((u) => !u.toLowerCase().includes(".mp4"));

          console.log(`🎬 [igHandler1] Video: ${video ? "YES" : "NO"}`);
          console.log(`📸 [igHandler1] Photos: ${photos.length}`);

          // ==================== KIRIM VIDEO ====================
          if (video) {
            console.log(`📤 [igHandler1] Sending video to ${chatId}...`);

            const metadataCaption = formatMetadata(meta, false);
            const sourceCaption = `🔗 Source: Siputzx\n📱 Platform: ${platform}\n👤 Request by: ${mention}`;

            // Gabungkan: stats di atas, source di bawah
            const fullCaption = metadataCaption
              ? `${metadataCaption}\n\n${sourceCaption}`
              : sourceCaption;

            await ctx.api.sendVideo(chatId, video, {
              caption: fullCaption,
              parse_mode: "Markdown",
            });
            console.log(`✅ [igHandler1] Video sent successfully!`);
            return;
          }

          // ==================== KIRIM PHOTOS ====================
          if (photos.length) {
            const filteredPhotos = photos.filter(
              (_, index) => !excludedSlides.has(index + 1),
            );

            console.log(
              `📸 [igHandler1] Photos after filtering: ${filteredPhotos.length}`,
            );

            if (filteredPhotos.length === 0) {
              console.warn("⚠️ [igHandler1] All photos were excluded");
              await ctx.reply(
                "⚠️ All selected slides were excluded. No photos to send.",
              );
              return;
            }

            // Determine if this is multiple photos (carousel)
            const isMultiplePhotos = filteredPhotos.length > 1;
            const metadataCaption = formatMetadata(meta, isMultiplePhotos);
            const sourceCaption = `🔗 Source: Siputzx\n📱 Platform: ${platform}\n👤 Request by: ${mention}`;

            // Gabungkan: stats di atas, source di bawah
            const fullCaption = metadataCaption
              ? `${metadataCaption}\n\n${sourceCaption}`
              : sourceCaption;

            // Send in batches of 10 (Telegram limit)
            const groups = [];
            for (let i = 0; i < filteredPhotos.length; i += 10) {
              groups.push(filteredPhotos.slice(i, i + 10));
            }

            console.log(
              `📦 [igHandler1] Sending ${groups.length} media group(s)...`,
            );

            for (let batchIdx = 0; batchIdx < groups.length; batchIdx++) {
              const grp = groups[batchIdx];
              console.log(`   Batch ${batchIdx + 1}: ${grp.length} photos`);

              const mediaGroup = grp.map((url, idx) => ({
                type: "photo",
                media: url,
                // Caption only on first photo of first batch
                ...(batchIdx === 0 && idx === 0
                  ? {
                      caption: fullCaption,
                      parse_mode: "Markdown",
                    }
                  : {}),
              }));

              await ctx.api.sendMediaGroup(chatId, mediaGroup);
              console.log(`   ✅ Batch ${batchIdx + 1} sent`);

              // Delay between batches
              if (batchIdx < groups.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
            }

            console.log(`✅ [igHandler1] All photos sent successfully!`);
            return;
          }

          throw new Error("API 1 returned no valid downloadable content.");
        } catch (err) {
          console.error("❌ [igHandler1] Error:", err.message);
          console.error("❌ [igHandler1] Stack:", err.stack);

          await ctx
            .reply(`⚠️ Gagal download Instagram: ${err.message}`)
            .catch(() => {});

          throw err;
        }
      };

      // ✅ Instagram handler 2 - FIXED: friendly message if all excluded
      const igHandler2 = async (ctx, chatId, data) => {
        if (!data || typeof data !== "object")
          throw new Error(
            "Invalid IG API 2 format: Root data missing or invalid.",
          );
        const result =
          data.result && typeof data.result === "object" ? data.result : data;
        const mediaUrls = Array.isArray(result.url)
          ? result.url.filter(Boolean)
          : typeof result.url === "string"
            ? [result.url]
            : [];
        if (!mediaUrls.length)
          throw new Error("API 2 returned empty or invalid URLs.");

        const isVideo = Boolean(result.isVideo);
        const likes = result.like || 0;
        const comments = result.comment || 0;
        const caption = `${likes > 0 ? `❤️ ${toNumberFormat(likes)}` : ""}${comments > 0 ? `   💬 ${toNumberFormat(comments)}` : ""}\n\n🔗 Source: Archive\n📱 Platform: ${platform}\n👤 Request by: ${mention}`;

        if (isVideo) {
          await ctx.api.sendVideo(chatId, mediaUrls[0], {
            caption,
            parse_mode: "Markdown",
            supports_streaming: true,
          });
          return;
        }

        const filteredUrls = mediaUrls.filter(
          (_, index) => !excludedSlides.has(index + 1),
        );

        // ✅ Friendly reply if all excluded
        if (filteredUrls.length === 0) {
          await ctx.reply(
            "⚠️ All selected slides were excluded. No photos to send.",
          );
          return;
        }

        const groups = chunkArray(filteredUrls, 10);
        for (const grp of groups) {
          const mediaGroup = grp.map((url, idx) => ({
            type: "photo",
            media: url,
            ...(idx === 0 ? { caption, parse_mode: "Markdown" } : {}),
          }));
          await ctx.api.sendMediaGroup(chatId, mediaGroup);
          if (groups.length > 1) await delay(500);
        }
      };

      // ✅ Instagram handler 3 - FIXED: caption + friendly message if all excluded
      const igHandler3 = async (ctx, chatId, data) => {
        const root = data.result ? data.result : data;
        if (!root?.data || !Array.isArray(root.data))
          throw new Error("Invalid Instagram API structure.");
        const mediaList = root.data;
        const videos = mediaList.filter((m) => m.type === "video" && m.url);
        const images = mediaList.filter((m) => m.type === "image" && m.url);

        if (videos.length > 0) {
          await ctx.api.sendVideo(chatId, videos[0].url, {
            caption: `🔗 Source: Vreden\n📱 Platform: ${platform}\n👤 Request by: ${mention}`,
            parse_mode: "Markdown",
            supports_streaming: true,
          });
          return;
        }

        if (images.length > 0) {
          const filteredImages = images.filter(
            (_, index) => !excludedSlides.has(index + 1),
          );

          // ✅ Friendly reply if all excluded
          if (filteredImages.length === 0) {
            await ctx.reply(
              "⚠️ All selected slides were excluded. No photos to send.",
            );
            return;
          }

          const groups = chunkArray(
            filteredImages.map((img) => img.url),
            10,
          );
          for (const group of groups) {
            const mediaGroup = group.map((url, idx) => ({
              type: "photo",
              media: url,
              // ✅ Caption on first photo of each batch
              ...(idx === 0
                ? {
                    caption: `🔗 Source: Vreden\n📱 Platform: ${platform}\n👤 Request by: ${mention}`,
                    parse_mode: "Markdown",
                  }
                : {}),
            }));
            await ctx.api.sendMediaGroup(chatId, mediaGroup);
            await delay(500);
          }
          return;
        }
        throw new Error("API 3 returned no valid downloadable content.");
      };

      // API configuration
      const enableStatus = {
        tikTok: { siputzx: false, archive: true, vreden: false },
        instagram: { siputzx: true, archive: false, vreden: false },
        facebook: { siputzx: true, archive: true, vreden: true },
      };

      const apis = [];
      if (isTikTok) {
        const active = enableStatus.tikTok;
        apis.push(
          active.siputzx && {
            url: createUrl(
              "siputzx",
              `/api/d/tiktok/v2?url=${encodeURIComponent(mediaUrl)}`,
            ),
            handler: tthandler1,
            label: "Siputzx - TikTok",
          },
          active.archive && {
            url: createUrl(
              "archive",
              `/api/download/tiktok?url=${encodeURIComponent(mediaUrl)}`,
            ),
            handler: tthandler2,
            label: "Archive - TikTok",
          },
          active.vreden && {
            url: createUrl(
              "vreden",
              `/api/v1/download/tiktok?url=${encodeURIComponent(mediaUrl)}`,
            ),
            handler: tthandler3,
            label: "Vreden - TikTok",
          },
        );
      }
      if (isInstagram) {
        const active = enableStatus.instagram;
        apis.push(
          active.siputzx && {
            url: createUrl(
              "siputzx",
              `/api/d/igram?url=${encodeURIComponent(mediaUrl)}`,
            ),
            handler: igHandler1,
            label: "Siputzx - Instagram",
          },
          active.archive && {
            url: createUrl(
              "archive",
              `/api/download/instagram?url=${encodeURIComponent(mediaUrl)}`,
            ),
            handler: igHandler2,
            label: "Archive - Instagram",
          },
          active.vreden && {
            url: createUrl(
              "vreden",
              `/api/v1/download/instagram?url=${encodeURIComponent(mediaUrl)}`,
            ),
            handler: igHandler3,
            label: "Vreden - Instagram",
          },
        );
      }
      if (isFacebook) {
        const active = enableStatus.facebook;
        apis.push(
          active.siputzx && {
            url: createUrl(
              "siputzx",
              `/api/d/facebook?url=${encodeURIComponent(mediaUrl)}`,
            ),
            handler: fbHandler1,
            label: "Siputzx - Facebook",
          },
          active.archive && {
            url: createUrl(
              "archive",
              `/api/download/facebook?url=${encodeURIComponent(mediaUrl)}`,
            ),
            handler: fbHandler2,
            label: "Archive - Facebook",
          },
          active.vreden && {
            url: createUrl(
              "vreden",
              `/api/v1/download/facebook?url=${encodeURIComponent(mediaUrl)}`,
            ),
            handler: fbHandler3,
            label: "Vreden - Facebook",
          },
        );
      }

      const validApis = apis.filter(Boolean);
      if (validApis.length === 0) return;

      // === PARALLEL REQUEST + HANDLER ===
      let sent = false;
      const controllers = validApis.map(() => new AbortController());

      await Promise.all(
        validApis.map(async (api, i) => {
          if (sent) return;
          const controller = controllers[i];
          const start = Date.now();
          try {
            const res = await axios.get(api.url, {
              signal: controller.signal,
              timeout: 8000,
            });
            if (sent) return;
            const duration = ((Date.now() - start) / 1000).toFixed(2);
            console.log(`✅ ${api.label} fetched in ${duration}s`);
            const data =
              res.result || res.data?.result || res.data?.data || res.data;
            if (!data) throw new Error("Empty data");
            if (!sent) {
              sent = true;
              controllers.forEach((c) => c.abort());
              console.log(`🚀 Use: ${api.label} (${duration}s)`);
              await api.handler(ctx, chatId, data);
            }
          } catch (err) {
            if (sent) return;
            const duration = ((Date.now() - start) / 1000).toFixed(2);
            console.warn(
              `⚠️ ${api.label} failed after ${duration}s: ${err.message}`,
            );
          }
        }),
      );

      if (!sent) {
        await ctx.reply("⚠️ All APIs failed to respond or are invalid.");
      }
    } catch (err) {
      console.error("❌ Fatal Error:", err);
      await ctx.reply("⚠️ An error occurred while processing the request.");
    } finally {
      processingUsers.delete(userId);
    }
  },
};
