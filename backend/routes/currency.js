const express = require('express');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z } = require('zod');
const { getRates, convert, invalidateCache } = require('../lib/currency');
const router = express.Router();

const SUPPORTED = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'SOS', name: 'Somali Shilling', symbol: 'Sh' },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
];

router.get('/currencies', (req, res) => res.json({ currencies: SUPPORTED }));

router.get('/rates', auth, async (req, res, next) => {
  try {
    const rates = await prisma.exchangeRate.findMany({
      where: { businessId: req.user.business_id },
    });
    res.json({ rates });
  } catch (err) { next(err); }
});

router.put('/rates', auth, requireRole('owner', 'manager'),
  validate(z.object({
    from_currency: z.string().length(3),
    to_currency: z.string().length(3),
    rate: z.coerce.number().positive(),
  })),
  async (req, res, next) => {
    try {
      const { from_currency, to_currency, rate } = req.body;
      const result = await prisma.exchangeRate.upsert({
        where: { businessId_fromCurrency_toCurrency: { businessId: req.user.business_id, fromCurrency: from_currency, toCurrency: to_currency } },
        create: { businessId: req.user.business_id, fromCurrency: from_currency, toCurrency: to_currency, rate },
        update: { rate },
      });
      invalidateCache(req.user.business_id);
      res.json(result);
    } catch (err) { next(err); }
  }
);

router.post('/convert', auth,
  validate(z.object({ amount: z.coerce.number().positive(), from: z.string().length(3), to: z.string().length(3) })),
  async (req, res, next) => {
    try {
      const { amount, from, to } = req.body;
      const result = await convert(amount, from, to, req.user.business_id);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// GET /api/v1/currency/rates/live — all current rates (live + manual)
router.get('/rates/live', auth, async (req, res, next) => {
  try {
    const businessCurrency = req.user.currency || 'USD';
    const rates = await getRates(req.user.business_id, businessCurrency);
    res.json({ base: businessCurrency, rates, source: 'balanzify', updatedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

module.exports = router;
