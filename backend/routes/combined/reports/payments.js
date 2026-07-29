// Payment reports: purchase payments, sell payments, and the payment-by-age
// pivot. "Age" is how long the money took to arrive — days from the document
// date (sale / purchase order) to the date the payment was made — so it reads
// as collection lag, not as an aging balance.
//
// Only settled money counts: sale payments must be `completed` (a pending or
// refunded tender is not cash received). The paid date is the payer-stated
// paid_on where present, else when the payment actually completed/was written.
const express = require('express');
const { Prisma } = require('@prisma/client');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_UUID_RE, plNum, plRound, plRange } = require('./_shared');

const router = express.Router();

// [key, minDaysInclusive, maxDaysExclusive|null]
const AGE_BUCKETS = [
  ['1-15', 0, 15], ['15-30', 15, 30], ['30-45', 30, 45], ['45-60', 45, 60],
  ['60-75', 60, 75], ['75-90', 75, 90], ['90+', 90, null],
];
const bucketOf = (days) => (AGE_BUCKETS.find(([, lo, hi]) => days >= lo && (hi === null || days < hi)) || AGE_BUCKETS[0])[0];

// Validate the optional UUID filters, returning null (and answering 400) on a
// malformed one.
function uuidFilters(req, res, keys) {
  const out = {};
  for (const k of keys) {
    const v = req.query[k] || null;
    if (v && !(typeof v === 'string' && PL_UUID_RE.test(v))) {
      res.status(400).json({ title: `${k} must be a UUID.`, status: 400 });
      return null;
    }
    out[k] = v;
  }
  return out;
}

// ── Purchase Payment report ──────────────────────────────────────────────────
router.get('/purchase-payments', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;
    const ids = uuidFilters(req, res, ['supplier_id']);
    if (!ids) return;

    // po_payments carries no business_id — scope through its purchase order.
    const rows = await prisma.$queryRaw`
      SELECT pp.id,
             pp.reference, pp.amount, pp.payment_method,
             COALESCE(pp.paid_at, pp.created_at) AS paid_on,
             po.po_number AS purchase, po.order_date AS document_date,
             s.name AS supplier, u.name AS user_name
      FROM po_payments pp
      JOIN purchase_orders po ON po.id = pp.po_id
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN users u ON u.id = pp.created_by
      WHERE po.business_id = ${bizId}::uuid
        AND COALESCE(pp.paid_at, pp.created_at) >= ${fromDate}
        AND COALESCE(pp.paid_at, pp.created_at) < ${toEnd}
        AND (${loc}::uuid IS NULL OR po.location_id = ${loc}::uuid)
        AND (${ids.supplier_id}::uuid IS NULL OR po.supplier_id = ${ids.supplier_id}::uuid)
      ORDER BY COALESCE(pp.paid_at, pp.created_at) DESC
      LIMIT 5000
    `;

    const out = rows.map(r => ({
      id: r.id,
      ref: r.reference || String(r.id).slice(0, 8).toUpperCase(),
      paid_on: r.paid_on,
      amount: plRound(plNum(r.amount)),
      supplier: r.supplier || '',
      payment_method: r.payment_method || '',
      purchase: r.purchase || '',
      user: r.user_name || '',
    }));
    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc, supplier_id: ids.supplier_id,
      rows: out,
      totals: { amount: plRound(out.reduce((s, r) => s + r.amount, 0)), count: out.length },
      limited: rows.length === 5000,
    });
  } catch (err) { next(err); }
});

// Shared sale-payment source for the sell-payment list and the age pivot.
//
// A POS credit sale writes a `credit` tender row of the FULL sale total even
// though nothing was collected (routes/sales.js sets amountPaid = 0 for it) —
// that row is a receivable, not cash, so it is excluded. The money actually
// collected against it arrives later as a credit-ledger repayment, which has
// no sale_payments row of its own, so those are unioned in. Invoice payments
// write BOTH a real tender row and a ledger twin, so the twin is excluded to
// avoid double counting.
function sellPaymentRows({ bizId, fromDate, toEnd, loc, ids, method }) {
  return prisma.$queryRaw(Prisma.sql`
    WITH src AS (
      -- Real tenders taken against a sale or invoice.
      SELECT sp.id, sp.provider AS payment_method, sp.amount,
             sp.provider_reference AS ref,
             COALESCE(sp.paid_on, sp.completed_at, sp.created_at) AS paid_on,
             COALESCE(s.sale_date, s.created_at) AS document_date,
             COALESCE(s.sale_number, LEFT(s.id::text, 8)) AS sell,
             s.customer_id, s.location_id, s.cashier_id AS user_id
      FROM sale_payments sp
      JOIN sales s ON s.id = sp.sale_id
      WHERE sp.business_id = ${bizId}::uuid
        AND sp.status = 'completed'
        AND sp.provider <> 'credit'
      UNION ALL
      -- Credit collected outside a sale document (the Credit repayment screen).
      -- Aged against the customer's oldest still-open sale at that time, since
      -- the repayment settles the oldest debt first.
      SELECT cl.id, COALESCE(cl.payment_method, '') AS payment_method, cl.amount,
             cl.reference AS ref,
             cl.created_at AS paid_on,
             COALESCE(oldest.doc, cl.created_at) AS document_date,
             '' AS sell,
             cl.customer_id, NULL::uuid AS location_id, cl.recorded_by AS user_id
      FROM credit_ledger cl
      LEFT JOIN LATERAL (
        SELECT MIN(COALESCE(s2.sale_date, s2.created_at)) AS doc
        FROM sales s2
        WHERE s2.business_id = ${bizId}::uuid AND s2.customer_id = cl.customer_id
          AND COALESCE(s2.sale_date, s2.created_at) <= cl.created_at
      ) oldest ON TRUE
      WHERE cl.business_id = ${bizId}::uuid
        AND cl.direction = 'credit'
        AND cl.type IN ('repayment', 'installment_payment', 'diaspora_payment')
        -- The invoice-payment ledger twin already has its own tender row above.
        AND cl.sale_id IS NULL
        AND COALESCE(cl.description, '') <> 'Invoice payment'
    )
    SELECT src.id, src.payment_method, src.amount, src.ref, src.paid_on,
           src.document_date, src.sell,
           src.customer_id, c.name AS customer,
           g.name AS customer_group,
           u.name AS user_name
    FROM src
    LEFT JOIN customers c ON c.id = src.customer_id
    LEFT JOIN customer_groups g ON g.id = c.customer_group_id
    LEFT JOIN users u ON u.id = src.user_id
    WHERE src.paid_on >= ${fromDate} AND src.paid_on < ${toEnd}
      -- A standalone repayment carries no location, so a location filter
      -- necessarily excludes it rather than guessing one.
      AND (${loc}::uuid IS NULL OR src.location_id = ${loc}::uuid)
      AND (${ids.customer_id}::uuid IS NULL OR src.customer_id = ${ids.customer_id}::uuid)
      AND (${ids.customer_group_id}::uuid IS NULL OR c.customer_group_id = ${ids.customer_group_id}::uuid)
      AND (${ids.user_id}::uuid IS NULL OR src.user_id = ${ids.user_id}::uuid)
      AND (${method}::text IS NULL OR src.payment_method = ${method})
    ORDER BY src.paid_on DESC
    LIMIT 20000
  `);
}

// Days between the document and the payment, floored at 0 — a payment taken
// with the sale is age 0, and clock skew must not produce a negative age.
const ageDays = (paidOn, docDate) => {
  if (!paidOn || !docDate) return 0;
  return Math.max(0, Math.floor((new Date(paidOn) - new Date(docDate)) / 86400000));
};

// ── Sell Payment report ──────────────────────────────────────────────────────
router.get('/sell-payments', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;
    const ids = uuidFilters(req, res, ['customer_id', 'customer_group_id', 'user_id']);
    if (!ids) return;
    const method = typeof req.query.payment_method === 'string' && req.query.payment_method ? req.query.payment_method : null;
    const age = req.query.age || null;
    if (age && !AGE_BUCKETS.some(([k]) => k === age)) {
      return res.status(400).json({ title: `age must be one of: ${AGE_BUCKETS.map(b => b[0]).join(', ')}.`, status: 400 });
    }

    const raw = await sellPaymentRows({ bizId, fromDate, toEnd, loc, ids, method });
    let out = raw.map(r => {
      const days = ageDays(r.paid_on, r.document_date);
      return {
        id: r.id,
        ref: r.ref || String(r.id).slice(0, 8).toUpperCase(),
        paid_on: r.paid_on,
        amount: plRound(plNum(r.amount)),
        age_days: days,
        age: bucketOf(days),
        customer: r.customer || 'Walk-In Customer',
        contact_id: r.customer_id ? 'CUS-' + String(r.customer_id).replace(/-/g, '').slice(0, 6).toUpperCase() : '',
        customer_group: r.customer_group || '',
        payment_method: r.payment_method || '',
        sell: r.sell || '',
        user: r.user_name || '',
      };
    });
    // The age bucket is derived, so it is filtered after the fact.
    if (age) out = out.filter(r => r.age === age);

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc, ...ids, payment_method: method, age,
      age_buckets: AGE_BUCKETS.map(b => b[0]),
      rows: out,
      totals: { amount: plRound(out.reduce((s, r) => s + r.amount, 0)), count: out.length },
      limited: raw.length === 20000,
    });
  } catch (err) { next(err); }
});

// ── Payment by Age (pivot) ───────────────────────────────────────────────────
router.get('/payment-by-age', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;
    const ids = uuidFilters(req, res, ['customer_id', 'user_id']);
    if (!ids) return;
    ids.customer_group_id = null;
    const method = typeof req.query.payment_method === 'string' && req.query.payment_method ? req.query.payment_method : null;
    const age = req.query.age || null;
    if (age && !AGE_BUCKETS.some(([k]) => k === age)) {
      return res.status(400).json({ title: `age must be one of: ${AGE_BUCKETS.map(b => b[0]).join(', ')}.`, status: 400 });
    }

    const raw = await sellPaymentRows({ bizId, fromDate, toEnd, loc, ids, method });
    const keys = AGE_BUCKETS.map(b => b[0]);
    const byRow = new Map();
    for (const r of raw) {
      const bucket = bucketOf(ageDays(r.paid_on, r.document_date));
      if (age && bucket !== age) continue;
      const customer = r.customer || 'Walk-In Customer';
      const pm = r.payment_method || '';
      const user = r.user_name || '';
      // Keyed by id, not name — two customers can share a display name.
      const k = `${r.customer_id || 'walkin'}|${pm}|${r.user_name || ''}`;
      let row = byRow.get(k);
      if (!row) {
        row = { customer, payment_method: pm, user, total: 0 };
        for (const b of keys) row[b] = 0;
        byRow.set(k, row);
      }
      const amt = plNum(r.amount);
      row[bucket] = plRound(row[bucket] + amt);
      row.total = plRound(row.total + amt);
    }
    const rows = [...byRow.values()].sort((a, b) => a.customer.localeCompare(b.customer));

    const totals = { total: plRound(rows.reduce((s, r) => s + r.total, 0)) };
    for (const b of keys) totals[b] = plRound(rows.reduce((s, r) => s + r[b], 0));

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc, ...ids, payment_method: method, age,
      age_buckets: keys,
      rows, totals,
      limited: raw.length === 20000,
    });
  } catch (err) { next(err); }
});

module.exports = router;
