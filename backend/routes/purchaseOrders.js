const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { PurchaseOrderSchema, POStatusSchema, POPaymentSchema } = require('../validation/schemas');
const accounting = require('../lib/accounting');
const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { status, supplier_id } = req.query;
    const orders = await prisma.purchaseOrder.findMany({
      where: {
        businessId: req.user.business_id,
        ...(status && { status }),
        ...(supplier_id && { supplierId: supplier_id }),
      },
      include: {
        supplier: { select: { name: true } },
        location: { select: { name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders });
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        location: { select: { name: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
        payments: { include: { createdBy: { select: { name: true } } } },
        goodsReceivedNotes: true,
        approvedBy: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
    if (!po || po.businessId !== req.user.business_id) {
      return res.status(404).json({ title: 'Not found', status: 404 });
    }
    res.json(po);
  } catch (err) { next(err); }
});

router.post('/', auth, requireRole('owner', 'manager'), validate(PurchaseOrderSchema), async (req, res, next) => {
  try {
    const { supplier_id, location_id, items, expected_delivery, freight_cost, customs_duty, other_charges, payment_terms, notes, currency } = req.body;
    const subtotal = items.reduce((s, i) => s + i.unit_price * i.ordered_qty, 0);
    const totalAmount = subtotal + (freight_cost || 0) + (customs_duty || 0) + (other_charges || 0);

    const po = await prisma.purchaseOrder.create({
      data: {
        businessId: req.user.business_id,
        supplierId: supplier_id,
        locationId: location_id || null,
        poNumber: `PO-${Date.now()}`,
        expectedDelivery: expected_delivery ? new Date(expected_delivery) : null,
        subtotal,
        freightCost: freight_cost || 0,
        customsDuty: customs_duty || 0,
        otherCharges: other_charges || 0,
        totalAmount,
        currency: currency || 'USD',
        paymentTerms: payment_terms || 0,
        notes: notes || null,
        createdById: req.user.id,
        items: {
          create: items.map(item => ({
            productId: item.product_id,
            orderedQty: item.ordered_qty,
            unitPrice: item.unit_price,
            totalPrice: item.unit_price * item.ordered_qty,
            expiryDate: item.expiry_date ? new Date(item.expiry_date) : null,
            batchNumber: item.batch_number || null,
            notes: item.notes || null,
          })),
        },
      },
      include: { items: true, supplier: { select: { name: true } } },
    });
    res.status(201).json(po);
  } catch (err) { next(err); }
});

// One-tap reorder: draft a PO to a supplier for everything at/below its reorder
// point (or a given product list), ordering up to the max level (or 2× the point)
// at standard cost. Turns reorder *suggestions* into an actual purchase order.
router.post('/quick-reorder', auth, requireRole('owner', 'manager'), validate(z.object({
  supplier_id: z.string().uuid(),
  location_id: z.string().uuid().optional().nullable(),
  product_ids: z.array(z.string().uuid()).optional(),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const explicit = req.body.product_ids?.length ? req.body.product_ids : null;
    const products = await prisma.product.findMany({
      where: { businessId, isActive: true, ...(explicit ? { id: { in: explicit } } : { reorderPoint: { gt: 0 } }) },
      select: { id: true, name: true, reorderPoint: true, maxStockLevel: true, costPrice: true },
    });
    if (!products.length) return res.status(400).json({ title: 'No products to reorder', status: 400 });

    const ids = products.map(p => p.id);
    const levels = await prisma.stockLevel.findMany({ where: { productId: { in: ids }, ...(req.body.location_id && { locationId: req.body.location_id }) }, select: { productId: true, quantity: true } });
    const stockBy = {};
    for (const l of levels) stockBy[l.productId] = (stockBy[l.productId] || 0) + l.quantity;

    const lines = [];
    for (const p of products) {
      const stock = stockBy[p.id] || 0;
      // Auto mode reorders only what's at/below its point; an explicit list always tops up.
      if (!explicit && stock > p.reorderPoint) continue;
      const target = p.maxStockLevel > 0 ? p.maxStockLevel : Math.max(p.reorderPoint * 2, 1);
      const qty = Math.max(0, target - stock);
      if (qty <= 0) continue;
      const unitPrice = parseFloat(p.costPrice);
      lines.push({ productId: p.id, orderedQty: qty, unitPrice, totalPrice: +(unitPrice * qty).toFixed(2) });
    }
    if (!lines.length) return res.status(400).json({ title: 'Nothing is below its reorder point', status: 400 });

    const subtotal = +lines.reduce((s, l) => s + l.totalPrice, 0).toFixed(2);
    const po = await prisma.purchaseOrder.create({
      data: {
        businessId, supplierId: req.body.supplier_id, locationId: req.body.location_id || null,
        poNumber: `PO-${Date.now()}`, subtotal, freightCost: 0, customsDuty: 0, otherCharges: 0,
        totalAmount: subtotal, currency: 'USD', paymentTerms: 0, createdById: req.user.id,
        items: { create: lines },
      },
      include: { items: true, supplier: { select: { name: true } } },
    });
    res.status(201).json({ message: `Reorder PO drafted — ${lines.length} line(s).`, ...po });
  } catch (err) { next(err); }
});

router.put('/:id/status', auth, requireRole('owner', 'manager'), validate(POStatusSchema), async (req, res, next) => {
  try {
    const { status, received_items } = req.body;
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!po || po.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });

    if (status === 'received' || status === 'partial') {
      if (!received_items?.length) return res.status(400).json({ title: 'received_items required', status: 400 });

      await prisma.$transaction(async (tx) => {
        const grnNumber = `GRN-${Date.now()}`;
        const grn = await tx.goodsReceivedNote.create({
          data: {
            poId: req.params.id,
            businessId: req.user.business_id,
            grnNumber,
            createdById: req.user.id,
          },
        });

        // Track the value actually received this time, so we increment the
        // supplier's outstanding balance by the received amount once — not by
        // the whole PO total on every partial receipt (which double-counted).
        let receivedValue = 0;
        const itemsById = new Map(po.items.map((i) => [i.id, i]));

        // Landed cost: spread freight + customs + other charges across every unit
        // in proportion to its value, so the cost layers (and therefore COGS and
        // margins) reflect the true landed cost — not just the supplier price.
        const totalLanded = parseFloat(po.freightCost || 0) + parseFloat(po.customsDuty || 0) + parseFloat(po.otherCharges || 0);
        const poSubtotal  = parseFloat(po.subtotal || 0);
        const landedFactor = poSubtotal > 0 ? totalLanded / poSubtotal : 0;

        for (const ri of received_items) {
          if (!ri.qty || ri.qty <= 0) continue;

          // Over-receipt guard: never receive more than was ordered (minus what
          // has already been received against this line).
          const orderLine = itemsById.get(ri.id);
          if (!orderLine || orderLine.poId !== po.id) {
            throw Object.assign(new Error(`Receipt item ${ri.id} is not part of this purchase order.`), { statusCode: 400 });
          }
          const outstanding = orderLine.orderedQty - orderLine.receivedQty;
          if (ri.qty > outstanding) {
            throw Object.assign(
              new Error(`Cannot receive ${ri.qty} of line ${ri.id}; only ${outstanding} outstanding (ordered ${orderLine.orderedQty}, already received ${orderLine.receivedQty}).`),
              { statusCode: 400, code: 'OVER_RECEIPT' }
            );
          }

          const baseUnitCost = parseFloat(ri.unit_price ?? orderLine.unitPrice ?? 0);
          // Capitalise this unit's share of the landed charges into its cost.
          const lineUnitCost = +(baseUnitCost * (1 + landedFactor)).toFixed(4);
          receivedValue += lineUnitCost * ri.qty;

          await tx.purchaseOrderItem.update({
            where: { id: ri.id },
            data: { receivedQty: { increment: ri.qty } },
          });

          // Update stock
          const locId = po.locationId;
          if (locId) {
            await tx.$executeRaw`
              INSERT INTO stock_levels (id, product_id, location_id, quantity)
              VALUES (gen_random_uuid(), ${ri.product_id}::uuid, ${locId}::uuid, ${ri.qty})
              ON CONFLICT (product_id, location_id) DO UPDATE
              SET quantity = stock_levels.quantity + ${ri.qty}, updated_at = NOW()
            `;

            await tx.stockMovement.create({
              data: {
                businessId: req.user.business_id,
                productId: ri.product_id,
                locationId: locId,
                type: 'purchase',
                quantity: ri.qty,
                referenceId: po.id,
                referenceType: 'purchase_order',
                createdById: req.user.id,
              },
            });

            // Update cost price on product to the landed unit cost.
            if (ri.unit_price) {
              await tx.product.update({
                where: { id: ri.product_id },
                data: { costPrice: lineUnitCost },
              });
            }

            // Resolve the batch expiry once — shared by the batch and cost layer.
            const expiryDate = ri.expiry_date ? new Date(ri.expiry_date)
                             : orderLine.expiryDate ? new Date(orderLine.expiryDate)
                             : null;

            // Stock batch (expiry / FEFO tracking). Fall back to the ordered
            // line's batch/expiry when the receipt doesn't restate them.
            await tx.stockBatch.create({
              data: {
                productId: ri.product_id,
                locationId: locId,
                batchNumber: ri.batch_number || orderLine.batchNumber || null,
                quantity: ri.qty,
                costPrice: lineUnitCost,
                expiryDate,
              },
            });

            // Cost layer (FIFO/FEFO costing). expiryDate drives FEFO consumption
            // for perishables; without the layer, sales fall back to last cost.
            await tx.costLayer.create({
              data: {
                businessId:        req.user.business_id,
                productId:         ri.product_id,
                variantId:         orderLine.variantId || null,
                locationId:        locId,
                poId:              po.id,
                quantityReceived:  ri.qty,
                quantityRemaining: ri.qty,
                unitCost:          lineUnitCost,
                expiryDate,
              },
            });
          }
        }

        // Increment the supplier's outstanding balance by what was received now.
        await tx.supplier.update({
          where: { id: po.supplierId },
          data: { outstandingBalance: { increment: receivedValue } },
        });

        // GL: goods received raise inventory and what we owe the supplier.
        await accounting.postJournal(tx, {
          businessId:  req.user.business_id,
          description: `Goods received — PO ${po.poNumber || ''}`.trim(),
          sourceType:  'purchase', sourceId: po.id, createdById: req.user.id,
          lines: [
            { code: '1200', debit: receivedValue, credit: 0, description: 'Inventory received' },
            { code: '2000', debit: 0, credit: receivedValue, description: 'Accounts payable' },
          ],
        });

        await tx.purchaseOrder.update({
          where: { id: req.params.id },
          data: {
            status,
            ...(status === 'approved' && { approvedById: req.user.id, approvedAt: new Date() }),
          },
        });
      });
    } else {
      const updateData = {
        status,
        ...(status === 'approved' && { approvedById: req.user.id, approvedAt: new Date() }),
      };
      if (status === 'sent') { updateData.sentAt = new Date(); updateData.sentVia = req.body.sent_via || 'manual'; }
      await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: updateData });
    }

    const updated = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { items: true, supplier: { select: { name: true } } },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

router.post('/:id/payment', auth, requireRole('owner', 'manager'), validate(POPaymentSchema), async (req, res, next) => {
  try {
    const { amount, payment_method, reference, notes } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po || po.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.pOPayment.create({
        data: { poId: req.params.id, amount, paymentMethod: payment_method, reference: reference || null, notes: notes || null, createdById: req.user.id },
      });
      await tx.purchaseOrder.update({
        where: { id: req.params.id },
        data: {
          amountPaid: { increment: amount },
          paymentStatus: parseFloat(po.amountPaid) + amount >= parseFloat(po.totalAmount) ? 'paid' : 'partial',
        },
      });
      await tx.supplier.update({
        where: { id: po.supplierId },
        data: { outstandingBalance: { decrement: amount } },
      });
      // GL: paying a supplier settles payable and reduces the cash/bank asset.
      await accounting.postJournal(tx, {
        businessId:  req.user.business_id,
        description: `Supplier payment — PO ${po.poNumber || ''}`.trim(),
        sourceType:  'po_payment', sourceId: po.id, createdById: req.user.id,
        lines: [
          { code: '2000', debit: amount, credit: 0, description: 'Accounts payable settled' },
          { code: accounting.tenderAccountCode(payment_method), debit: 0, credit: amount, description: `Paid via ${payment_method}` },
        ],
      });
    });

    res.status(201).json({ message: 'Payment recorded.' });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    await prisma.purchaseOrder.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.json({ message: 'PO cancelled.' });
  } catch (err) { next(err); }
});

module.exports = router;
