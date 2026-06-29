/**
 * Takaful — Islamic cooperative micro-insurance.
 *
 * Members contribute (tabarru', a donation) into a shared pool; losses are paid
 * out of the pool. Riba- and gharar-sensitive: the operator runs the pool, it is
 * NOT a risk-transfer sale. Natural attach to inventory / vehicle / health cover.
 *
 * SCAFFOLDING: the cooperative ledger + GL are complete and tested, but real
 * underwriting requires a takaful partner + a Sharia board. The pool is held in
 * trust as a liability (2500, Takaful Pool): contributions credit it, paid claims
 * debit it.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const accounting = require('../lib/accounting');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Create a policy and collect the first contribution into the pool.
router.post('/policies', auth, requireRole('owner', 'manager'), validate(z.object({
  policyholder:    z.string().trim().min(1).max(200),
  phone:           z.string().max(50).optional(),
  cover_type:      z.enum(['inventory', 'vehicle', 'health', 'property']).default('inventory'),
  coverage_amount: z.coerce.number().positive(),
  contribution:    z.coerce.number().positive(),
  term_months:     z.coerce.number().int().positive().max(120).default(12),
  method:          z.string().max(30).default('cash'),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const contribution = round2(req.body.contribution);
    const policy = await prisma.$transaction(async (tx) => {
      const p = await tx.takafulPolicy.create({
        data: {
          businessId, reference: `TKF-${Date.now()}`, policyholder: req.body.policyholder, phone: req.body.phone || null,
          coverType: req.body.cover_type, coverageAmount: round2(req.body.coverage_amount), contribution,
          contributedTotal: contribution, termMonths: req.body.term_months, createdById: req.user.id,
        },
      });
      await postContribution(tx, businessId, p, contribution, req.body.method, req.user.id);
      return p;
    });
    res.status(201).json(policy);
  } catch (err) { next(err); }
});

router.get('/policies', auth, async (req, res, next) => {
  try {
    const policies = await prisma.takafulPolicy.findMany({
      where: { businessId: req.user.business_id, ...(req.query.status && { status: String(req.query.status) }) },
      include: { claims: true }, orderBy: { createdAt: 'desc' }, take: 100,
    });
    res.json({ policies });
  } catch (err) { next(err); }
});

// Pay another contribution into the pool.
router.post('/policies/:id/contribute', auth, validate(z.object({
  amount: z.coerce.number().positive().optional(),
  method: z.string().max(30).default('cash'),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const out = await prisma.$transaction(async (tx) => {
      const p = await tx.takafulPolicy.findFirst({ where: { id: req.params.id, businessId } });
      if (!p) return { code: 404, error: 'Policy not found' };
      if (p.status !== 'active') return { code: 400, error: 'Policy is not active' };
      const amount = round2(req.body.amount || parseFloat(p.contribution));
      await postContribution(tx, businessId, p, amount, req.body.method, req.user.id);
      const updated = await tx.takafulPolicy.update({ where: { id: p.id }, data: { contributedTotal: round2(parseFloat(p.contributedTotal) + amount) } });
      return { policy: updated };
    });
    if (out.error) return res.status(out.code).json({ title: out.error, status: out.code });
    res.status(201).json(out.policy);
  } catch (err) { next(err); }
});

// File a claim against a policy (capped at the coverage amount).
router.post('/policies/:id/claims', auth, validate(z.object({
  amount: z.coerce.number().positive(),
  reason: z.string().trim().min(1).max(300),
})), async (req, res, next) => {
  try {
    const p = await prisma.takafulPolicy.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!p) return res.status(404).json({ title: 'Policy not found', status: 404 });
    if (req.body.amount > parseFloat(p.coverageAmount) + 0.001) return res.status(400).json({ title: 'Claim exceeds the coverage amount', status: 400 });
    const claim = await prisma.takafulClaim.create({ data: { policyId: p.id, amount: round2(req.body.amount), reason: req.body.reason } });
    res.status(201).json(claim);
  } catch (err) { next(err); }
});

// Decide a claim — pay it out of the pool, or reject it.
router.post('/claims/:id/decide', auth, requireRole('owner', 'manager'), validate(z.object({
  decision: z.enum(['paid', 'rejected']),
  method:   z.string().max(30).default('cash'),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const out = await prisma.$transaction(async (tx) => {
      const claim = await tx.takafulClaim.findFirst({ where: { id: req.params.id, policy: { businessId } }, include: { policy: true } });
      if (!claim) return { code: 404, error: 'Claim not found' };
      if (claim.status !== 'pending') return { code: 400, error: `Claim already ${claim.status}` };
      const amount = parseFloat(claim.amount);
      if (req.body.decision === 'paid') {
        await accounting.postJournal(tx, {
          businessId, description: `Takaful claim paid — ${claim.policy.reference}`,
          sourceType: 'takaful_claim', sourceId: claim.id, createdById: req.user.id,
          lines: [
            { code: '2500', debit: amount, credit: 0, description: 'Takaful pool — claim paid' },
            { code: accounting.tenderAccountCode(req.body.method), debit: 0, credit: amount, description: 'Paid to claimant' },
          ],
        });
      }
      const updated = await tx.takafulClaim.update({ where: { id: claim.id }, data: { status: req.body.decision, method: req.body.decision === 'paid' ? req.body.method : null, decidedAt: new Date() } });
      return { claim: updated };
    });
    if (out.error) return res.status(out.code).json({ title: out.error, status: out.code });
    res.json(out.claim);
  } catch (err) { next(err); }
});

// Contribution → pool (held in trust as a liability).
async function postContribution(tx, businessId, policy, amount, method, createdById) {
  await accounting.postJournal(tx, {
    businessId, description: `Takaful contribution — ${policy.reference}`,
    sourceType: 'takaful_contribution', sourceId: policy.id, createdById,
    lines: [
      { code: accounting.tenderAccountCode(method), debit: amount, credit: 0, description: 'Contribution received' },
      { code: '2500', debit: 0, credit: amount, description: 'Into takaful pool' },
    ],
  });
}

module.exports = router;
