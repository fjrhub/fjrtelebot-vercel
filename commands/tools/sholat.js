import axios from "axios";
import { createUrl } from "../../utils/api.js";

// Konstanta untuk menghindari "magic numbers"
const JAKARTA_LOCATION_ID = "1635";

export default {
  name: "sholat",
  /**
   * Menampilkan jadwal sholat untuk wilayah Jakarta
   * @param {Object} ctx - Context object dari bot framework
   */
  async execute(ctx) {
    try {
      // 1. Parsing Waktu Jakarta yang lebih robust menggunakan Intl API
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
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
        createUrl("myquran", `/v2/sholat/jadwal/${JAKARTA_LOCATION_ID}/${year}/${month}/${day}`),
        { timeout: 8000 }
      );

      if (!response.data?.data?.jadwal) {
        return ctx.reply("⚠️ Data jadwal tidak ditemukan untuk tanggal ini.");
      }

      const {
        lokasi: location,
        daerah: region,
        jadwal: schedule,
      } = response.data.data;

      // 3. Helper function konversi waktu
      const convertToMinutes = (time) => {
        const [h, m] = time.split(":").map(Number);
        return h * 60 + m;
      };

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

      // 4. Logika pencarian waktu sholat berikutnya & terakhir yang lebih bersih
      let nextPrayer = prayerTimes.find((p) => p.time > nowInMinutes);
      let lastPrayer;

      if (!nextPrayer) {
        // Kasus: Setelah Isya (Waktu sholat berikutnya adalah Imsak besok)
        nextPrayer = { name: "Imsak", time: prayerTimes[0].time + 24 * 60 };
        lastPrayer = prayerTimes[prayerTimes.length - 1]; // Isya hari ini
      } else {
        const nextIndex = prayerTimes.indexOf(nextPrayer);
        if (nextIndex === 0) {
          // Kasus: Sebelum Imsak (Waktu sholat terakhir adalah Isya kemarin)
          lastPrayer = { name: "Isya", time: prayerTimes[prayerTimes.length - 1].time - 24 * 60 };
        } else {
          lastPrayer = prayerTimes[nextIndex - 1];
        }
      }

      // 5. Kalkulasi selisih waktu
      const timeSinceLastPrayer = nowInMinutes - lastPrayer.time;
      const timeUntilNextPrayer = nextPrayer.time - nowInMinutes;

      const formatDuration = (mins) => {
        if (mins >= 60) {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
        }
        return `${mins} menit`;
      };

      let additionalInfo = "";
      if (timeSinceLastPrayer >= 0) {
        additionalInfo += `🕰️ ${lastPrayer.name} sudah lewat ${formatDuration(timeSinceLastPrayer)}\n`;
      }
      if (timeUntilNextPrayer >= 0) {
        additionalInfo += `⏳ ${nextPrayer.name} dalam ${formatDuration(timeUntilNextPrayer)}`;
      }

      // 6. Format Pesan Output
      const message = `📅 *${weekday}, ${day}/${month}/${year}*
📍 Lokasi: *${location}, ${region}*

🌅 Imsak: \`${schedule.imsak}\`
🕌 Subuh: \`${schedule.subuh}\`
🌞 Terbit: \`${schedule.terbit}\`
☀️ Dhuha: \`${schedule.dhuha}\`
🕛 Dzuhur: \`${schedule.dzuhur}\`
🕒 Ashar: \`${schedule.ashar}\`
🌇 Maghrib: \`${schedule.maghrib}\`
🌙 Isya: \`${schedule.isya}\`

⏰ Waktu sekarang: *${currentTime} WIB*

${additionalInfo}`;

      return ctx.reply(message, { parse_mode: "Markdown" }); // Opsional: tambahkan parse_mode jika bot mendukung Markdown
    } catch (error) {
      console.error("[Sholat Command Error]:", error.message || error); // Penting untuk debugging
      return ctx.reply("⚠️ Gagal mengambil data jadwal sholat. Silakan coba lagi nanti.");
    }
  },
};
