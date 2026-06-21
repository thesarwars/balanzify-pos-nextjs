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
const { accountBalances } = require('../lib/accounting');
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

module.exports = router;
