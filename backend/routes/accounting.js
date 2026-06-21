/**
 * Accounting / General Ledger routes.
 *
 * GET /api/v1/accounting/accounts       — chart of accounts
 * GET /api/v1/accounting/journal        — recent journal entries (with lines)
 * GET /api/v1/accounting/trial-balance  — per-account debit/credit + net balance
 */
const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.get('/accounts', auth, async (req, res, next) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { businessId: req.user.business_id },
      orderBy: { code: 'asc' },
    });
    res.json({ accounts });
  } catch (err) { next(err); }
});

router.get('/journal', auth, async (req, res, next) => {
  try {
    const entries = await prisma.journalEntry.findMany({
      where: { businessId: req.user.business_id },
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ entries });
  } catch (err) { next(err); }
});

router.get('/trial-balance', auth, async (req, res, next) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT a.code, a.name, a.type, a.normal_balance,
        COALESCE(SUM(jl.debit), 0)  AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      WHERE a.business_id = ${req.user.business_id}::uuid
      GROUP BY a.code, a.name, a.type, a.normal_balance
      ORDER BY a.code
    `;
    const accounts = rows.map(r => {
      const debit = parseFloat(r.total_debit), credit = parseFloat(r.total_credit);
      const balance = r.normal_balance === 'debit' ? debit - credit : credit - debit;
      return { code: r.code, name: r.name, type: r.type, debit, credit, balance: parseFloat(balance.toFixed(2)) };
    });
    const totalDebit  = parseFloat(accounts.reduce((s, a) => s + a.debit, 0).toFixed(2));
    const totalCredit = parseFloat(accounts.reduce((s, a) => s + a.credit, 0).toFixed(2));
    res.json({
      accounts,
      totals: { debit: totalDebit, credit: totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 },
    });
  } catch (err) { next(err); }
});

module.exports = router;
