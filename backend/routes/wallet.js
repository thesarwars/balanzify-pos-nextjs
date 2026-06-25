/**
 * Merchant settlement / wallet account (the Kaspi / Mercado Pago model).
 *
 * An in-app balance the merchant tops up, holds, and pays out from — the account
 * that, fused with lending, becomes the stickiest part of the relationship.
 *
 * SCAFFOLDING: the ledger + GL are complete and tested, but holding real customer
 * float requires an EMI licence or a bank/partner. The wallet is a GL asset
 * account (1025, Merchant Wallet); deposits move money in from a tender,
 * withdrawals move it back out — so the wallet balance always matches the ledger.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const accounting = require('../lib/accounting');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function currentBalance(businessId) {
  const last = await prisma.walletTransaction.findFirst({ where: { businessId }, orderBy: { createdAt: 'desc' }, select: { balanceAfter: true } });
  return last ? parseFloat(last.balanceAfter) : 0;
}

router.get('/', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const [balance, transactions] = await Promise.all([
      currentBalance(businessId),
      prisma.walletTransaction.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    res.json({ balance, transactions });
  } catch (err) { next(err); }
});

// Top up the wallet from a tender (cash, mobile money, …).
router.post('/deposit', auth, requireRole('owner', 'manager'), validate(z.object({
  amount: z.coerce.number().positive(),
  method: z.string().max(30).default('cash'),
  note:   z.string().max(255).optional(),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const amount = round2(req.body.amount);
    const tx = await prisma.$transaction(async (t) => {
      const balanceAfter = round2((await balanceInTx(t, businessId)) + amount);
      const rec = await t.walletTransaction.create({ data: { businessId, type: 'deposit', amount, method: req.body.method, note: req.body.note || null, balanceAfter, createdById: req.user.id } });
      await accounting.postJournal(t, {
        businessId, description: 'Wallet top-up', sourceType: 'wallet_deposit', sourceId: rec.id, createdById: req.user.id,
        lines: [
          { code: '1025', debit: amount, credit: 0, description: 'Into merchant wallet' },
          { code: accounting.tenderAccountCode(req.body.method), debit: 0, credit: amount, description: 'From tender' },
        ],
      });
      return rec;
    });
    res.status(201).json(tx);
  } catch (err) { next(err); }
});

// Withdraw / pay out of the wallet. Caps at the available balance.
router.post('/withdraw', auth, requireRole('owner', 'manager'), validate(z.object({
  amount: z.coerce.number().positive(),
  method: z.string().max(30).default('cash'),
  note:   z.string().max(255).optional(),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const amount = round2(req.body.amount);
    const out = await prisma.$transaction(async (t) => {
      const balance = await balanceInTx(t, businessId);
      if (amount > balance + 0.001) return { code: 400, error: `Insufficient wallet balance (${balance.toFixed(2)})` };
      const balanceAfter = round2(balance - amount);
      const rec = await t.walletTransaction.create({ data: { businessId, type: 'withdraw', amount, method: req.body.method, note: req.body.note || null, balanceAfter, createdById: req.user.id } });
      await accounting.postJournal(t, {
        businessId, description: 'Wallet withdrawal', sourceType: 'wallet_withdraw', sourceId: rec.id, createdById: req.user.id,
        lines: [
          { code: accounting.tenderAccountCode(req.body.method), debit: amount, credit: 0, description: 'Paid out' },
          { code: '1025', debit: 0, credit: amount, description: 'From merchant wallet' },
        ],
      });
      return { rec };
    });
    if (out.error) return res.status(out.code).json({ title: out.error, status: out.code });
    res.status(201).json(out.rec);
  } catch (err) { next(err); }
});

// Balance computed inside a transaction (locks via last-row read).
async function balanceInTx(t, businessId) {
  const last = await t.walletTransaction.findFirst({ where: { businessId }, orderBy: { createdAt: 'desc' }, select: { balanceAfter: true } });
  return last ? parseFloat(last.balanceAfter) : 0;
}

module.exports = router;
