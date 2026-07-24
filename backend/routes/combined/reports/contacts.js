

const express = require('express');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_POSTED, PL_DATE_RE, PL_UUID_RE, plNum, plRound, plParseDay, plRange } = require('./_shared');

const router = express.Router();

// ── Supplier & Customer report ───────────────────────────────────────────────
// One row per contact: what they bought from us and sent back, what we bought
// from them and returned, their opening balance and the net position.
// "Due" is receivable − payable for that contact, so a supplier we still owe
// reads negative — the same convention as the Purchase & Sale report's
// due_amount. Sales with no customer roll up into one Walk-In Customer row.
router.get('/contacts', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    const type = req.query.type || 'all';
    if (!['all', 'customer', 'supplier'].includes(type)) {
      return res.status(400).json({ title: 'type must be all, customer or supplier.', status: 400 });
    }
    const group = req.query.group_id || null;
    const contact = req.query.contact_id || null;
    for (const [k, v] of [['group_id', group], ['contact_id', contact]]) {
      if (v && !(typeof v === 'string' && PL_UUID_RE.test(v))) {
        return res.status(400).json({ title: `${k} must be a UUID.`, status: 400 });
      }
    }
    if (group && type === 'supplier') {
      return res.status(400).json({ title: 'A customer group filter cannot be combined with type=supplier.', status: 400 });
    }
    const wantCustomers = type === 'all' || type === 'customer';
    const wantSuppliers = type === 'all' || type === 'supplier';

    const [customers, suppliers, sales, refunds, purchases, purchaseReturns, walkIn] = await Promise.all([
      wantCustomers ? prisma.customer.findMany({
        where: {
          businessId: bizId,
          ...(group && { customerGroupId: group }),
          ...(contact && { id: contact }),
        },
        select: { id: true, name: true, openingBalance: true, customerGroupId: true, customerGroup: { select: { name: true } } },
      }) : [],
      // A customer-group filter is a customer-only concept — it excludes suppliers.
      (wantSuppliers && !group) ? prisma.supplier.findMany({
        where: { businessId: bizId, ...(contact && { id: contact }) },
        select: { id: true, name: true, contactPerson: true, openingBalance: true },
      }) : [],
      prisma.$queryRaw`
        SELECT s.customer_id AS id,
               SUM(s.total_amount)::numeric AS total,
               SUM(s.amount_due)::numeric AS due
        FROM sales s
        WHERE s.business_id = ${bizId}::uuid
          AND s.status IN ('completed', 'refunded', 'partially_refunded')
          AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
          AND s.customer_id IS NOT NULL
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
        GROUP BY s.customer_id
      `,
      prisma.$queryRaw`
        SELECT s.customer_id AS id, SUM(r.total_refunded)::numeric AS total
        FROM refunds r JOIN sales s ON s.id = r.sale_id
        WHERE r.business_id = ${bizId}::uuid
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
          AND s.customer_id IS NOT NULL
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
        GROUP BY s.customer_id
      `,
      // Purchase due mirrors the Purchase & Sale report: received landed value
      // minus returns minus payments, clamped per order.
      prisma.$queryRaw`
        SELECT po.supplier_id AS id,
               SUM(po.total_amount)::numeric AS total,
               SUM(GREATEST(
                 COALESCE((SELECT SUM(cl.quantity_received * cl.unit_cost) FROM cost_layers cl WHERE cl.po_id = po.id), 0)
                 - COALESCE((SELECT SUM(pr.total_amount) FROM purchase_returns pr WHERE pr.po_id = po.id), 0)
                 - po.amount_paid, 0))::numeric AS due
        FROM purchase_orders po
        WHERE po.business_id = ${bizId}::uuid
          AND po.status IN ('partial', 'received')
          AND po.order_date >= ${fromDate} AND po.order_date < ${toEnd}
          AND po.supplier_id IS NOT NULL
          AND (${loc}::uuid IS NULL OR po.location_id = ${loc}::uuid)
        GROUP BY po.supplier_id
      `,
      prisma.$queryRaw`
        SELECT pr.supplier_id AS id, SUM(pr.total_amount)::numeric AS total
        FROM purchase_returns pr
        WHERE pr.business_id = ${bizId}::uuid
          AND pr.return_date >= ${fromDate} AND pr.return_date < ${toEnd}
          AND pr.supplier_id IS NOT NULL
          AND (${loc}::uuid IS NULL OR pr.location_id = ${loc}::uuid)
        GROUP BY pr.supplier_id
      `,
      // Walk-in sales carry no contact, so they aggregate into a single row —
      // only when the view isn't pinned to one named contact or group.
      (wantCustomers && !contact && !group) ? prisma.$queryRaw`
        SELECT SUM(s.total_amount)::numeric AS total, SUM(s.amount_due)::numeric AS due,
               COALESCE((
                 SELECT SUM(r.total_refunded) FROM refunds r JOIN sales s2 ON s2.id = r.sale_id
                 WHERE r.business_id = ${bizId}::uuid AND s2.customer_id IS NULL
                   AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
                   AND (${loc}::uuid IS NULL OR s2.location_id = ${loc}::uuid)
               ), 0)::numeric AS returned
        FROM sales s
        WHERE s.business_id = ${bizId}::uuid
          AND s.status IN ('completed', 'refunded', 'partially_refunded')
          AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
          AND s.customer_id IS NULL
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      ` : [],
    ]);

    const byId = (rows) => new Map(rows.map(r => [r.id, r]));
    const saleBy = byId(sales), refundBy = byId(refunds);
    const poBy = byId(purchases), prBy = byId(purchaseReturns);

    const rows = [];
    for (const c of customers) {
      const s = saleBy.get(c.id), rf = refundBy.get(c.id);
      const saleTotal = plRound(plNum(s?.total)), saleDue = plRound(plNum(s?.due));
      rows.push({
        id: c.id, kind: 'customer', name: c.name,
        group: c.customerGroup?.name || null,
        purchase: 0, purchase_return: 0,
        sale: saleTotal, sell_return: plRound(plNum(rf?.total)),
        opening_balance: plRound(plNum(c.openingBalance)),
        due: saleDue,
      });
    }
    for (const sp of suppliers) {
      const p = poBy.get(sp.id), pr = prBy.get(sp.id);
      const purchaseDue = plRound(plNum(p?.due));
      rows.push({
        id: sp.id, kind: 'supplier',
        name: sp.contactPerson ? `${sp.contactPerson}, ${sp.name}` : sp.name,
        group: null,
        purchase: plRound(plNum(p?.total)), purchase_return: plRound(plNum(pr?.total)),
        sale: 0, sell_return: 0,
        // Both money columns follow one convention — receivable positive,
        // payable negative — so a supplier's seeded payable reads negative and
        // the column totals mean something when both kinds are listed.
        opening_balance: plRound(-plNum(sp.openingBalance)),
        due: plRound(-purchaseDue),
      });
    }
    const w = walkIn[0];
    if (w) {
      rows.push({
        id: null, kind: 'customer', name: 'Walk-In Customer', group: null,
        purchase: 0, purchase_return: 0,
        sale: plRound(plNum(w.total)), sell_return: plRound(plNum(w.returned)),
        opening_balance: 0, due: plRound(plNum(w.due)),
      });
    }

    // Contacts with no activity and no balance in the period add only noise.
    const active = rows.filter(r => r.purchase || r.purchase_return || r.sale || r.sell_return || r.opening_balance || r.due);
    active.sort((a, b) => a.name.localeCompare(b.name));

    const sum = (k) => plRound(active.reduce((s, r) => s + r[k], 0));
    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc, type, group_id: group, contact_id: contact,
      rows: active,
      totals: {
        purchase: sum('purchase'), purchase_return: sum('purchase_return'),
        sale: sum('sale'), sell_return: sum('sell_return'),
        opening_balance: sum('opening_balance'), due: sum('due'),
        count: active.length,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
