/**
 * Accounting / General Ledger routes.
 *
 * GET /api/v1/accounting/accounts       — chart of accounts
 * GET /api/v1/accounting/journal        — recent journal entries (with lines)
 * GET /api/v1/accounting/trial-balance  — per-account debit/credit + net balance
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { accountBalances, postJournal, ensureChart } = require('../lib/accounting');
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

const sumType = (accts, type) => parseFloat(accts.filter(a => a.type === type).reduce((s, a) => s + a.balance, 0).toFixed(2));

// GET /api/v1/accounting/income-statement?from=&to=  (P&L for a period)
router.get('/income-statement', auth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const accts = await accountBalances(req.user.business_id, { from, to });
    const revenue = sumType(accts, 'revenue');
    const cogs    = accts.find(a => a.code === '5000')?.balance || 0;
    const expenseTotal = sumType(accts, 'expense');
    const operatingExpenses = parseFloat((expenseTotal - cogs).toFixed(2));
    const grossProfit = parseFloat((revenue - cogs).toFixed(2));
    const netProfit   = parseFloat((revenue - expenseTotal).toFixed(2));
    res.json({
      period: { from: from || null, to: to || null },
      revenue,
      cogs,
      gross_profit: grossProfit,
      operating_expenses: operatingExpenses,
      net_profit: netProfit,
      expense_accounts: accts.filter(a => a.type === 'expense' && a.balance !== 0),
      revenue_accounts: accts.filter(a => a.type === 'revenue' && a.balance !== 0),
    });
  } catch (err) { next(err); }
});

// GET /api/v1/accounting/balance-sheet?as_of=  (financial position)
router.get('/balance-sheet', auth, async (req, res, next) => {
  try {
    const asOf = req.query.as_of || null;
    const accts = await accountBalances(req.user.business_id, { to: asOf });
    const assets      = sumType(accts, 'asset');
    const liabilities = sumType(accts, 'liability');
    const equityPosted = sumType(accts, 'equity');
    // Retained earnings = net income (revenue − expenses) flows into equity.
    const netIncome = parseFloat((sumType(accts, 'revenue') - sumType(accts, 'expense')).toFixed(2));
    const equity = parseFloat((equityPosted + netIncome).toFixed(2));
    res.json({
      as_of: asOf,
      assets,
      liabilities,
      equity,
      retained_earnings: netIncome,
      asset_accounts:     accts.filter(a => a.type === 'asset'     && a.balance !== 0),
      liability_accounts: accts.filter(a => a.type === 'liability' && a.balance !== 0),
      balanced: Math.abs(assets - (liabilities + equity)) < 0.01,
    });
  } catch (err) { next(err); }
});

// POST /api/v1/accounting/journal — post a manual, balanced journal entry.
// For accountant adjustments/corrections the automated postings can't express.
router.post('/journal', auth, requireRole('owner', 'manager'), validate(z.object({
  date: z.string().optional(),
  description: z.string().trim().min(1).max(255),
  lines: z.array(z.object({
    code: z.string().trim().min(1).max(20),
    debit: z.coerce.number().min(0).default(0),
    credit: z.coerce.number().min(0).default(0),
    description: z.string().max(255).optional().nullable(),
  })).min(2),
})), async (req, res, next) => {
  try {
    const lines = req.body.lines.filter(l => (l.debit || 0) !== 0 || (l.credit || 0) !== 0);
    if (lines.length < 2) return res.status(400).json({ title: 'A journal needs at least two non-zero lines', status: 400 });
    const td = +lines.reduce((s, l) => s + (l.debit || 0), 0).toFixed(2);
    const tc = +lines.reduce((s, l) => s + (l.credit || 0), 0).toFixed(2);
    if (Math.abs(td - tc) > 0.01) return res.status(400).json({ title: `Unbalanced: debits ${td} ≠ credits ${tc}`, status: 400 });

    const entry = await prisma.$transaction(async (tx) => {
      await ensureChart(tx, req.user.business_id); // seed/backfill so codes resolve
      // All referenced codes must exist in this business's chart.
      const codes = [...new Set(lines.map(l => l.code))];
      const present = new Set((await tx.account.findMany({ where: { businessId: req.user.business_id, code: { in: codes } }, select: { code: true } })).map(a => a.code));
      const missing = codes.filter(c => !present.has(c));
      if (missing.length) throw Object.assign(new Error(`Unknown account code(s): ${missing.join(', ')}`), { statusCode: 400 });
      return postJournal(tx, {
        businessId: req.user.business_id,
        date: req.body.date ? new Date(req.body.date) : new Date(),
        description: req.body.description, sourceType: 'manual', createdById: req.user.id, lines,
      });
    });
    res.status(201).json(entry);
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ title: err.message, status: 400 });
    next(err);
  }
});

// GET /api/v1/accounting/aging — accounts-receivable aging from the credit ledger.
// Open charges (debits) are aged by date; payments (credits) are applied FIFO to
// the oldest charges, and the remaining open amount is bucketed 0-30/31-60/61-90/90+.
router.get('/aging', auth, async (req, res, next) => {
  try {
    const ledger = await prisma.creditLedger.findMany({
      where: { businessId: req.user.business_id },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const byCust = {};
    for (const e of ledger) {
      const c = (byCust[e.customerId] ||= { name: e.customer?.name || '—', charges: [], payments: 0 });
      const amt = parseFloat(e.amount);
      if (e.direction === 'debit') c.charges.push({ date: e.createdAt, amount: amt });
      else c.payments += amt;
    }

    const now = Date.now();
    const bucketKey = (days) => days <= 30 ? 'b0_30' : days <= 60 ? 'b31_60' : days <= 90 ? 'b61_90' : 'b90_plus';
    const empty = () => ({ b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, total: 0 });
    const totals = empty();
    const customers = [];

    for (const [cid, c] of Object.entries(byCust)) {
      let pay = c.payments;
      const b = empty();
      for (const ch of c.charges) {
        let remaining = ch.amount;
        if (pay > 0) { const used = Math.min(pay, remaining); remaining -= used; pay -= used; }
        if (remaining <= 0.001) continue;
        const days = Math.floor((now - new Date(ch.date).getTime()) / 86400000);
        const k = bucketKey(days);
        b[k] = +(b[k] + remaining).toFixed(2);
        b.total = +(b.total + remaining).toFixed(2);
      }
      if (b.total <= 0.001) continue;
      customers.push({ customer_id: cid, customer_name: c.name, ...b });
      for (const k of Object.keys(totals)) totals[k] = +(totals[k] + b[k]).toFixed(2);
    }

    customers.sort((x, y) => y.total - x.total);
    res.json({ as_of: new Date().toISOString().slice(0, 10), buckets: ['b0_30', 'b31_60', 'b61_90', 'b90_plus'], customers, totals });
  } catch (err) { next(err); }
});

module.exports = router;
