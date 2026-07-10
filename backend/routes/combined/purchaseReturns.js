const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { auth } = require('../../middleware/auth');
const { validateQuery } = require('../../middleware/validate');

// ── Purchase returns, across every purchase ──────────────────────────────────
// Returns are always created against their parent purchase (that is what pins
// the cost basis) — see POST /purchase-orders/:id/returns. This router is the
// cross-purchase list + detail view of them.
const purchaseReturnsRouter = express.Router();

const ListQuery = z.object({
  supplier_id: z.string().uuid().optional(),
  location_id: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().max(100).optional(),
});

const LIST_INCLUDE = {
  supplier: { select: { name: true } },
  location: { select: { name: true } },
  purchaseOrder: { select: { id: true, poNumber: true } },
  createdBy: { select: { name: true } },
  _count: { select: { items: true } },
};

purchaseReturnsRouter.get('/', auth, validateQuery(ListQuery), async (req, res, next) => {
  try {
    const { supplier_id, location_id, from, to, search } = req.query;

    // `to` is an inclusive calendar day; returnDate is a @db.Date.
    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const where = {
      businessId: req.user.business_id,
      ...(supplier_id && { supplierId: supplier_id }),
      ...(location_id && { locationId: location_id }),
      ...(Object.keys(dateFilter).length && { returnDate: dateFilter }),
      ...(search && {
        OR: [
          { returnNumber: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
          { purchaseOrder: { poNumber: { contains: search, mode: 'insensitive' } } },
          { supplier: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const returns = await prisma.purchaseReturn.findMany({
      where, include: LIST_INCLUDE, orderBy: { returnDate: 'desc' },
    });

    // Totals for the footer row — of the filtered set, not the page.
    const total = returns.reduce((s, r) => s + parseFloat(r.totalAmount), 0);
    res.json({ returns, totals: { count: returns.length, grand_total: +total.toFixed(2) } });
  } catch (err) { next(err); }
});

purchaseReturnsRouter.get('/:id', auth, async (req, res, next) => {
  try {
    const ret = await prisma.purchaseReturn.findUnique({
      where: { id: req.params.id },
      include: {
        ...LIST_INCLUDE,
        supplier: true,
        items: { include: { product: { select: { name: true, sku: true } } } },
        purchaseOrder: { select: { id: true, poNumber: true, orderDate: true } },
      },
    });
    if (!ret || ret.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(ret);
  } catch (err) { next(err); }
});

module.exports = { purchaseReturnsRouter };
