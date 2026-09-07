import axios from "axios";
import { createUrl } from "../../utils/api.js";

// Constant to avoid magic numbers
// Note: ID 1635 refers to Mojokerto City, not Jakarta.
const MOJOKERTO_LOCATION_ID = "1635";

export default {
  name: "sholat",
  /**
   * Display prayer schedule for Mojokerto region
   * @param {Object} ctx - Context object from bot framework
   */
  async execute(ctx) {
    try {
      // 1. Parse Mojokerto time (WIB) robustly using Intl API
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta", // Mojokerto is in WIB timezone (Asia/Jakarta)
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const parts = formatter.formatToParts(now);
      const getPart = (type) => parts.find((p) => p.type === type)?.value || "";

      const year = getPart("year");
      const month = getPart("month");
      const day = getPart("day");
      const weekday = getPart("weekday");
      const hours = getPart("hour");
      const minutes = getPart("minute");

      const currentTime = `${hours}:${minutes}`;
      const nowInMinutes = parseInt(hours, 10) * 60 + parseInt(minutes, 10);

      // 2. Fetch Data
      const response = await axios.get(
        createUrl("myquran", `/v2/sholat/jadwal/${MOJOKERTO_LOCATION_ID}/${year}/${month}/${day}`),
        { timeout: 8000 }
      );

      if (!response.data?.data?.jadwal) {
        return ctx.reply("⚠️ Prayer schedule data not found for this date.");
      }

      const {
        lokasi: location,
        daerah: region,
        jadwal: schedule,
      } = response.data.data;

      // 3. Helper function to convert time string to minutes
      const convertToMinutes = (time) => {
        const [h, m] = time.split(":").map(Number);
        return h * 60 + m;
      };

      const prayerTimes = [
        { name: "Imsak", time: convertToMinutes(schedule.imsak) },
        { name: "Subuh", time: convertToMinutes(schedule.subuh) },
        { name: "Sunrise", time: convertToMinutes(schedule.terbit) },
        { name: "Dhuha", time: convertToMinutes(schedule.dhuha) },
        { name: "Dzuhur", time: convertToMinutes(schedule.dzuhur) },
        { name: "Ashar", time: convertToMinutes(schedule.ashar) },
        { name: "Maghrib", time: convertToMinutes(schedule.maghrib) },
        { name: "Isya", time: convertToMinutes(schedule.isya) },
      ];

      // 4. Cleaner logic for finding next & last prayer times
      let nextPrayer = prayerTimes.find((p) => p.time > nowInMinutes);
      let lastPrayer;

      if (!nextPrayer) {
        // Case: After Isya (Next prayer is tomorrow's Imsak)
        nextPrayer = { name: "Imsak", time: prayerTimes[0].time + 24 * 60 };
        lastPrayer = prayerTimes[prayerTimes.length - 1]; // Today's Isya
      } else {
        const nextIndex = prayerTimes.indexOf(nextPrayer);
        if (nextIndex === 0) {
          // Case: Before Imsak (Last prayer was yesterday's Isya)
          lastPrayer = { name: "Isya", time: prayerTimes[prayerTimes.length - 1].time - 24 * 60 };
        } else {
          lastPrayer = prayerTimes[nextIndex - 1];
        }
      }

      // 5. Calculate time difference
      const timeSinceLastPrayer = nowInMinutes - lastPrayer.time;
      const timeUntilNextPrayer = nextPrayer.time - nowInMinutes;

      const formatDuration = (mins) => {
        if (mins >= 60) {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          return m > 0 ? `${h} hour(s) ${m} minute(s)` : `${h} hour(s)`;
        }
        return `${mins} minute(s)`;
      };

      let additionalInfo = "";
      if (timeSinceLastPrayer >= 0) {
        additionalInfo += `🕰️ ${lastPrayer.name} passed ${formatDuration(timeSinceLastPrayer)} ago\n`;
      }
      if (timeUntilNextPrayer >= 0) {
        additionalInfo += `⏳ ${nextPrayer.name} in ${formatDuration(timeUntilNextPrayer)}`;
      }

      // 6. Format Output Message
      const message = `📅 *${weekday}, ${day}/${month}/${year}*
📍 Location: *${location}, ${region}*

🌅 Imsak: \`${schedule.imsak}\`
🕌 Subuh: \`${schedule.subuh}\`
🌞 Sunrise: \`${schedule.terbit}\`
☀️ Dhuha: \`${schedule.dhuha}\`
🕛 Dzuhur: \`${schedule.dzuhur}\`
🕒 Ashar: \`${schedule.ashar}\`
🌇 Maghrib: \`${schedule.maghrib}\`
🌙 Isya: \`${schedule.isya}\`

⏰ Current time: *${currentTime} WIB*

${additionalInfo}`;

      return ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("[Sholat Command Error]:", error.message || error);
      return ctx.reply("⚠️ Failed to fetch prayer schedule data. Please try again later.");
    }
  },
};
