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

    const rawInput = ctx.message?.text?.trim();
    if (!rawInput) return;

    // ==================================================
    // FORMAT BARU:
    // https://link..... -25
    // artinya hapus slide ke 2 dan 5
    // ==================================================
    let input = rawInput;
    let removeSlides = [];

    const match = rawInput.match(/^(https?:\/\/\S+)\s*-(\d+)$/);

    if (match) {
      input = match[1];
      removeSlides = match[2]
        .split("")
        .map((n) => parseInt(n))
        .filter((n) => !isNaN(n) && n > 0);
    }

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
        for (let i = 0; i < arr.length; i += size) {
          res.push(arr.slice(i, i + size));
        }
        return res;
      };

      // ==================================================
      // FILTER SLIDE
      // ==================================================
      const filterSlides = (arr = []) => {
        if (!removeSlides.length) return arr;

        return arr.filter((_, index) => {
          const slideNumber = index + 1;
          return !removeSlides.includes(slideNumber);
        });
      };

      const getPlatformFromUrl = () => {
        if (isTikTok) return "TikTok";
        if (isInstagram) return "Instagram";
        if (isFacebook) return "Facebook";
        return "Unknown";
      };

      const platform = getPlatformFromUrl();

      // ==================================================
      // TIKTOK
      // ==================================================
      const tthandler1 = async (ctx, chatId, data) => {
        const payload = data?.data ? data.data : data;

        const videos = Array.isArray(payload.download?.video)
          ? payload.download.video.filter(Boolean)
          : [];

        const photos = Array.isArray(payload.download?.photo)
          ? payload.download.photo.filter(Boolean)
          : [];

        if (videos.length) {
          await ctx.api.sendVideo(chatId, videos[0], {
            caption: `🔗 Source: Siputzx\n📱 Platform: ${platform}\n👤 Request by: ${mention}`,
          });
          return;
        }

        if (photos.length) {
          const finalPhotos = filterSlides(photos);

          const groups = chunkArray(finalPhotos, 10);

          for (const grp of groups) {
            await ctx.api.sendMediaGroup(
              chatId,
              grp.map((url) => ({
                type: "photo",
                media: url,
              })),
            );
            await delay(500);
          }
        }
      };

      const tthandler2 = async (ctx, chatId, data) => {
        if (
          Array.isArray(data.media?.image_slide) &&
          data.media.image_slide.length
        ) {
          const finalPhotos = filterSlides(data.media.image_slide);

          const groups = chunkArray(finalPhotos, 10);

          for (const grp of groups) {
            await ctx.api.sendMediaGroup(
              chatId,
              grp.map((url) => ({
                type: "photo",
                media: url,
              })),
            );
            await delay(500);
          }

          return;
        }

        if (data.media?.play) {
          await ctx.api.sendVideo(chatId, data.media.play, {
            caption: `🔗 Source: Archive\n📱 Platform: ${platform}\n👤 Request by: ${mention}`,
          });
        }
      };

      const tthandler3 = async (ctx, chatId, data) => {
        const photos = Array.isArray(data.data)
          ? data.data
              .filter((item) => item.type === "photo")
              .map((item) => item.url)
          : [];

        const video = Array.isArray(data.data)
          ? data.data.find(
              (item) =>
                item.type === "nowatermark" ||
                item.type === "nowatermark_hd",
            )
          : null;

        if (photos.length) {
          const finalPhotos = filterSlides(photos);

          const groups = chunkArray(finalPhotos, 10);

          for (const grp of groups) {
            await ctx.api.sendMediaGroup(
              chatId,
              grp.map((url) => ({
                type: "photo",
                media: url,
              })),
            );
            await delay(500);
          }

          return;
        }

        if (video?.url) {
          await ctx.api.sendVideo(chatId, video.url, {
            caption: `🔗 Source: Vreden\n📱 Platform: ${platform}\n👤 Request by: ${mention}`,
          });
        }
      };

      // ==================================================
      // INSTAGRAM
      // ==================================================
      const igHandler = async (ctx, chatId, data) => {
        const urls = Array.isArray(data?.data)
          ? data.data.map((x) => x.url).filter(Boolean)
          : [];

        const video = urls.find((u) => u.includes(".mp4"));
        const photos = urls.filter((u) => !u.includes(".mp4"));

        if (video) {
          await ctx.api.sendVideo(chatId, video, {
            caption: `📱 Platform: ${platform}\n👤 Request by: ${mention}`,
          });
          return;
        }

        if (photos.length) {
          const finalPhotos = filterSlides(photos);

          const groups = chunkArray(finalPhotos, 10);

          for (const grp of groups) {
            await ctx.api.sendMediaGroup(
              chatId,
              grp.map((url) => ({
                type: "photo",
                media: url,
              })),
            );
            await delay(500);
          }
        }
      };

      // ==================================================
      // FACEBOOK
      // ==================================================
      const fbHandler = async (ctx, chatId, data) => {
        const video =
          data?.download?.hd ||
          data?.download?.sd ||
          data?.media?.[0] ||
          null;

        if (!video) throw new Error("No video found");

        await ctx.api.sendVideo(chatId, video, {
          caption: `📱 Platform: ${platform}\n👤 Request by: ${mention}`,
        });
      };

      // ==================================================
      // API LIST
      // ==================================================
      const apis = [];

      if (isTikTok) {
        apis.push(
          {
            url: createUrl(
              "siputzx",
              `/api/d/tiktok/v2?url=${encodeURIComponent(input)}`,
            ),
            handler: tthandler1,
          },
          {
            url: createUrl(
              "archive",
              `/api/download/tiktok?url=${encodeURIComponent(input)}`,
            ),
            handler: tthandler2,
          },
          {
            url: createUrl(
              "vreden",
              `/api/v1/download/tiktok?url=${encodeURIComponent(input)}`,
            ),
            handler: tthandler3,
          },
        );
      }

      if (isInstagram) {
        apis.push({
          url: createUrl(
            "siputzx",
            `/api/d/igdl?url=${encodeURIComponent(input)}`,
          ),
          handler: igHandler,
        });
      }

      if (isFacebook) {
        apis.push({
          url: createUrl(
            "vreden",
            `/api/v1/download/facebook?url=${encodeURIComponent(input)}`,
          ),
          handler: fbHandler,
        });
      }

      let sent = false;

      await Promise.all(
        apis.map(async (api) => {
          if (sent) return;

          try {
            const res = await axios.get(api.url, {
              timeout: 8000,
            });

            if (sent) return;

            const data =
              res.data?.result ||
              res.data?.data ||
              res.data;

            if (!data) return;

            sent = true;
            await api.handler(ctx, chatId, data);
          } catch {}
        }),
      );

      if (!sent) {
        await ctx.reply("⚠️ All APIs failed.");
      }
    } catch (err) {
      console.error(err);
      await ctx.reply("⚠️ Error.");
    } finally {
      processingUsers.delete(userId);
    }
  },
};