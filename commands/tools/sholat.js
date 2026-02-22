import axios from "axios";
import { createUrl } from "../../utils/api.js";

export default {
  name: "sholat",
  async execute(ctx) {
    try {
      const now = new Date();

      const jakarta = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
      );

      const year = jakarta.getFullYear();
      const month = String(jakarta.getMonth() + 1).padStart(2, "0");
      const day = String(jakarta.getDate()).padStart(2, "0");

      const weekday = jakarta.toLocaleDateString("id-ID", { weekday: "long" });

      const currentTime = `${String(jakarta.getHours()).padStart(2, "0")}:${String(
        jakarta.getMinutes()
      ).padStart(2, "0")}`;

      const response = await axios.get(
        createUrl("myquran", `/v2/sholat/jadwal/1635/${year}/${month}/${day}`),
        { timeout: 8000 }
      );

      if (!response.data?.data?.jadwal) {
        return ctx.reply("⚠️ Data jadwal tidak ditemukan.");
      }

      const {
        lokasi: location,
        daerah: region,
        jadwal: schedule,
      } = response.data.data;

      const convertToMinutes = (time) => {
        const [hour, minute] = time.split(":").map(Number);
        return hour * 60 + minute;
      };

      const nowInMinutes = convertToMinutes(currentTime);

      const prayerTimes = [
        { name: "Imsak", time: convertToMinutes(schedule.imsak) },
        { name: "Subuh", time: convertToMinutes(schedule.subuh) },
        { name: "Terbit", time: convertToMinutes(schedule.terbit) },
        { name: "Dhuha", time: convertToMinutes(schedule.dhuha) },
        { name: "Dzuhur", time: convertToMinutes(schedule.dzuhur) },
        { name: "Ashar", time: convertToMinutes(schedule.ashar) },
        { name: "Maghrib", time: convertToMinutes(schedule.maghrib) },
        { name: "Isya", time: convertToMinutes(schedule.isya) },
      ];

      let lastPrayer = null;
      let nextPrayer = null;

      for (let i = 0; i < prayerTimes.length; i++) {
        if (prayerTimes[i].time > nowInMinutes) {
          lastPrayer =
            prayerTimes[i - 1] || prayerTimes[prayerTimes.length - 1];
          nextPrayer = prayerTimes[i];
          break;
        }
      }

      if (!nextPrayer) {
        nextPrayer = {
          name: "Imsak",
          time: convertToMinutes(schedule.imsak) + 24 * 60,
        };
      }

      if (!lastPrayer) {
        lastPrayer = prayerTimes[prayerTimes.length - 1];
      }

      const timeSinceLastPrayer = nowInMinutes - lastPrayer.time;
      const timeUntilNextPrayer = nextPrayer.time - nowInMinutes;

      const formatDuration = (minutes) => {
        if (minutes >= 60) {
          const hours = Math.floor(minutes / 60);
          const mins = minutes % 60;
          return `${hours} jam ${mins} menit`;
        }
        return `${minutes} menit`;
      };

      let additionalInfo = "";
      if (timeSinceLastPrayer >= 0) {
        additionalInfo += `🕰️ ${lastPrayer.name} sudah lewat ${formatDuration(
          timeSinceLastPrayer
        )}\n`;
      }

      if (timeUntilNextPrayer >= 0) {
        additionalInfo += `⏳ ${nextPrayer.name} dalam ${formatDuration(
          timeUntilNextPrayer
        )}`;
      }

      const message = `📅 ${weekday}, ${day}/${month}/${year}
📍 Lokasi: ${location}, ${region}

🌅 Imsak: ${schedule.imsak}
🕌 Subuh: ${schedule.subuh}
🌞 Terbit: ${schedule.terbit}
☀️ Dhuha: ${schedule.dhuha}
🕛 Dzuhur: ${schedule.dzuhur}
🕒 Ashar: ${schedule.ashar}
🌇 Maghrib: ${schedule.maghrib}
🌙 Isya: ${schedule.isya}

⏰ Waktu sekarang: ${currentTime} WIB

${additionalInfo}`;

      return ctx.reply(message);
    } catch (error) {
      return ctx.reply("⚠️ Gagal mengambil data jadwal sholat.");
    }
  },
};