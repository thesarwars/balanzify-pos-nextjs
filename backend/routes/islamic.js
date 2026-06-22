/**
 * Islamic-market routes: Hijri calendar, Ramadan awareness, Zakat, and the
 * localization (language / RTL) the launch markets expect.
 *
 *   GET /api/v1/islamic/hijri/today        — today in the Hijri calendar (+ Ramadan)
 *   GET /api/v1/islamic/hijri/convert      — convert a Gregorian date to Hijri
 *   GET /api/v1/islamic/zakat/assessment   — Zakat due, derived from the ledger
 *   GET /api/v1/islamic/localization       — business language + RTL flag
 */
const express = require('express');
const prisma = require('../lib/prisma');
const hijri = require('../lib/hijri');
const zakat = require('../lib/zakat');
const { auth } = require('../middleware/auth');

const router = express.Router();

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English',  rtl: false },
  { code: 'so', name: 'Somali',   rtl: false },
  { code: 'ar', name: 'Arabic',   rtl: true  },
];
const isRtl = (lang) => lang === 'ar';

router.get('/hijri/today', auth, async (req, res, next) => {
  try {
    const biz = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { language: true } });
    const tz = req.query.tz || 'Africa/Nairobi';
    const lang = req.query.lang || biz?.language || 'en';
    const now = new Date();
    res.json({
      gregorian: now.toISOString().slice(0, 10),
      hijri: hijri.toHijri(now, { lang, tz }),
      is_ramadan: hijri.isRamadan(now, tz),
      timezone: tz,
    });
  } catch (err) { next(err); }
});

router.get('/hijri/convert', auth, async (req, res, next) => {
  try {
    const raw = req.query.date;
    const date = raw ? new Date(raw) : new Date();
    if (isNaN(date.getTime())) return res.status(400).json({ title: 'Invalid `date`', status: 400 });
    const lang = req.query.lang || 'en';
    res.json({ gregorian: date.toISOString().slice(0, 10), hijri: hijri.toHijri(date, { lang, tz: req.query.tz || 'UTC' }) });
  } catch (err) { next(err); }
});

router.get('/zakat/assessment', auth, async (req, res, next) => {
  try {
    const nisab = req.query.nisab != null && req.query.nisab !== '' ? Number(req.query.nisab) : null;
    if (nisab != null && (isNaN(nisab) || nisab < 0)) return res.status(400).json({ title: 'Invalid `nisab`', status: 400 });
    const result = await zakat.assess(req.user.business_id, { nisab, from: req.query.from, to: req.query.to });
    const asOf = hijri.toHijri(new Date(), { lang: req.query.lang || 'en', tz: req.query.tz || 'Africa/Nairobi' });
    res.json({ ...result, as_of_hijri: asOf.formatted });
  } catch (err) { next(err); }
});

router.get('/localization', auth, async (req, res, next) => {
  try {
    const biz = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { language: true } });
    const language = biz?.language || 'en';
    res.json({ language, is_rtl: isRtl(language), supported: SUPPORTED_LANGUAGES });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
module.exports.isRtl = isRtl;
