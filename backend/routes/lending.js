/**
 * Lending routes — embedded working-capital finance.
 *
 * GET /api/v1/lending/assessment — credit-scoring assessment + recommended
 *   working-capital limit, underwritten from the business's own general ledger.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const underwriting = require('../lib/underwriting');
const financing = require('../lib/financing');
const router = express.Router();

router.get('/assessment', auth, async (req, res, next) => {
  try {
    const assessment = await underwriting.assess(req.user.business_id);
    res.json(assessment);
  } catch (err) { next(err); }
});

// Create a financing offer (Sharia-compliant fixed fee), gated by underwriting.
router.post('/offer', auth, requireRole('owner'), validate(z.object({
  principal:       z.coerce.number().positive(),
  term_days:       z.coerce.number().int().positive().max(365).default(30),
  collection_rate: z.coerce.number().min(0).max(1).default(0.10),
})), async (req, res, next) => {
  try {
    const advance = await financing.createOffer({
      businessId: req.user.business_id, principal: req.body.principal,
      termDays: req.body.term_days, collectionRate: req.body.collection_rate, createdById: req.user.id,
    });
    res.status(201).json(advance);
  } catch (err) { next(err); }
});

router.post('/advances/:id/disburse', auth, requireRole('owner'), async (req, res, next) => {
  try {
    const advance = await financing.disburse({ businessId: req.user.business_id, advanceId: req.params.id, createdById: req.user.id });
    res.json(advance);
  } catch (err) { next(err); }
});

router.post('/advances/:id/repay', auth, requireRole('owner', 'manager'), validate(z.object({
  amount: z.coerce.number().positive(),
})), async (req, res, next) => {
  try {
    const result = await prisma.$transaction((tx) => financing.repay(tx, {
      businessId: req.user.business_id, advanceId: req.params.id, amount: req.body.amount, source: 'manual', createdById: req.user.id,
    }));
    res.json({ message: result.settled ? 'Advance settled.' : 'Repayment recorded.', ...result });
  } catch (err) { next(err); }
});

router.get('/advances/:id/health', auth, async (req, res, next) => {
  try {
    const h = await financing.health(req.user.business_id, req.params.id);
    if (!h) return res.status(404).json({ error: 'Advance not found.' });
    res.json(h);
  } catch (err) { next(err); }
});

router.get('/advances', auth, async (req, res, next) => {
  try {
    const advances = await prisma.financingAdvance.findMany({
      where: { businessId: req.user.business_id, ...(req.query.status && { status: req.query.status }) },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    res.json({ advances: advances.map(a => ({ ...a, outstanding: parseFloat((parseFloat(a.totalRepayable) - parseFloat(a.amountRepaid)).toFixed(2)) })) });
  } catch (err) { next(err); }
});

module.exports = router;
