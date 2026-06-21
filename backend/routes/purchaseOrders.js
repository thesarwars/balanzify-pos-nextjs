const express = require('express');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { PurchaseOrderSchema, POStatusSchema, POPaymentSchema } = require('../validation/schemas');
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

          const lineUnitCost = parseFloat(ri.unit_price ?? orderLine.unitPrice ?? 0);
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

            // Update cost price on product
            if (ri.unit_price) {
              await tx.product.update({
                where: { id: ri.product_id },
                data: { costPrice: ri.unit_price },
              });
            }

            // Stock batch (expiry / FEFO tracking). Fall back to the ordered
            // line's batch/expiry when the receipt doesn't restate them.
            await tx.stockBatch.create({
              data: {
                productId: ri.product_id,
                locationId: locId,
                batchNumber: ri.batch_number || orderLine.batchNumber || null,
                quantity: ri.qty,
                costPrice: lineUnitCost,
                expiryDate: ri.expiry_date ? new Date(ri.expiry_date)
                          : orderLine.expiryDate ? new Date(orderLine.expiryDate)
                          : null,
              },
            });

            // Cost layer (FIFO costing). Without this, sales fall back to the
            // product's last cost and FIFO never actually runs.
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
              },
            });
          }
        }

        // Increment the supplier's outstanding balance by what was received now.
        await tx.supplier.update({
          where: { id: po.supplierId },
          data: { outstandingBalance: { increment: receivedValue } },
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

    await prisma.$transaction([
      prisma.pOPayment.create({
        data: { poId: req.params.id, amount, paymentMethod: payment_method, reference: reference || null, notes: notes || null, createdById: req.user.id },
      }),
      prisma.purchaseOrder.update({
        where: { id: req.params.id },
        data: {
          amountPaid: { increment: amount },
          paymentStatus: parseFloat(po.amountPaid) + amount >= parseFloat(po.totalAmount) ? 'paid' : 'partial',
        },
      }),
      prisma.supplier.update({
        where: { id: po.supplierId },
        data: { outstandingBalance: { decrement: amount } },
      }),
    ]);

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
