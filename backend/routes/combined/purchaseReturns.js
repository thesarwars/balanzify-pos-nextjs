const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { auth, requireRole } = require('../../middleware/auth');
const { validate, validateQuery } = require('../../middleware/validate');
const { PurchaseReturnCreateSchema } = require('../../validation/schemas');
const { reverseLines, returnableForSupplier, allocate } = require('../../lib/purchaseReturnService');
const accounting = require('../../lib/accounting');

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
  // A standalone return can span purchases, so derive the parents from the lines.
  items: { select: { purchaseOrderItem: { select: { purchaseOrder: { select: { id: true, poNumber: true } } } } } },
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

// GET /api/v1/purchase-returns/returnable?supplier_id&location_id&search
// Products this supplier delivered to this location that can still be returned.
const ReturnableQuery = z.object({
  supplier_id: z.string().uuid(),
  location_id: z.string().uuid(),
  search: z.string().trim().max(100).optional(),
});
purchaseReturnsRouter.get('/returnable', auth, validateQuery(ReturnableQuery), async (req, res, next) => {
  try {
    const { supplier_id, location_id, search } = req.query;
    const products = await returnableForSupplier(req.user.business_id, supplier_id, location_id, search);
    res.json({ products });
  } catch (err) { next(err); }
});

// POST /api/v1/purchase-returns — standalone debit note (supplier + products).
// Each product's quantity is spread across that supplier's purchase lines oldest
// first, so the goods are always relieved at the cost they were received at.
purchaseReturnsRouter.post('/', auth, requireRole('owner', 'manager'), validate(PurchaseReturnCreateSchema), async (req, res, next) => {
  try {
    const { supplier_id, location_id, reference, notes, return_date, document_url, document_key, tax_rate_id, items } = req.body;
    const businessId = req.user.business_id;

    const supplier = await prisma.supplier.findFirst({ where: { id: supplier_id, businessId }, select: { id: true } });
    if (!supplier) return res.status(404).json({ title: 'Supplier not found', status: 404 });
    const location = await prisma.location.findFirst({ where: { id: location_id, businessId }, select: { id: true } });
    if (!location) return res.status(404).json({ title: 'Location not found', status: 404 });

    // Purchase tax is never taken from the client.
    let taxRate = 0;
    if (tax_rate_id) {
      const tr = await prisma.taxRate.findFirst({ where: { id: tax_rate_id, businessId, isActive: true }, select: { rate: true } });
      if (!tr) return res.status(400).json({ title: 'Tax rate not found', status: 400 });
      taxRate = parseFloat(tr.rate);
    }

    // Merge duplicate products, then resolve each to purchase lines.
    const wanted = new Map();
    for (const it of items) wanted.set(it.product_id, (wanted.get(it.product_id) || 0) + it.quantity);

    const returnable = await returnableForSupplier(businessId, supplier_id, location_id);
    const byProduct = new Map(returnable.map((p) => [p.product_id, p]));

    const picks = [];
    for (const [productId, qty] of wanted) {
      const entry = byProduct.get(productId);
      if (!entry) {
        return res.status(400).json({ title: 'That product has nothing left to return to this supplier at this location.', status: 400 });
      }
      picks.push(...allocate(entry.name, qty, entry.candidates));
    }

    const poItems = await prisma.purchaseOrderItem.findMany({
      where: { id: { in: picks.map((p) => p.po_item_id) } },
      include: { unit: true, purchaseOrder: { select: { id: true, poNumber: true, locationId: true, businessId: true } } },
    });
    const lineById = new Map(poItems.map((i) => [i.id, i]));
    if (poItems.some((i) => i.purchaseOrder.businessId !== businessId)) {
      return res.status(400).json({ title: 'Not found', status: 400 });
    }
    const entries = picks.map((p) => ({ line: lineById.get(p.po_item_id), qty: p.qty }));

    const created = await prisma.$transaction(async (tx) => {
      const { subtotal, returnItemsData } = await reverseLines(tx, { businessId, userId: req.user.id, entries });

      // Purchase tax mirrors how a purchase books it: recorded on the document
      // and in the total, but never posted to the ledger — receiving posts AP and
      // Inventory tax-exclusive, so crediting tax here would unbalance the GL.
      const taxAmount = +(subtotal * taxRate).toFixed(2);
      const totalAmount = +(subtotal + taxAmount).toFixed(2);

      // Only claim a single parent when every line came from the same purchase.
      const poIds = [...new Set(entries.map((e) => e.line.poId))];
      const parentPoId = poIds.length === 1 ? poIds[0] : null;

      const ret = await tx.purchaseReturn.create({
        data: {
          businessId, poId: parentPoId, supplierId: supplier_id, locationId: location_id,
          returnNumber: `PRET-${Date.now()}`, reference: reference || null,
          returnDate: return_date ? new Date(return_date) : new Date(),
          subtotal, taxAmount, totalAmount, notes: notes || null,
          documentUrl: document_url || null, documentKey: document_key || null,
          createdById: req.user.id,
          items: { create: returnItemsData },
        },
        include: { items: true },
      });

      if (subtotal > 0) {
        await tx.supplier.update({ where: { id: supplier_id }, data: { outstandingBalance: { decrement: subtotal } } });
        await accounting.postJournal(tx, {
          businessId,
          description: `Purchase return — ${ret.returnNumber}`,
          sourceType: 'purchase_return', sourceId: ret.id, createdById: req.user.id,
          lines: [
            { code: '2000', debit: subtotal, credit: 0, description: 'Accounts payable reduced' },
            { code: '1200', debit: 0, credit: subtotal, description: 'Inventory returned to supplier' },
          ],
        });
      }
      return ret;
    });

    res.status(201).json(created);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ title: err.message, status: err.statusCode });
    next(err);
  }
});

purchaseReturnsRouter.get('/:id', auth, async (req, res, next) => {
  try {
    const ret = await prisma.purchaseReturn.findUnique({
      where: { id: req.params.id },
      include: {
        ...LIST_INCLUDE,
        supplier: true,
        items: { include: { product: { select: { name: true, sku: true } }, purchaseOrderItem: { select: { purchaseOrder: { select: { id: true, poNumber: true } } } } } },
        purchaseOrder: { select: { id: true, poNumber: true, orderDate: true } },
      },
    });
    if (!ret || ret.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(ret);
  } catch (err) { next(err); }
});

module.exports = { purchaseReturnsRouter };
