import axios from "axios";
import { createUrl } from "../../utils/api.js";
// Gunakan "npm:grammy" jika Anda menjalankan ini di Deno, atau "grammy" untuk Node.js
import { InputFile } from "grammy"; 

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

      // ✅ Instagram handler 4 - NEW: Uses api-faa with InputFile streaming to avoid 403 Forbidden
      const igHandler4 = async (ctx, chatId, data) => {
        try {
          console.log("📥 [igHandler4] Raw data received:", JSON.stringify(data, null, 2));

          const result = data?.result || data;
          if (!result) throw new Error("Invalid API 4 data structure.");

          let mediaUrls = result.url;
          if (typeof mediaUrls === "string") mediaUrls = [mediaUrls];
          
          if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) {
            throw new Error("Tidak ada media di hasil API Instagram.");
          }

          const meta = result.metadata || {};
          const metaIsVideo = meta?.isVideo;
          const isVideo = metaIsVideo === true || metaIsVideo === "true" || mediaUrls[0].toLowerCase().includes(".mp4");

          const senderName = mention || "User";
          const baseCaption = `📥 Sender: <a href="tg://user?id=${userId}">${senderName}</a>\n📱 Platform: ${platform}`;

          // Helper untuk fetch media sebagai stream (menghindari 403 Forbidden dari CDN IG)
          const fetchMediaAsStream = async (url) => {
            const headers = { 
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Referer": "https://www.instagram.com/",
              "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
            };
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error(`Gagal download media: HTTP ${res.status}`);
            if (!res.body) throw new Error("Response body kosong.");
            return res.body;
          };

          if (isVideo || mediaUrls.length === 1) {
            const stream = await fetchMediaAsStream(mediaUrls[0]);
            const ext = isVideo ? ".mp4" : ".jpeg";
            const inputFile = new InputFile(stream, `media_${Date.now()}${ext}`);

            if (isVideo) {
              await ctx.api.sendVideo(chatId, inputFile, { 
                caption: baseCaption, 
                parse_mode: "HTML", 
                supports_streaming: true 
              });
            } else {
              await ctx.api.sendPhoto(chatId, inputFile, { 
                caption: baseCaption, 
                parse_mode: "HTML" 
              });
            }
            return;
          }

          // Kirim sebagai Media Group (Album)
          const excludeSet = new Set(Array.isArray(excludedSlides) ? excludedSlides.filter(n => typeof n === 'number' && n > 0) : []);
          const filteredUrls = mediaUrls.filter((_, index) => !excludeSet.has(index + 1));

          if (filteredUrls.length === 0) {
            await ctx.reply("⚠️ Semua slide dikecualikan. Tidak ada foto yang dikirim.");
            return;
          }

          const groups = chunkArray(filteredUrls, 10);

          for (let i = 0; i < groups.length; i++) {
            const mediaGroup = [];
            const grp = groups[i];

            for (let j = 0; j < grp.length; j++) {
              const mediaUrl = grp[j];
              try {
                const stream = await fetchMediaAsStream(mediaUrl);
                const typeItem = "photo"; // Default fallback untuk IG album
                const ext = ".jpeg";

                mediaGroup.push({
                  type: typeItem,
                  media: new InputFile(stream, `ig_${Date.now()}_${j}${ext}`),
                  ...(i === 0 && j === 0 ? { caption: baseCaption, parse_mode: "HTML" } : {}),
                });
              } catch (err) {
                console.error(`[igHandler4] Gagal mengunduh slide ${j + 1}:`, err.message);
                // Skip gambar yang error, lanjut ke berikutnya
              }
            }

            if (mediaGroup.length > 0) {
              try {
                await ctx.api.sendMediaGroup(chatId, mediaGroup);
              } catch (err) {
                console.error(`[igHandler4] Gagal kirim sebagai grup, fallback ke satu per satu:`, err.message);
                // Fallback: Jika grup gagal, kirim satu per satu
                for (const item of mediaGroup) {
                  try {
                    if (item.type === "photo") {
                      await ctx.api.sendPhoto(chatId, item.media, { caption: item.caption, parse_mode: "HTML" });
                    } else {
                      await ctx.api.sendVideo(chatId, item.media, { caption: item.caption, parse_mode: "HTML", supports_streaming: true });
                    }
                  } catch (e) {
                    console.error("[igHandler4] Fallback per-item juga gagal:", e.message);
                  }
                }
              }
            }

            if (i < groups.length - 1) {
              await delay(800); // Delay antar batch
            }
          }
        } catch (err) {
          console.error("❌ [igHandler4] Error:", err.message);
          throw new Error(`Handler 4 failed: ${err.message}`);
        }
      };

      // ... (tthandler1, tthandler2, tthandler3, fbHandler1, fbHandler2, fbHandler3, igHandler1, igHandler2, igHandler3 tetap sama seperti kode asli Anda) ...

      // API configuration
      const enableStatus = {
        tikTok: { siputzx: false, archive: true, vreden: false, faa: false },
        instagram: { siputzx: false, archive: false, vreden: false, faa: true }, // ✅ faa diaktifkan
        facebook: { siputzx: true, archive: true, vreden: false, faa: false },
      };

      const apis = [];
      if (isTikTok) {
        // ... (kode tiktok tetap sama) ...
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
          // ✅ Tambahan handler 4 (FAA)
          active.faa && {
            url: `https://api-faa.my.id/faa/igdl?url=${encodeURIComponent(mediaUrl)}`,
            handler: igHandler4,
            label: "FAA - Instagram",
          }
        );
      }
      if (isFacebook) {
        // ... (kode facebook tetap sama) ...
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
