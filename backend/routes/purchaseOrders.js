const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { PurchaseOrderSchema, PurchaseOrderUpdateSchema, POStatusSchema, POPaymentSchema, PurchaseReturnSchema } = require('../validation/schemas');
const accounting = require('../lib/accounting');
const email = require('../lib/email');
const { assertWithinEditWindow, invalidateBusinessSettings } = require('../lib/businessSettings');
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
      include: PO_INCLUDE,
    });
    if (!po || po.businessId !== req.user.business_id) {
      return res.status(404).json({ title: 'Not found', status: 404 });
    }
    res.json(po);
  } catch (err) { next(err); }
});

router.post('/', auth, requireRole('owner', 'manager'), validate(PurchaseOrderSchema), async (req, res, next) => {
  try {
    const {
      supplier_id, location_id, items, expected_delivery, payment_terms, notes, currency,
      reference_no, order_date, status, discount_amount, tax_amount, shipping_charges, additional_expenses,
      freight_cost, customs_duty, other_charges, shipping_details, document_url, document_key,
    } = req.body;

    // unit_price is the NET cost per purchase unit (frontend applies line discounts).
    const subtotal = items.reduce((s, i) => s + i.unit_price * i.ordered_qty, 0);
    // shipping_charges (Add Purchase) and freight_cost (legacy) are the same
    // concept; only one is ever sent, so summing is safe and keeps both callers.
    const shipping = (shipping_charges || 0) + (freight_cost || 0);
    const expensesList = Array.isArray(additional_expenses) ? additional_expenses.filter((e) => (e.amount || 0) > 0) : [];
    const expensesTotal = expensesList.reduce((s, e) => s + (e.amount || 0), 0) + (other_charges || 0);
    const discount = discount_amount || 0;
    const tax = tax_amount || 0;
    const totalAmount = +(subtotal - discount + tax + shipping + (customs_duty || 0) + expensesTotal).toFixed(2);
    // Fold named expenses into notes so they aren't lost (no dedicated table yet).
    const expenseNote = expensesList.length ? 'Expenses: ' + expensesList.map((e) => `${e.name || 'expense'} ${e.amount}`).join(', ') : '';
    const fullNotes = [notes, expenseNote].filter(Boolean).join(' | ') || null;

    // Purchase units must belong to this business.
    const unitIds = [...new Set(items.map(i => i.unit_id).filter(Boolean))];
    if (unitIds.length && (await prisma.unit.count({ where: { id: { in: unitIds }, businessId: req.user.business_id } })) !== unitIds.length) {
      return res.status(400).json({ title: 'One or more purchase units not found', status: 400 });
    }
    // Reference number, if given, must be unique.
    if (reference_no && (await prisma.purchaseOrder.count({ where: { poNumber: reference_no } }))) {
      return res.status(409).json({ title: 'That reference number is already in use', status: 409 });
    }

    const po = await prisma.purchaseOrder.create({
      data: {
        businessId: req.user.business_id,
        supplierId: supplier_id,
        locationId: location_id || null,
        poNumber: reference_no || `PO-${Date.now()}`,
        status: status === 'received' ? 'approved' : status === 'ordered' ? 'sent' : 'draft',
        orderDate: order_date ? new Date(order_date) : new Date(),
        expectedDelivery: expected_delivery ? new Date(expected_delivery) : null,
        subtotal,
        discountAmount: discount,
        taxAmount: tax,
        freightCost: shipping,
        customsDuty: customs_duty || 0,
        otherCharges: expensesTotal,
        totalAmount,
        currency: currency || 'USD',
        paymentTerms: payment_terms || 0,
        notes: fullNotes,
        shippingDetails: shipping_details || null,
        documentUrl: document_url || null,
        documentKey: document_key || null,
        createdById: req.user.id,
        items: {
          create: items.map(item => ({
            productId: item.product_id,
            unitId: item.unit_id || null,
            orderedQty: item.ordered_qty,
            unitPrice: item.unit_price,
            discountPercent: item.discount_percent || 0,
            sellingPrice: item.selling_price != null ? item.selling_price : null,
            totalPrice: +(item.unit_price * item.ordered_qty).toFixed(2),
            expiryDate: item.expiry_date ? new Date(item.expiry_date) : null,
            batchNumber: item.batch_number || null,
            notes: item.notes || null,
          })),
        },
      },
      include: { items: true, supplier: { select: { name: true } } },
    });
    res.status(201).json(po);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ title: 'That reference number is already in use', status: 409 });
    next(err);
  }
});

// Full include used by the detail + edit endpoints.
const PO_INCLUDE = {
  supplier: true,
  location: { select: { name: true } },
  items: { include: { product: { select: { name: true, sku: true } }, unit: { select: { shortName: true, actualName: true, baseMultiplier: true, baseUnitId: true } } } },
  payments: { include: { createdBy: { select: { name: true } } } },
  purchaseReturns: { include: { items: { include: { product: { select: { name: true, sku: true } } } }, createdBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
  goodsReceivedNotes: true,
  approvedBy: { select: { name: true } },
  createdBy: { select: { name: true } },
};

// Edit a purchase. A received purchase has already posted stock, cost layers,
// AP and GL (and its cost layers may already be partly consumed by sales), so
// its lines, amounts, supplier and location are locked — only metadata
// (reference, dates, pay term, notes, shipping details, document) may change.
// A not-yet-received purchase can be edited in full and its totals recomputed.
router.put('/:id', auth, requireRole('owner', 'manager'), validate(PurchaseOrderUpdateSchema), async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!po || po.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    // Business Settings → "Transaction edit days" locks old records.
    await assertWithinEditWindow(req.user.business_id, po.createdAt, 'This purchase');

    const b = req.body;
    const hasReceipt = po.items.some((i) => i.receivedQty > 0);

    // Reference number, if changed, must stay unique.
    if (b.reference_no && b.reference_no !== po.poNumber) {
      const clash = await prisma.purchaseOrder.count({ where: { poNumber: b.reference_no, id: { not: po.id } } });
      if (clash) return res.status(409).json({ title: 'That reference number is already in use', status: 409 });
    }

    // Metadata — always safe to change.
    const data = {};
    if (b.reference_no !== undefined) data.poNumber = b.reference_no || po.poNumber;
    if (b.order_date) data.orderDate = new Date(b.order_date);
    if (b.expected_delivery !== undefined) data.expectedDelivery = b.expected_delivery ? new Date(b.expected_delivery) : null;
    if (b.payment_terms !== undefined) data.paymentTerms = b.payment_terms || 0;
    if (b.shipping_details !== undefined) data.shippingDetails = b.shipping_details || null;
    if (b.document_url !== undefined) data.documentUrl = b.document_url || null;
    if (b.document_key !== undefined) data.documentKey = b.document_key || null;

    if (hasReceipt) {
      // Preserve any folded "Expenses: …" tail on the notes.
      if (b.notes !== undefined) {
        const tail = po.notes && po.notes.includes(' | Expenses:') ? po.notes.slice(po.notes.indexOf(' | Expenses:')) : '';
        data.notes = ((b.notes || '') + tail) || null;
      }
      await prisma.purchaseOrder.update({ where: { id: po.id }, data });
      const updated = await prisma.purchaseOrder.findUnique({ where: { id: po.id }, include: PO_INCLUDE });
      return res.json({ ...updated, locked: true });
    }

    // ── Not received → full edit ──
    if (b.supplier_id) data.supplierId = b.supplier_id;
    if (b.location_id !== undefined) data.locationId = b.location_id || null;
    if (b.status) data.status = b.status === 'received' ? 'approved' : b.status === 'ordered' ? 'sent' : 'draft';

    const items = Array.isArray(b.items) ? b.items : null;
    if (items) {
      const unitIds = [...new Set(items.map((i) => i.unit_id).filter(Boolean))];
      if (unitIds.length && (await prisma.unit.count({ where: { id: { in: unitIds }, businessId: req.user.business_id } })) !== unitIds.length) {
        return res.status(400).json({ title: 'One or more purchase units not found', status: 400 });
      }
    }

    const subtotal = items ? +items.reduce((s, i) => s + i.unit_price * i.ordered_qty, 0).toFixed(2) : parseFloat(po.subtotal);
    const discount = b.discount_amount != null ? b.discount_amount : parseFloat(po.discountAmount);
    const tax = b.tax_amount != null ? b.tax_amount : parseFloat(po.taxAmount);
    const shipping = b.shipping_charges != null ? b.shipping_charges : parseFloat(po.freightCost);
    const expensesList = Array.isArray(b.additional_expenses) ? b.additional_expenses.filter((e) => (e.amount || 0) > 0) : null;
    const expensesTotal = expensesList ? expensesList.reduce((s, e) => s + (e.amount || 0), 0) : parseFloat(po.otherCharges);
    const totalAmount = +(subtotal - discount + tax + shipping + expensesTotal).toFixed(2);

    data.subtotal = subtotal;
    data.discountAmount = discount;
    data.taxAmount = tax;
    data.freightCost = shipping;
    data.otherCharges = expensesTotal;
    data.totalAmount = totalAmount;
    const paid = parseFloat(po.amountPaid);
    data.paymentStatus = paid <= 0 ? 'unpaid' : paid >= totalAmount ? 'paid' : 'partial';

    // Rebuild notes = user notes + fresh expense tail (avoid doubling an old tail).
    const baseNotes = b.notes != null ? b.notes : (po.notes ? po.notes.split(' | Expenses:')[0] : '');
    const expenseNote = expensesList && expensesList.length ? 'Expenses: ' + expensesList.map((e) => `${e.name || 'expense'} ${e.amount}`).join(', ') : '';
    data.notes = [baseNotes, expenseNote].filter(Boolean).join(' | ') || null;

    await prisma.$transaction(async (tx) => {
      if (items) {
        await tx.purchaseOrderItem.deleteMany({ where: { poId: po.id } });
        data.items = {
          create: items.map((item) => ({
            productId: item.product_id,
            unitId: item.unit_id || null,
            orderedQty: item.ordered_qty,
            unitPrice: item.unit_price,
            discountPercent: item.discount_percent || 0,
            sellingPrice: item.selling_price != null ? item.selling_price : null,
            totalPrice: +(item.unit_price * item.ordered_qty).toFixed(2),
            expiryDate: item.expiry_date ? new Date(item.expiry_date) : null,
            batchNumber: item.batch_number || null,
          })),
        };
      }
      await tx.purchaseOrder.update({ where: { id: po.id }, data });
    });

    const updated = await prisma.purchaseOrder.findUnique({ where: { id: po.id }, include: PO_INCLUDE });
    res.json(updated);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ title: err.message, status: err.statusCode });
    if (err.code === 'P2002') return res.status(409).json({ title: 'That reference number is already in use', status: 409 });
    next(err);
  }
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

        // Unit conversion: a line purchased in a multiple unit (1 Dozen = 12
        // Pieces) stores stock in BASE units — quantities ×multiplier, per-unit
        // costs ÷multiplier. Money totals are unchanged.
        const lineUnitIds = [...new Set(po.items.map((i) => i.unitId).filter(Boolean))];
        const lineUnits = lineUnitIds.length ? await tx.unit.findMany({ where: { id: { in: lineUnitIds } } }) : [];
        const multiplierOf = (unitId) => {
          const u = lineUnits.find((x) => x.id === unitId);
          return u && u.baseUnitId && u.baseMultiplier ? Number(u.baseMultiplier) : 1;
        };

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

          // Convert to base units when the line was purchased in a multiple
          // (e.g. received 3 Dozen → +36 Pieces at cost/12 each).
          const mult = multiplierOf(orderLine.unitId);
          const baseQty = Math.round(ri.qty * mult);
          const perBaseCost = +(lineUnitCost / mult).toFixed(4);

          await tx.purchaseOrderItem.update({
            where: { id: ri.id },
            data: { receivedQty: { increment: ri.qty } }, // stays in purchase units
          });

          // Update stock
          const locId = po.locationId;
          if (locId) {
            await tx.$executeRaw`
              INSERT INTO stock_levels (id, product_id, location_id, quantity)
              VALUES (gen_random_uuid(), ${ri.product_id}::uuid, ${locId}::uuid, ${baseQty})
              ON CONFLICT (product_id, location_id) DO UPDATE
              SET quantity = stock_levels.quantity + ${baseQty}, updated_at = NOW()
            `;

            await tx.stockMovement.create({
              data: {
                businessId: req.user.business_id,
                productId: ri.product_id,
                locationId: locId,
                type: 'purchase',
                quantity: baseQty,
                referenceId: po.id,
                referenceType: 'purchase_order',
                createdById: req.user.id,
              },
            });

            // Update cost price on product to the landed per-base-unit cost, and
            // the selling price if the purchase line set one (retail, per base unit).
            if (ri.unit_price || orderLine.sellingPrice != null) {
              await tx.product.update({
                where: { id: ri.product_id },
                data: {
                  ...(ri.unit_price ? { costPrice: perBaseCost } : {}),
                  ...(orderLine.sellingPrice != null ? { sellingPrice: parseFloat(orderLine.sellingPrice) } : {}),
                },
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
                quantity: baseQty,
                costPrice: perBaseCost,
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
                quantityReceived:  baseQty,
                quantityRemaining: baseQty,
                unitCost:          perBaseCost,
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
    const { amount, payment_method, reference, notes, paid_on } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!po || po.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.pOPayment.create({
        data: { poId: req.params.id, amount, paymentMethod: payment_method, reference: reference || null, notes: notes || null, paidAt: paid_on ? new Date(paid_on) : new Date(), createdById: req.user.id },
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

// ── Purchase return (debit note) ────────────────────────────────────────────
// Return received goods to the supplier. This INVERTS the receipt: it consumes
// the PO's own cost layers (never creating new ones), reduces on-hand stock,
// decrements the supplier balance, and posts the reverse GL entry — all at the
// same landed cost the goods were received at (tax-exclusive, matching receive).
// Return qty per line is capped at min(received - alreadyReturned, cost-layer
// remaining), so you can never return more than is still on hand from this PO.
router.post('/:id/returns', auth, requireRole('owner', 'manager'), validate(PurchaseReturnSchema), async (req, res, next) => {
  try {
    const { reference, notes, return_date, items, document_url, document_key } = req.body;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!po || po.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    if (!po.locationId) return res.status(400).json({ title: 'This purchase has no location, so its stock cannot be returned.', status: 400 });

    const itemsById = new Map(po.items.map((i) => [i.id, i]));

    // Unit multipliers (a line purchased in Dozens stores stock in base units).
    const lineUnitIds = [...new Set(po.items.map((i) => i.unitId).filter(Boolean))];
    const lineUnits = lineUnitIds.length ? await prisma.unit.findMany({ where: { id: { in: lineUnitIds } } }) : [];
    const multiplierOf = (unitId) => { const u = lineUnits.find((x) => x.id === unitId); return u && u.baseUnitId && u.baseMultiplier ? Number(u.baseMultiplier) : 1; };

    // Aggregate duplicate lines, then fast-fail against what's still returnable
    // (the authoritative cap is a guarded, row-locking UPDATE inside the tx).
    const byLine = new Map();
    for (const it of items) {
      const line = itemsById.get(it.po_item_id);
      if (!line || line.poId !== po.id) return res.status(400).json({ title: `Line ${it.po_item_id} is not part of this purchase.`, status: 400 });
      byLine.set(it.po_item_id, (byLine.get(it.po_item_id) || 0) + it.quantity);
    }
    const prepared = [];
    for (const [poItemId, qty] of byLine) {
      const line = itemsById.get(poItemId);
      const returnable = line.receivedQty - line.returnedQty; // purchase units
      if (qty > returnable) {
        return res.status(400).json({ title: `Cannot return ${qty}; only ${returnable} returnable on that line (received ${line.receivedQty}, already returned ${line.returnedQty}).`, status: 400 });
      }
      prepared.push({ line, qty });
    }

    const created = await prisma.$transaction(async (tx) => {
      const locId = po.locationId;
      let subtotal = 0;
      const returnItemsData = [];

      for (const { line, qty } of prepared) {
        const mult = multiplierOf(line.unitId);
        const baseQty = Math.round(qty * mult);
        if (baseQty <= 0) {
          throw Object.assign(new Error('Return quantity for that line is too small to convert into stock units.'), { statusCode: 400 });
        }

        // Enforce the returnable cap ATOMICALLY. This guarded, row-locking update
        // serialises concurrent returns of the same line and rejects over-returns
        // (the pre-tx check above is only a friendly fast-fail).
        const capped = await tx.$executeRaw`
          UPDATE purchase_order_items SET returned_qty = returned_qty + ${qty}
          WHERE id = ${line.id}::uuid AND received_qty - returned_qty >= ${qty}
        `;
        if (capped === 0) {
          throw Object.assign(new Error('That quantity is no longer returnable — the line was modified concurrently.'), { statusCode: 409 });
        }

        // Lock this PO's own cost layers (FOR UPDATE) so a concurrent sale or return
        // can't consume them from under us, then consume FEFO at their landed cost.
        const layers = await tx.$queryRaw`
          SELECT id, quantity_remaining, unit_cost FROM cost_layers
          WHERE po_id = ${po.id}::uuid AND product_id = ${line.productId}::uuid AND location_id = ${locId}::uuid AND quantity_remaining > 0
          ORDER BY expiry_date ASC NULLS LAST, received_at ASC
          FOR UPDATE
        `;
        const available = layers.reduce((s, l) => s + Number(l.quantity_remaining), 0);
        if (available < baseQty) {
          throw Object.assign(new Error(`Only ${available} unit(s) from this purchase remain in stock — cannot return ${baseQty}.`), { statusCode: 400 });
        }
        let toPull = baseQty; let lineCost = 0;
        for (const layer of layers) {
          if (toPull <= 0) break;
          const take = Math.min(toPull, Number(layer.quantity_remaining));
          const dec = await tx.$executeRaw`UPDATE cost_layers SET quantity_remaining = quantity_remaining - ${take} WHERE id = ${layer.id}::uuid AND quantity_remaining >= ${take}`;
          if (dec === 0) {
            throw Object.assign(new Error('A cost layer changed during the return — please retry.'), { statusCode: 409 });
          }
          lineCost += take * parseFloat(layer.unit_cost);
          toPull -= take;
        }
        lineCost = +lineCost.toFixed(2);
        subtotal += lineCost;

        // Reduce on-hand stock (guarded so it can never go negative under a race).
        const affected = await tx.$executeRaw`
          UPDATE stock_levels SET quantity = quantity - ${baseQty}, updated_at = NOW()
          WHERE product_id = ${line.productId}::uuid AND location_id = ${locId}::uuid AND quantity >= ${baseQty}
        `;
        if (affected === 0) {
          throw Object.assign(new Error(`Not enough stock on hand to return ${baseQty} unit(s).`), { statusCode: 400 });
        }

        // Outbound stock movement.
        await tx.stockMovement.create({
          data: { businessId: req.user.business_id, productId: line.productId, locationId: locId, type: 'return', quantity: -baseQty, referenceType: 'purchase_return', createdById: req.user.id },
        });

        // Reduce matching stock batches FEFO across as many as needed, so
        // Σ batch quantity stays in step with stock_levels.
        let batchToPull = baseQty;
        const batches = await tx.stockBatch.findMany({ where: { productId: line.productId, locationId: locId, quantity: { gt: 0 } }, orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }] });
        for (const b of batches) {
          if (batchToPull <= 0) break;
          const take = Math.min(batchToPull, b.quantity);
          await tx.stockBatch.update({ where: { id: b.id }, data: { quantity: { decrement: take } } });
          batchToPull -= take;
        }

        returnItemsData.push({
          purchaseOrderItemId: line.id, productId: line.productId, variantId: line.variantId || null,
          quantity: qty, unitPrice: qty > 0 ? +(lineCost / qty).toFixed(4) : 0, totalPrice: lineCost,
        });
      }

      subtotal = +subtotal.toFixed(2);
      const ret = await tx.purchaseReturn.create({
        data: {
          businessId: req.user.business_id, poId: po.id, supplierId: po.supplierId, locationId: locId,
          returnNumber: `PRET-${Date.now()}`, reference: reference || null,
          returnDate: return_date ? new Date(return_date) : new Date(),
          subtotal, taxAmount: 0, totalAmount: subtotal, notes: notes || null,
          documentUrl: document_url || null, documentKey: document_key || null,
          createdById: req.user.id,
          items: { create: returnItemsData },
        },
        include: { items: true },
      });

      // Reduce what we owe the supplier by the returned cost basis.
      if (po.supplierId && subtotal > 0) {
        await tx.supplier.update({ where: { id: po.supplierId }, data: { outstandingBalance: { decrement: subtotal } } });
      }

      // GL: the exact reverse of the receipt — Dr AP / Cr Inventory at cost.
      if (subtotal > 0) {
        await accounting.postJournal(tx, {
          businessId: req.user.business_id,
          description: `Purchase return — PO ${po.poNumber || ''}`.trim(),
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

// List the returns recorded against a purchase.
router.get('/:id/returns', auth, async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, select: { businessId: true } });
    if (!po || po.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    const returns = await prisma.purchaseReturn.findMany({
      where: { poId: req.params.id, businessId: req.user.business_id },
      include: { items: { include: { product: { select: { name: true, sku: true } } } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(returns);
  } catch (err) { next(err); }
});

// Email the supplier confirming which items were received, and log it against
// the supplier's communication history.
router.post('/:id/notify-received', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        business: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    });
    if (!po || po.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    if (!po.supplier) return res.status(400).json({ title: 'This purchase has no supplier.', status: 400 });
    if (!po.supplier.email) return res.status(400).json({ title: `${po.supplier.name} has no email address on file.`, status: 400 });

    const received = po.items.filter((i) => i.receivedQty > 0);
    if (!received.length) return res.status(400).json({ title: 'Nothing has been received on this purchase yet.', status: 400 });

    try {
      await email.sendGoodsReceivedNotice(po.supplier.email, {
        supplierName: po.supplier.name,
        businessName: (po.business && po.business.name) || 'Balanzify',
        poNumber: po.poNumber || '',
        receivedDate: new Date().toISOString().slice(0, 10),
        lines: received.map((i) => ({ name: (i.product && i.product.name) || 'Item', qty: i.receivedQty })),
      });
    } catch (mailErr) {
      return res.status(502).json({ title: 'Could not send the email — check the mail server configuration.', status: 502 });
    }

    await prisma.supplierCommunication.create({
      data: {
        supplierId: po.supplierId,
        type: 'email',
        subject: `Items received — PO ${po.poNumber || ''}`.trim(),
        notes: `Sent to ${po.supplier.email} — ${received.length} line(s) received.`,
        createdById: req.user.id,
      },
    }).catch(() => {}); // the email already went out; don't fail the request on the log

    res.json({ message: `Notification sent to ${po.supplier.email}.` });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    // Scope to the caller's business first — this previously cancelled a PO by id
    // alone, letting one tenant cancel another tenant's purchase.
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, select: { businessId: true, createdAt: true } });
    if (!po || po.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    await assertWithinEditWindow(req.user.business_id, po.createdAt, 'This purchase');

    await prisma.purchaseOrder.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.json({ message: 'PO cancelled.' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ title: err.message, status: err.statusCode });
    next(err);
  }
});

// ── 3-WAY MATCH: SUPPLIER INVOICE vs PO (ordered) vs GRN (received) ──
const uuid = z.string().uuid();

// Record a supplier invoice against a PO and run the 3-way match. Flags price
// variances (invoice price ≠ PO price) and over-billing (invoiced > received).
// A control document — it does not re-post AP (the GRN already accrued it).
router.post('/:id/invoice', auth, requireRole('owner', 'manager'), validate(z.object({
  invoice_number: z.string().trim().min(1).max(80),
  invoice_date:   z.string().optional().nullable(),
  notes:          z.string().max(500).optional().nullable(),
  price_tolerance: z.coerce.number().min(0).max(1).default(0), // fractional price wiggle room
  items: z.array(z.object({
    po_item_id: uuid.optional().nullable(),
    product_id: uuid,
    quantity:   z.coerce.number().int().positive(),
    unit_price: z.coerce.number().nonnegative(),
  })).min(1),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, businessId }, include: { items: true } });
    if (!po) return res.status(404).json({ title: 'Purchase order not found', status: 404 });

    const poByItem = new Map(po.items.map(i => [i.id, i]));
    const poByProduct = new Map(po.items.map(i => [i.productId, i]));
    const tol = req.body.price_tolerance;

    const variances = [];
    const lines = req.body.items.map(li => {
      const poLine = (li.po_item_id && poByItem.get(li.po_item_id)) || poByProduct.get(li.product_id) || null;
      const ordered  = poLine ? poLine.orderedQty : 0;
      const received = poLine ? poLine.receivedQty : 0;
      const poPrice  = poLine ? parseFloat(poLine.unitPrice) : null;
      const flags = [];
      if (!poLine) flags.push('not_on_po');
      if (poPrice != null && Math.abs(li.unit_price - poPrice) > poPrice * tol + 0.001) flags.push('price_variance');
      if (li.quantity > received) flags.push('over_billed'); // billed more than was received
      if (flags.length) variances.push({ product_id: li.product_id, po_item_id: poLine?.id || null, ordered, received, invoiced: li.quantity, po_price: poPrice, invoice_price: li.unit_price, flags });
      return { poItemId: poLine?.id || null, productId: li.product_id, quantity: li.quantity, unitPrice: li.unit_price, lineTotal: +(li.quantity * li.unit_price).toFixed(2) };
    });

    const totalAmount = +lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2);
    const status = variances.length ? 'variance' : 'matched';

    const invoice = await prisma.supplierInvoice.create({
      data: {
        businessId, poId: po.id, supplierId: po.supplierId || null,
        invoiceNumber: req.body.invoice_number, invoiceDate: req.body.invoice_date ? new Date(req.body.invoice_date) : null,
        totalAmount, status, variances: variances.length ? variances : undefined,
        notes: req.body.notes || null, createdById: req.user.id,
        items: { create: lines },
      },
      include: { items: true },
    });

    res.status(201).json({ ...invoice, match_status: status, variances, matched: status === 'matched' });
  } catch (err) { next(err); }
});

// Invoices raised against a PO, with their match status.
router.get('/:id/invoices', auth, async (req, res, next) => {
  try {
    const invoices = await prisma.supplierInvoice.findMany({
      where: { businessId: req.user.business_id, poId: req.params.id },
      include: { items: true }, orderBy: { createdAt: 'desc' },
    });
    res.json({ invoices });
  } catch (err) { next(err); }
});

// Approve a supplier invoice for payment. A variance invoice can't be approved
// without an explicit override (the 3-way match gate).
router.post('/invoices/:invId/approve', auth, requireRole('owner', 'manager'), validate(z.object({
  override: z.boolean().optional().default(false),
})), async (req, res, next) => {
  try {
    const invoice = await prisma.supplierInvoice.findFirst({ where: { id: req.params.invId, businessId: req.user.business_id } });
    if (!invoice) return res.status(404).json({ title: 'Invoice not found', status: 404 });
    if (invoice.status === 'approved') return res.status(400).json({ title: 'Invoice already approved', status: 400 });
    if (invoice.status === 'variance' && !req.body.override) {
      return res.status(409).json({ title: 'Invoice has match variances — resolve them or pass override=true to approve anyway.', status: 409, code: 'INVOICE_VARIANCE', variances: invoice.variances });
    }
    const updated = await prisma.supplierInvoice.update({ where: { id: invoice.id }, data: { status: 'approved' } });
    res.json({ message: 'Invoice approved for payment.', invoice: updated });
  } catch (err) { next(err); }
});

module.exports = router;
