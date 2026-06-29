/**
 * Asset / vehicle finance — Murabaha (cost-plus) or Ijara (lease-to-own).
 *
 * The research's most durable model for the corridor (M-Kopa / Watu): finance a
 * PRODUCTIVE asset — a delivery motorbike, a fridge, a phone — and collect against
 * the income it unlocks. The profit is a fixed, fully-disclosed markup, NOT
 * interest (riba-free); it does not accrue with time.
 *
 * SCAFFOLDING: the software, lifecycle and GL are complete and tested, but moving
 * real money requires a lending licence + capital + a Sharia board. Same honest
 * line as merchant lending and live mobile money.
 *
 * GL (Murabaha): on disbursement the financier buys the asset and sells it on
 * credit at cost + markup —
 *   Dr Asset Finance Receivable (cost+markup)
 *   Cr Cash (asset cost paid to the supplier)
 *   Cr Sales Revenue (the disclosed markup)
 * Each repayment: Dr <tender> / Cr Asset Finance Receivable.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const accounting = require('../lib/accounting');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const serialize = (f) => ({ ...f, outstanding: round2(parseFloat(f.totalPayable) - parseFloat(f.amountRepaid)) });

// Create an offer. The markup is fixed and disclosed; total = cost + markup.
router.post('/offers', auth, requireRole('owner'), validate(z.object({
  borrower_name:  z.string().trim().min(1).max(200),
  borrower_phone: z.string().max(50).optional(),
  structure:      z.enum(['murabaha', 'ijara']).default('murabaha'),
  asset_type:     z.enum(['vehicle', 'equipment', 'phone', 'other']).default('vehicle'),
  asset_description: z.string().max(255).optional(),
  asset_cost:     z.coerce.number().positive(),
  markup:         z.coerce.number().nonnegative(),
  term_months:    z.coerce.number().int().positive().max(120),
})), async (req, res, next) => {
  try {
    const cost = round2(req.body.asset_cost), markup = round2(req.body.markup);
    const f = await prisma.assetFinance.create({
      data: {
        businessId: req.user.business_id, reference: `AF-${Date.now()}`,
        borrowerName: req.body.borrower_name, borrowerPhone: req.body.borrower_phone || null,
        structure: req.body.structure, assetType: req.body.asset_type, assetDescription: req.body.asset_description || null,
        assetCost: cost, markup, totalPayable: round2(cost + markup), termMonths: req.body.term_months,
        createdById: req.user.id,
      },
    });
    res.status(201).json(serialize(f));
  } catch (err) { next(err); }
});

router.get('/', auth, async (req, res, next) => {
  try {
    const list = await prisma.assetFinance.findMany({
      where: { businessId: req.user.business_id, ...(req.query.status && { status: String(req.query.status) }) },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    res.json({ asset_finance: list.map(serialize) });
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const f = await prisma.assetFinance.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, include: { repayments: { orderBy: { createdAt: 'desc' } } } });
    if (!f) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json({ ...serialize(f), installment_estimate: round2(parseFloat(f.totalPayable) / f.termMonths) });
  } catch (err) { next(err); }
});

// Disburse: buy the asset, book the receivable + the disclosed markup as revenue.
router.post('/:id/disburse', auth, requireRole('owner'), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const out = await prisma.$transaction(async (tx) => {
      const f = await tx.assetFinance.findFirst({ where: { id: req.params.id, businessId } });
      if (!f) return { code: 404, error: 'Not found' };
      if (f.status !== 'offered') return { code: 400, error: 'Not in an offerable state' };
      const updated = await tx.assetFinance.update({ where: { id: f.id }, data: { status: 'active', disbursedAt: new Date() } });
      await accounting.postJournal(tx, {
        businessId, description: `Asset finance disbursed — ${f.reference}`,
        sourceType: 'asset_finance_disbursement', sourceId: f.id, createdById: req.user.id,
        lines: [
          { code: '1130', debit: parseFloat(f.totalPayable), credit: 0, description: 'Asset finance receivable' },
          { code: '1000', debit: 0, credit: parseFloat(f.assetCost), description: 'Asset purchased' },
          { code: '4000', debit: 0, credit: parseFloat(f.markup), description: 'Murabaha markup (disclosed profit)' },
        ],
      });
      return { finance: updated };
    });
    if (out.error) return res.status(out.code).json({ title: out.error, status: out.code });
    res.json(serialize(out.finance));
  } catch (err) { next(err); }
});

// Record a repayment (manual or, in production, auto-collected from the asset's
// earnings). Caps at the balance; settles when fully repaid.
router.post('/:id/repay', auth, requireRole('owner', 'manager'), validate(z.object({
  amount: z.coerce.number().positive(),
  method: z.string().max(30).default('cash'),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const out = await prisma.$transaction(async (tx) => {
      const f = await tx.assetFinance.findFirst({ where: { id: req.params.id, businessId } });
      if (!f) return { code: 404, error: 'Not found' };
      if (f.status !== 'active') return { code: 400, error: 'Finance is not active' };
      const remaining = round2(parseFloat(f.totalPayable) - parseFloat(f.amountRepaid));
      const pay = Math.min(round2(req.body.amount), remaining);
      if (pay <= 0) return { code: 400, error: 'Already settled' };
      const newRepaid = round2(parseFloat(f.amountRepaid) + pay);
      const settled = newRepaid >= parseFloat(f.totalPayable) - 0.001;
      await tx.assetFinanceRepayment.create({ data: { financeId: f.id, amount: pay, method: req.body.method } });
      const updated = await tx.assetFinance.update({ where: { id: f.id }, data: { amountRepaid: newRepaid, status: settled ? 'settled' : 'active', ...(settled && { settledAt: new Date() }) } });
      await accounting.postJournal(tx, {
        businessId, description: `Asset finance repayment — ${f.reference}`,
        sourceType: 'asset_finance_repayment', sourceId: f.id, createdById: req.user.id,
        lines: [
          { code: accounting.tenderAccountCode(req.body.method), debit: pay, credit: 0, description: 'Repayment received' },
          { code: '1130', debit: 0, credit: pay, description: 'Asset finance receivable' },
        ],
      });
      return { finance: updated, paid: pay, settled };
    });
    if (out.error) return res.status(out.code).json({ title: out.error, status: out.code });
    res.json({ message: out.settled ? 'Settled.' : 'Repayment recorded.', ...serialize(out.finance) });
  } catch (err) { next(err); }
});

// Default: the asset is repossessed; flag it (the receivable stays for recovery).
router.post('/:id/default', auth, requireRole('owner'), async (req, res, next) => {
  try {
    const f = await prisma.assetFinance.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!f) return res.status(404).json({ title: 'Not found', status: 404 });
    if (f.status !== 'active') return res.status(400).json({ title: 'Only an active finance can default', status: 400 });
    const updated = await prisma.assetFinance.update({ where: { id: f.id }, data: { status: 'defaulted', defaultedAt: new Date() } });
    res.json(serialize(updated));
  } catch (err) { next(err); }
});

module.exports = router;
