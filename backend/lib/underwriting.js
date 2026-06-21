/**
 * Underwriting engine — the lending moat.
 *
 * Reads the business's own general ledger (the data no bank has) and produces an
 * explainable credit-scoring assessment + a recommended working-capital limit.
 * The merchant's cashflow underwrites the merchant.
 *
 * Scoring is transparent and tunable: four weighted factors (revenue, margin,
 * history, leverage) → a 0–100 score → a limit sized to recent monthly revenue.
 */
const prisma = require('./prisma');
const { accountBalances } = require('./accounting');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const ymd = (d) => d.toISOString().slice(0, 10);

// Tunable model parameters.
const WINDOW_DAYS        = 90;
const REVENUE_REF        = 2000;   // monthly revenue at which the revenue factor maxes out
const MARGIN_REF         = 0.20;   // net margin at which the margin factor maxes out
const HISTORY_REF_MONTHS = 12;     // months active at which the history factor maxes out
const ELIGIBILITY_SCORE  = 35;     // minimum score to pre-qualify

async function assess(businessId) {
  const now  = new Date();
  const from = ymd(new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const to   = ymd(now);

  const [period, allTime, biz] = await Promise.all([
    accountBalances(businessId, { from, to }),
    accountBalances(businessId, {}),
    prisma.business.findUnique({ where: { id: businessId }, select: { createdAt: true, currency: true } }),
  ]);

  const sum = (accts, pred) => accts.filter(pred).reduce((s, a) => s + a.balance, 0);

  const revenue90   = sum(period, a => a.type === 'revenue');
  const expense90   = sum(period, a => a.type === 'expense');
  const netProfit90 = revenue90 - expense90;
  const avgMonthly  = round2(revenue90 / (WINDOW_DAYS / 30));
  const margin      = revenue90 > 0 ? netProfit90 / revenue90 : 0;

  const cash     = sum(allTime, a => ['1000', '1010', '1020'].includes(a.code));
  const payables = allTime.find(a => a.code === '2000')?.balance || 0;
  const monthsActive = biz ? (now - new Date(biz.createdAt)) / (30 * 24 * 60 * 60 * 1000) : 0;
  const currency = biz?.currency || 'USD';

  // ── Score (0–100), four explainable weighted factors ──────────────────────
  const revenueScore  = clamp(avgMonthly / REVENUE_REF, 0, 1) * 40;
  const marginScore   = clamp(margin / MARGIN_REF, 0, 1) * 30;
  const historyScore  = clamp(monthsActive / HISTORY_REF_MONTHS, 0, 1) * 15;
  const leverageRatio = payables / Math.max(avgMonthly, 1);
  const leverageScore = clamp(1 - leverageRatio / 3, 0, 1) * 15;
  const score = Math.round(revenueScore + marginScore + historyScore + leverageScore);

  const eligible = avgMonthly > 0 && score >= ELIGIBILITY_SCORE;
  // Limit is sized to recent monthly revenue, scaled by the score.
  const recommendedLimit = eligible ? round2(avgMonthly * (score / 100)) : 0;

  const reasons = [];
  if (avgMonthly <= 0)     reasons.push('No recent sales to underwrite against.');
  if (margin < 0)          reasons.push('Operating at a loss over the period.');
  if (leverageRatio > 2)   reasons.push('Supplier debt is high relative to revenue.');
  if (monthsActive < 1)    reasons.push('Limited trading history — thin file.');
  if (eligible)            reasons.push(`Pre-qualified for up to ${currency} ${recommendedLimit} based on cashflow.`);
  else if (avgMonthly > 0) reasons.push('Cashflow does not yet support an offer; keep trading to qualify.');

  return {
    eligible,
    score,
    recommended_limit: recommendedLimit,
    currency,
    signals: {
      avg_monthly_revenue: avgMonthly,
      net_margin:          round2(margin),
      cash_on_hand:        round2(cash),
      payables:            round2(payables),
      months_active:       round2(monthsActive),
      period_revenue:      round2(revenue90),
      period_net_profit:   round2(netProfit90),
    },
    factors: {
      revenue:  round2(revenueScore),
      margin:   round2(marginScore),
      history:  round2(historyScore),
      leverage: round2(leverageScore),
    },
    reasons,
  };
}

module.exports = { assess };
