/**
 * Hijri (Islamic) calendar utilities.
 *
 * The launch markets run their religious and much of their commercial life on
 * the lunar calendar — Ramadan trading hours, Eid promotions, and Zakat (due on
 * a lunar year). We convert via the Umm al-Qura calendar that ICU ships with
 * Node, which is the civil standard across the Arabian Peninsula and Horn of
 * Africa, so dates match what customers see on their phones.
 *
 * Month names are provided in English, Somali and Arabic; Arabic also drives
 * right-to-left rendering on the client.
 */

const MONTHS = {
  en: ['Muharram', 'Safar', 'Rabi al-awwal', 'Rabi al-thani', 'Jumada al-awwal', 'Jumada al-thani', 'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qa'dah", 'Dhu al-Hijjah'],
  so: ['Muxarram', 'Safar', 'Rabiicul Awwal', 'Rabiicul Aakhir', 'Jumaadul Awwal', 'Jumaadul Aakhir', 'Rajab', 'Shacbaan', 'Soon (Ramadaan)', 'Shawwaal', 'Dul Qacda', 'Dul Xijja'],
  ar: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
};
const RAMADAN = 9; // 9th Hijri month

/** Raw Hijri components for a Gregorian date in a given timezone. */
function hijriParts(date = new Date(), tz = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    day: 'numeric', month: 'numeric', year: 'numeric', timeZone: tz,
  }).formatToParts(date);
  const g = (t) => parts.find(p => p.type === t)?.value;
  return { day: +g('day'), month: +g('month'), year: +g('year') };
}

/** Full Hijri view of a date, localized. */
function toHijri(date = new Date(), { lang = 'en', tz = 'UTC' } = {}) {
  const { day, month, year } = hijriParts(date, tz);
  const months = MONTHS[lang] || MONTHS.en;
  const monthName = months[month - 1];
  return {
    day, month, year, month_name: monthName,
    formatted: `${day} ${monthName} ${year} AH`,
    iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    is_ramadan: month === RAMADAN,
  };
}

function isRamadan(date = new Date(), tz = 'UTC') {
  return hijriParts(date, tz).month === RAMADAN;
}

module.exports = { MONTHS, RAMADAN, hijriParts, toHijri, isRamadan };
