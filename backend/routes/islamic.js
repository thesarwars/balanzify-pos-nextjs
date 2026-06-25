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
const { z } = require('zod');
const prisma = require('../lib/prisma');
const hijri = require('../lib/hijri');
const zakat = require('../lib/zakat');
const accounting = require('../lib/accounting');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

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

// Record Zakat or Sadaqah given out — a charitable outflow on the books.
router.post('/zakat/pay', auth, requireRole('owner', 'manager'), validate(z.object({
  type:      z.enum(['zakat', 'sadaqah']).default('zakat'),
  amount:    z.coerce.number().positive(),
  recipient: z.string().max(200).optional(),
  method:    z.string().max(30).default('cash'),
  note:      z.string().max(300).optional(),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const amount = +req.body.amount.toFixed(2);
    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.zakatPayment.create({
        data: { businessId, type: req.body.type, amount, recipient: req.body.recipient || null, method: req.body.method, note: req.body.note || null, createdById: req.user.id },
      });
      // GL: charitable giving is an outflow — booked to Charity, out of the tender.
      await accounting.postJournal(tx, {
        businessId, description: `${req.body.type === 'zakat' ? 'Zakat' : 'Sadaqah'}${req.body.recipient ? ' — ' + req.body.recipient : ''}`,
        sourceType: 'zakat_payment', sourceId: p.id, createdById: req.user.id,
        lines: [
          { code: '5400', debit: amount, credit: 0, description: req.body.type === 'zakat' ? 'Zakat given' : 'Sadaqah given' },
          { code: accounting.tenderAccountCode(req.body.method), debit: 0, credit: amount, description: 'Paid to charity' },
        ],
      });
      return p;
    });
    res.status(201).json(payment);
  } catch (err) { next(err); }
});

// Giving history + totals (optionally filter by type).
router.get('/zakat/payments', auth, async (req, res, next) => {
  try {
    const where = { businessId: req.user.business_id, ...(req.query.type && { type: String(req.query.type) }) };
    const payments = await prisma.zakatPayment.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    const sum = (t) => +payments.filter(p => !t || p.type === t).reduce((s, p) => s + parseFloat(p.amount), 0).toFixed(2);
    res.json({ payments, totals: { all: sum(), zakat: sum('zakat'), sadaqah: sum('sadaqah') } });
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
