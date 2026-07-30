/**
 * Commission resolution.
 *
 * A user's commission is a tiered band table — "sell between FROM and TO and
 * you earn PERCENT" — with several bands per user. Before this it was a single
 * flat percent on the user, which is just the degenerate one-band case, so that
 * value stays as the fallback for anyone with no bands configured.
 *
 * Three call sites price commission (the HRM employee profile, the commission
 * report and the Sales Representative report); they all resolve through here so
 * they cannot drift apart.
 */
const prisma = require('./prisma');

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => +(Math.round(n * 100) / 100).toFixed(2);

/** userId -> bands, ascending by lower bound. One query for a whole report. */
async function loadBands(businessId) {
  const rows = await prisma.salesTargetBand.findMany({
    where: { businessId }, orderBy: { fromAmount: 'asc' },
  });
  const map = new Map();
  for (const b of rows) {
    if (!map.has(b.userId)) map.set(b.userId, []);
    map.get(b.userId).push({
      from: num(b.fromAmount),
      to: b.toAmount == null ? null : num(b.toAmount),
      percent: num(b.commissionPercent),
    });
  }
  return map;
}

/**
 * The percent that applies to `total`.
 *
 * Bands are inclusive of both bounds — an operator entering 0–1000 and
 * 1000–5000 means "1000 is the top of the first", so the FIRST match wins and
 * bands are held in ascending order. A null upper bound is open-ended. With no
 * band covering the total (e.g. it falls below the lowest band) the flat
 * percent applies, which keeps a partially-configured user paying something
 * sensible rather than zero.
 */
function percentFor(bands, total, flatPercent = 0) {
  if (!bands || !bands.length) return num(flatPercent);
  const t = num(total);
  for (const b of bands) {
    if (t >= b.from && (b.to == null || t <= b.to)) return b.percent;
  }
  return num(flatPercent);
}

/** { percent, commission } for a sales total. */
function commissionFor(bands, total, flatPercent = 0) {
  const percent = percentFor(bands, total, flatPercent);
  return { percent, commission: round2(num(total) * percent / 100) };
}

/** Single-user convenience — loads only that user's bands. */
async function commissionForUser(businessId, userId, total, flatPercent = 0) {
  if (!userId) return { percent: num(flatPercent), commission: 0 };
  const rows = await prisma.salesTargetBand.findMany({
    where: { businessId, userId }, orderBy: { fromAmount: 'asc' },
  });
  const bands = rows.map(b => ({
    from: num(b.fromAmount),
    to: b.toAmount == null ? null : num(b.toAmount),
    percent: num(b.commissionPercent),
  }));
  return commissionFor(bands, total, flatPercent);
}

module.exports = { loadBands, percentFor, commissionFor, commissionForUser, round2 };
