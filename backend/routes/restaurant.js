/**
 * Restaurant / Café Routes
 *
 * Menu Modifiers:
 *   GET    /api/v1/restaurant/modifiers              — list modifier groups
 *   POST   /api/v1/restaurant/modifiers              — create group with options
 *   PUT    /api/v1/restaurant/modifiers/:id          — update group
 *   POST   /api/v1/restaurant/modifiers/:id/options  — add option
 *   PUT    /api/v1/restaurant/modifiers/options/:id  — update option
 *   POST   /api/v1/restaurant/products/:id/modifiers — attach group to product
 *   DELETE /api/v1/restaurant/products/:id/modifiers/:groupId
 *   GET    /api/v1/restaurant/products/:id/modifiers — product's modifier groups
 *
 * Tables:
 *   GET    /api/v1/restaurant/tables                 — table grid with status
 *   POST   /api/v1/restaurant/tables                 — add table
 *   PUT    /api/v1/restaurant/tables/:id/status      — update status
 *
 * Orders:
 *   GET    /api/v1/restaurant/orders                 — active orders
 *   POST   /api/v1/restaurant/orders                 — create order
 *   GET    /api/v1/restaurant/orders/:id             — get order with items
 *   POST   /api/v1/restaurant/orders/:id/items       — add item to order
 *   PUT    /api/v1/restaurant/orders/:id/items/:iid  — update item qty/notes
 *   DELETE /api/v1/restaurant/orders/:id/items/:iid  — remove item
 *   POST   /api/v1/restaurant/orders/:id/send        — send to kitchen
 *   POST   /api/v1/restaurant/orders/:id/checkout    — close order → create Sale
 *   POST   /api/v1/restaurant/orders/:id/post-folio  — post to hotel room folio
 *   DELETE /api/v1/restaurant/orders/:id             — void order
 *
 * Kitchen Display:
 *   GET    /api/v1/restaurant/kitchen                — all open tickets (poll/SSE)
 *   PUT    /api/v1/restaurant/kitchen/:id            — update ticket status
 *
 * Dashboard:
 *   GET    /api/v1/restaurant/dashboard              — covers, revenue, avg ticket
 */

const express  = require('express');
const crypto   = require('crypto');
const { z }    = require('zod');
const prisma   = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate }          = require('../middleware/validate');
const webhooks = require('../lib/webhooks');
const { createSale } = require('./sales');
const router   = express.Router();

const uuid    = z.string().uuid();
const money   = z.coerce.number().nonnegative().multipleOf(0.01);

// ── MODIFIER GROUPS ───────────────────────────────────────────────

router.get('/modifiers', auth, async (req, res, next) => {
  try {
    const groups = await prisma.modifierGroup.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ modifier_groups: groups });
  } catch (err) { next(err); }
});

router.post('/modifiers', auth, requireRole('owner', 'manager'), validate(z.object({
  name:       z.string().trim().min(1).max(100),
  isRequired: z.boolean().default(false),
  minSelect:  z.coerce.number().int().nonnegative().default(0),
  maxSelect:  z.coerce.number().int().positive().default(1),
  sortOrder:  z.coerce.number().int().default(0),
  options:    z.array(z.object({
    name:            z.string().trim().min(1).max(100),
    priceAdjustment: money.default(0),
    isDefault:       z.boolean().default(false),
    sortOrder:       z.coerce.number().int().default(0),
  })).default([]),
})), async (req, res, next) => {
  try {
    const { name, isRequired, minSelect, maxSelect, sortOrder, options } = req.body;
    const group = await prisma.modifierGroup.create({
      data: {
        businessId: req.user.business_id,
        name, isRequired, minSelect, maxSelect, sortOrder,
        options: { create: options },
      },
      include: { options: true },
    });
    res.status(201).json(group);
  } catch (err) { next(err); }
});

router.put('/modifiers/:id', auth, requireRole('owner', 'manager'), validate(z.object({
  name:       z.string().trim().min(1).max(100).optional(),
  isRequired: z.boolean().optional(),
  minSelect:  z.coerce.number().int().nonnegative().optional(),
  maxSelect:  z.coerce.number().int().positive().optional(),
  isActive:   z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const group = await prisma.modifierGroup.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: req.body,
    });
    if (!group.count) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(await prisma.modifierGroup.findUnique({ where: { id: req.params.id }, include: { options: true } }));
  } catch (err) { next(err); }
});

router.post('/modifiers/:id/options', auth, requireRole('owner', 'manager'), validate(z.object({
  name:            z.string().trim().min(1).max(100),
  priceAdjustment: money.default(0),
  isDefault:       z.boolean().default(false),
  sortOrder:       z.coerce.number().int().default(0),
})), async (req, res, next) => {
  try {
    const option = await prisma.modifierOption.create({
      data: { groupId: req.params.id, ...req.body },
    });
    res.status(201).json(option);
  } catch (err) { next(err); }
});

router.put('/modifiers/options/:id', auth, requireRole('owner', 'manager'), validate(z.object({
  name:            z.string().trim().max(100).optional(),
  priceAdjustment: money.optional(),
  isDefault:       z.boolean().optional(),
  isActive:        z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const option = await prisma.modifierOption.update({ where: { id: req.params.id }, data: req.body });
    res.json(option);
  } catch (err) { next(err); }
});

// Attach modifier group to a product
router.post('/products/:id/modifiers', auth, requireRole('owner', 'manager'), validate(z.object({
  group_id:  uuid,
  sort_order: z.coerce.number().int().default(0),
})), async (req, res, next) => {
  try {
    await prisma.productModifierGroup.upsert({
      where: { productId_groupId: { productId: req.params.id, groupId: req.body.group_id } },
      create: { productId: req.params.id, groupId: req.body.group_id, sortOrder: req.body.sort_order || 0 },
      update: { sortOrder: req.body.sort_order || 0 },
    });
    res.status(201).json({ message: 'Modifier group attached.' });
  } catch (err) { next(err); }
});

router.delete('/products/:id/modifiers/:groupId', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    await prisma.productModifierGroup.deleteMany({
      where: { productId: req.params.id, groupId: req.params.groupId },
    });
    res.json({ message: 'Modifier group detached.' });
  } catch (err) { next(err); }
});

// Get modifier groups for a product — used by POS when an item is added to order
router.get('/products/:id/modifiers', auth, async (req, res, next) => {
  try {
    const groups = await prisma.productModifierGroup.findMany({
      where: { productId: req.params.id },
      include: {
        group: {
          include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ modifier_groups: groups.map(g => g.group) });
  } catch (err) { next(err); }
});

// ── TABLES ────────────────────────────────────────────────────────

router.get('/tables', auth, async (req, res, next) => {
  try {
    const { section } = req.query;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const tables = await prisma.restaurantTable.findMany({
      where: {
        businessId: req.user.business_id,
        isActive: true,
        ...(section && { section }),
      },
      include: {
        orders: {
          where: { status: { in: ['pending','sent','preparing','ready','served'] } },
          include: {
            items: { select: { quantity: true, status: true } },
            staff: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { number: 'asc' }],
    });

    const stats = {
      total:     tables.length,
      available: tables.filter(t => t.status === 'available').length,
      occupied:  tables.filter(t => t.status === 'occupied').length,
      reserved:  tables.filter(t => t.status === 'reserved').length,
    };

    res.json({ tables, stats });
  } catch (err) { next(err); }
});

router.post('/tables', auth, requireRole('owner', 'manager'), validate(z.object({
  number:   z.string().trim().min(1).max(20),
  name:     z.string().max(50).optional().nullable(),
  capacity: z.coerce.number().int().positive().default(4),
  section:  z.string().max(50).optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
})), async (req, res, next) => {
  try {
    const table = await prisma.restaurantTable.create({
      data: { businessId: req.user.business_id, ...req.body },
    });
    res.status(201).json(table);
  } catch (err) { next(err); }
});

router.put('/tables/:id/status', auth, validate(z.object({
  status: z.enum(['available','occupied','reserved','cleaning','merged']),
})), async (req, res, next) => {
  try {
    await prisma.restaurantTable.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: { status: req.body.status },
    });
    res.json({ message: 'Table status updated.' });
  } catch (err) { next(err); }
});

// ── ORDERS ────────────────────────────────────────────────────────

function orderNumber(n) { return `ORD-${String(n || Date.now()).slice(-6).padStart(4,'0')}`; }

router.get('/orders', auth, async (req, res, next) => {
  try {
    const { status, type, table_id } = req.query;
    const orders = await prisma.restaurantOrder.findMany({
      where: {
        businessId: req.user.business_id,
        ...(status   && { status }),
        ...(type     && { type }),
        ...(table_id && { tableId: table_id }),
        // Default: show active orders only
        ...((!status) && { status: { in: ['pending','sent','preparing','ready','served'] } }),
      },
      include: {
        table:  { select: { number: true, section: true } },
        staff:  { select: { name: true } },
        items:  { include: { product: { select: { name: true } }, modifiers: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ orders });
  } catch (err) { next(err); }
});

router.post('/orders', auth, validate(z.object({
  tableId:    uuid.optional().nullable(),
  customerId: uuid.optional().nullable(),
  type:       z.enum(['dine_in','takeaway','delivery','room_service']).default('dine_in'),
  covers:     z.coerce.number().int().positive().default(1),
  notes:      z.string().max(500).optional().nullable(),
  folioId:    uuid.optional().nullable(),  // hotel room service
})), async (req, res, next) => {
  try {
    const { tableId, customerId, type, covers, notes, folioId } = req.body;

    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.restaurantOrder.create({
        data: {
          businessId:  req.user.business_id,
          orderNumber: orderNumber(),
          tableId:     tableId    || null,
          customerId:  customerId || null,
          staffId:     req.user.id,
          type,
          covers,
          notes:       notes   || null,
          folioId:     folioId || null,
        },
        include: { table: { select: { number: true } } },
      });

      // Mark table occupied
      if (tableId) {
        await tx.restaurantTable.update({
          where: { id: tableId },
          data:  { status: 'occupied' },
        });
      }
      return o;
    });

    res.status(201).json(order);
  } catch (err) { next(err); }
});

router.get('/orders/:id', auth, async (req, res, next) => {
  try {
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: {
        table:   { select: { number: true, section: true, capacity: true } },
        staff:   { select: { name: true } },
        customer: { select: { name: true, phone: true, loyaltyPoints: true } },
        items: {
          include: {
            product:   { select: { name: true, imageUrl: true } },
            variant:   { select: { attributes: true } },
            modifiers: { include: { option: { select: { name: true } } } },
          },
          orderBy: [{ course: 'asc' }, { createdAt: 'asc' }],
        },
        tickets: { orderBy: { sentAt: 'desc' }, take: 5 },
      },
    });
    if (!order) return res.status(404).json({ title: 'Order not found', status: 404 });
    res.json(order);
  } catch (err) { next(err); }
});

// Add item to order
router.post('/orders/:id/items', auth, validate(z.object({
  productId:  uuid,
  variantId:  uuid.optional().nullable(),
  quantity:   z.coerce.number().int().positive().default(1),
  notes:      z.string().max(500).optional().nullable(),
  course:     z.coerce.number().int().min(1).max(5).default(1),
  modifiers:  z.array(z.object({
    optionId: uuid,
  })).default([]),
})), async (req, res, next) => {
  try {
    const { productId, variantId, quantity, notes, course, modifiers } = req.body;

    // Check order is still open
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id, status: { in: ['pending','sent','preparing','ready','served'] } },
    });
    if (!order) return res.status(404).json({ error: 'Active order not found.' });

    // Get product price
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { sellingPrice: true, name: true } });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    // Reject items that are 86'd (marked unavailable) today.
    const today = new Date(new Date().toISOString().slice(0, 10));
    const eightySixed = await prisma.eightySix.findFirst({ where: { productId, date: today } });
    if (eightySixed) return res.status(400).json({ error: `${product.name} is 86'd (unavailable) today.`, code: 'ITEM_86' });

    // Get variant price if applicable
    let unitPrice = parseFloat(product.sellingPrice);
    if (variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { sellingPrice: true } });
      if (variant) unitPrice = parseFloat(variant.sellingPrice);
    }

    // Resolve modifier options and total price adjustment
    let modifierTotal = 0;
    const modifierData = [];
    for (const mod of modifiers) {
      const option = await prisma.modifierOption.findUnique({ where: { id: mod.optionId }, select: { name: true, priceAdjustment: true } });
      if (option) {
        modifierTotal += parseFloat(option.priceAdjustment);
        modifierData.push({ optionId: mod.optionId, name: option.name, priceAdjustment: option.priceAdjustment });
      }
    }

    const lineTotal = (unitPrice + modifierTotal) * quantity;

    const item = await prisma.$transaction(async (tx) => {
      const i = await tx.orderItem.create({
        data: {
          orderId:       req.params.id,
          productId,
          variantId:     variantId || null,
          quantity,
          unitPrice,
          modifierTotal,
          lineTotal,
          notes:         notes || null,
          course,
          modifiers:     { create: modifierData },
        },
        include: {
          product:   { select: { name: true } },
          modifiers: true,
        },
      });
      // Update order subtotal
      await tx.restaurantOrder.update({
        where: { id: req.params.id },
        data: { subtotal: { increment: lineTotal }, totalAmount: { increment: lineTotal } },
      });
      return i;
    });

    res.status(201).json(item);
  } catch (err) { next(err); }
});

// Update order item
router.put('/orders/:id/items/:itemId', auth, validate(z.object({
  quantity: z.coerce.number().int().positive().optional(),
  notes:    z.string().max(500).optional().nullable(),
  course:   z.coerce.number().int().min(1).max(5).optional(),
})), async (req, res, next) => {
  try {
    const existing = await prisma.orderItem.findUnique({ where: { id: req.params.itemId } });
    if (!existing) return res.status(404).json({ error: 'Item not found.' });

    const newQty = req.body.quantity ?? existing.quantity;
    const qtyDiff = newQty - existing.quantity;
    const priceDiff = qtyDiff * (parseFloat(existing.unitPrice) + parseFloat(existing.modifierTotal));

    await prisma.$transaction([
      prisma.orderItem.update({
        where: { id: req.params.itemId },
        data: {
          quantity:   newQty,
          lineTotal:  (parseFloat(existing.unitPrice) + parseFloat(existing.modifierTotal)) * newQty,
          ...(req.body.notes !== undefined && { notes: req.body.notes }),
          ...(req.body.course && { course: req.body.course }),
        },
      }),
      prisma.restaurantOrder.update({
        where: { id: req.params.id },
        data: { subtotal: { increment: priceDiff }, totalAmount: { increment: priceDiff } },
      }),
    ]);

    res.json({ message: 'Item updated.' });
  } catch (err) { next(err); }
});

// Remove item from order
router.delete('/orders/:id/items/:itemId', auth, async (req, res, next) => {
  try {
    const item = await prisma.orderItem.findUnique({ where: { id: req.params.itemId } });
    if (!item) return res.status(404).json({ error: 'Item not found.' });

    await prisma.$transaction([
      prisma.orderItem.delete({ where: { id: req.params.itemId } }),
      prisma.restaurantOrder.update({
        where: { id: req.params.id },
        data: { subtotal: { decrement: parseFloat(item.lineTotal) }, totalAmount: { decrement: parseFloat(item.lineTotal) } },
      }),
    ]);
    res.json({ message: 'Item removed.' });
  } catch (err) { next(err); }
});

// Send order to kitchen — creates kitchen tickets
router.post('/orders/:id/send', auth, async (req, res, next) => {
  try {
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id, status: 'pending' },
      include: {
        items: {
          include: { product: { select: { name: true, kitchenStation: true, category: { select: { name: true } } } }, modifiers: true },
        },
      },
    });
    if (!order) return res.status(404).json({ error: 'Pending order not found.' });
    if (!order.items.length) return res.status(400).json({ error: 'Order has no items.' });

    // Group items by course AND kitchen station — one ticket per course per station.
    // Grill items route to the grill screen, bar items to the bar screen, etc.
    const byKey = {};
    for (const item of order.items) {
      const course  = item.course || 1;
      const station = item.product.kitchenStation || null;
      const key     = `${course}:${station || 'main'}`;
      if (!byKey[key]) byKey[key] = { course, station, items: [] };
      byKey[key].items.push({
        name:      item.product.name,
        quantity:  item.quantity,
        notes:     item.notes,
        modifiers: item.modifiers.map(m => m.name),
      });
    }

    await prisma.$transaction(async (tx) => {
      // One kitchen ticket per course+station combination
      for (const { course, station, items } of Object.values(byKey)) {
        await tx.kitchenTicket.create({
          data: {
            businessId: req.user.business_id,
            orderId:    req.params.id,
            course,
            station:    station || null,
            items,
          },
        });
      }
      await tx.restaurantOrder.update({
        where: { id: req.params.id },
        data:  { status: 'sent', sentToKitchenAt: new Date() },
      });
    });

    res.json({ message: 'Order sent to kitchen.', tickets: Object.keys(byKey).length });
  } catch (err) { next(err); }
});

// Checkout — close order and create a Sale
router.post('/orders/:id/checkout', auth, validate(z.object({
  payment_method:          z.string().default('cash'),
  cash_tendered:           z.coerce.number().optional(),
  payments:                z.array(z.any()).optional(),
  loyalty_points_redeemed: z.coerce.number().int().nonnegative().default(0),
  discount_type:           z.enum(['pct','flat']).default('pct'),
  discount_value:          z.coerce.number().nonnegative().default(0),
  coupon_id:               z.string().uuid().optional().nullable(),
  coupon_discount:         z.coerce.number().nonnegative().default(0),
  tip_amount:              z.coerce.number().nonnegative().default(0),
  split_guests:            z.coerce.number().int().positive().optional(), // split bill N ways
})), async (req, res, next) => {
  try {
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id, status: { in: ['pending','sent','preparing','ready','served'] } },
      include: { items: true, table: true },
    });
    if (!order) return res.status(404).json({ error: 'Active order not found.' });
    if (!order.items.length) return res.status(400).json({ error: 'Order has no items.' });

    // Build sale payload from order items
    const saleItems = order.items.map(i => ({
      product_id:     i.productId,
      variant_id:     i.variantId,
      quantity:       i.quantity,
      override_price: parseFloat(i.unitPrice) + parseFloat(i.modifierTotal),
      notes:          i.notes,
    }));

    const { payment_method, cash_tendered, payments, loyalty_points_redeemed,
            discount_type, discount_value, coupon_id, coupon_discount, tip_amount } = req.body;

    // Service charge: a % of the order subtotal, from the business setting
    // (accepts 10 or 0.10). Added to the bill total by the sale service.
    const biz = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { serviceChargePct: true } });
    const rawPct = parseFloat(biz?.serviceChargePct || 0);
    const scPct = rawPct > 1 ? rawPct / 100 : rawPct;
    const serviceCharge = scPct > 0 ? parseFloat((parseFloat(order.subtotal) * scPct).toFixed(2)) : 0;

    // Mint the idempotency key in-process (no loopback HTTP hop to /sales/initiate,
    // which broke behind a proxy/cluster). Equivalent to what initiate does.
    const idempotency_key = `${req.user.id}-${Date.now()}-${crypto.randomUUID()}`;
    await prisma.saleKey.create({
      data: { key: idempotency_key, cashierId: req.user.id, businessId: req.user.business_id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    // Create the sale in-process (no loopback HTTP) via the shared sale service.
    let sale;
    try {
      sale = await createSale({
        user: req.user, ip: req.ip, get: (h) => req.get(h),
        body: {
          idempotency_key,
          items: saleItems,
          payment_method,
          cash_tendered,
          payments,
          loyalty_points_redeemed,
          discount_type,
          discount_value,
          coupon_id,
          coupon_discount,
          tip_amount,
          service_charge: serviceCharge,
          customer_id: order.customerId,
          type: 'pos',
          notes: `Order ${order.orderNumber}${order.table ? ` — Table ${order.table.number}` : ''}`,
        },
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ error: e.message });
    }

    // Mark order completed, free table
    await prisma.$transaction(async (tx) => {
      await tx.restaurantOrder.update({
        where: { id: req.params.id },
        data: { status: 'completed', saleId: sale.id, completedAt: new Date() },
      });
      if (order.tableId) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'available' } });
      }
    });

    res.json({ sale, order_id: req.params.id });
  } catch (err) { next(err); }
});

// Post order to hotel room folio (room service)
router.post('/orders/:id/post-folio', auth, validate(z.object({
  folio_id:    uuid,
  description: z.string().default('Restaurant charge'),
})), async (req, res, next) => {
  try {
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const folio = await prisma.folio.findFirst({
      where: { id: req.body.folio_id, businessId: req.user.business_id, status: 'open' },
    });
    if (!folio) return res.status(404).json({ error: 'Open folio not found.' });

    const totalAmount = parseFloat(order.totalAmount);

    // Build description from items
    const itemsSummary = order.items.map(i => `${i.quantity}x ${i.product.name}`).join(', ');
    const description  = `${req.body.description}: ${itemsSummary}`;

    await prisma.$transaction(async (tx) => {
      // Post charge to folio
      await tx.folioCharge.create({
        data: {
          folioId:       req.body.folio_id,
          businessId:    req.user.business_id,
          type:          'restaurant',
          description,
          quantity:      1,
          unitAmount:    totalAmount,
          totalAmount,
          chargeDate:    new Date(),
          referenceId:   req.params.id,
          referenceType: 'restaurant_order',
          postedById:    req.user.id,
        },
      });
      await tx.folio.update({
        where: { id: req.body.folio_id },
        data: { totalCharges: { increment: totalAmount }, balance: { increment: totalAmount } },
      });
      // Mark order completed, link to folio
      await tx.restaurantOrder.update({
        where: { id: req.params.id },
        data: { status: 'completed', folioId: req.body.folio_id, completedAt: new Date() },
      });
      if (order.tableId) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'available' } });
      }
    });

    res.json({ message: `$${totalAmount.toFixed(2)} posted to folio.`, folio_id: req.body.folio_id });
  } catch (err) { next(err); }
});

// Void order
router.delete('/orders/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id, status: { notIn: ['completed','void'] } },
    });
    if (!order) return res.status(404).json({ error: 'Active order not found.' });

    await prisma.$transaction(async (tx) => {
      await tx.restaurantOrder.update({ where: { id: req.params.id }, data: { status: 'void' } });
      if (order.tableId) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'available' } });
      }
      await tx.kitchenTicket.updateMany({
        where: { orderId: req.params.id, status: { in: ['pending','preparing'] } },
        data:  { status: 'cancelled' },
      });
    });

    res.json({ message: 'Order voided.' });
  } catch (err) { next(err); }
});

// ── KITCHEN DISPLAY ───────────────────────────────────────────────
// Polling endpoint for kitchen screens.
// Returns all open tickets sorted by time — oldest first.
// Kitchen marks each ticket preparing → ready.
// When all tickets on an order are ready, order auto-advances to 'ready'.

router.get('/kitchen', auth, async (req, res, next) => {
  try {
    const { station, course } = req.query;
    const tickets = await prisma.kitchenTicket.findMany({
      where: {
        businessId: req.user.business_id,
        status: { in: ['pending','preparing'] },
        ...(station && { station }),
        ...(course  && { course: parseInt(course) }),
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            type:        true,
            covers:      true,
            notes:       true,
            table:       { select: { number: true, section: true } },
          },
        },
      },
      orderBy: { sentAt: 'asc' }, // oldest tickets first — FIFO kitchen queue
    });
    res.json({ tickets });
  } catch (err) { next(err); }
});

router.put('/kitchen/:id', auth, validate(z.object({
  status: z.enum(['preparing','ready','cancelled']),
})), async (req, res, next) => {
  try {
    const ticket = await prisma.kitchenTicket.update({
      where: { id: req.params.id },
      data: {
        status:    req.body.status,
        startedAt: req.body.status === 'preparing' ? new Date() : undefined,
        readyAt:   req.body.status === 'ready'     ? new Date() : undefined,
      },
    });

    // If ticket is ready, check if ALL tickets on this order are ready
    if (req.body.status === 'ready') {
      const allTickets = await prisma.kitchenTicket.findMany({
        where: { orderId: ticket.orderId },
        select: { status: true },
      });
      const allReady = allTickets.every(t => t.status === 'ready' || t.status === 'cancelled');
      if (allReady) {
        await prisma.restaurantOrder.update({ where: { id: ticket.orderId }, data: { status: 'ready' } });
        webhooks.emit(req.user.business_id, 'sale.completed', {
          type: 'order_ready', order_id: ticket.orderId,
        }).catch(() => {});
      }
    }

    res.json(ticket);
  } catch (err) { next(err); }
});

// ── DASHBOARD ─────────────────────────────────────────────────────

router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const bizId      = req.user.business_id;
    const today      = new Date(); today.setHours(0,0,0,0);
    const tomorrow   = new Date(today.getTime() + 86400000);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      ordersToday, revenueToday, revenueMonth,
      avgTicketToday, activeOrders, pendingKitchen,
      topItemsMonth, tableStats,
    ] = await Promise.all([
      // Orders completed today
      prisma.restaurantOrder.count({ where: { businessId: bizId, status: 'completed', completedAt: { gte: today, lt: tomorrow } } }),
      // Revenue today
      prisma.restaurantOrder.aggregate({
        where: { businessId: bizId, status: 'completed', completedAt: { gte: today, lt: tomorrow } },
        _sum: { totalAmount: true },
      }),
      // Revenue this month
      prisma.restaurantOrder.aggregate({
        where: { businessId: bizId, status: 'completed', completedAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      // Average ticket today
      prisma.restaurantOrder.aggregate({
        where: { businessId: bizId, status: 'completed', completedAt: { gte: today, lt: tomorrow } },
        _avg: { totalAmount: true },
      }),
      // Currently active orders
      prisma.restaurantOrder.count({ where: { businessId: bizId, status: { in: ['pending','sent','preparing','ready','served'] } } }),
      // Tickets waiting in kitchen
      prisma.kitchenTicket.count({ where: { businessId: bizId, status: { in: ['pending','preparing'] } } }),
      // Top 5 items this month
      prisma.$queryRaw`
        SELECT p.name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        JOIN restaurant_orders o ON oi.order_id = o.id
        WHERE o.business_id = ${bizId}::uuid AND o.status = 'completed'
          AND o.completed_at >= ${monthStart}
        GROUP BY p.name ORDER BY qty DESC LIMIT 5
      `,
      // Table occupancy
      prisma.restaurantTable.groupBy({
        by: ['status'],
        where: { businessId: bizId, isActive: true },
        _count: { id: true },
      }),
    ]);

    res.json({
      orders_today:    ordersToday,
      revenue_today:   parseFloat(revenueToday._sum.totalAmount  || 0),
      revenue_month:   parseFloat(revenueMonth._sum.totalAmount   || 0),
      avg_ticket:      parseFloat(avgTicketToday._avg.totalAmount || 0),
      active_orders:   activeOrders,
      kitchen_queue:   pendingKitchen,
      top_items:       topItemsMonth,
      table_stats:     Object.fromEntries(tableStats.map(t => [t.status, t._count.id])),
    });
  } catch (err) { next(err); }
});


// ── SPLIT BILL ────────────────────────────────────────────────────
// Split an order into N separate bills.
// Each split creates a new order with allocated items.
// Customer picks which items go on their bill.

router.post('/orders/:id/split', auth, validate(z.object({
  splits: z.array(z.object({
    item_ids:       z.array(uuid).min(1),
    customer_id:    uuid.optional().nullable(),
    customer_name:  z.string().optional().nullable(),
  })).min(2),
})), async (req, res, next) => {
  try {
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id,
               status: { in: ['pending','sent','preparing','ready','served'] } },
      include: { items: { include: { modifiers: true } }, table: true },
    });
    if (!order) return res.status(404).json({ error: 'Active order not found.' });

    // Validate all item IDs belong to this order
    const orderItemIds = new Set(order.items.map(i => i.id));
    const allSplitItems = req.body.splits.flatMap(s => s.item_ids);
    const invalid = allSplitItems.filter(id => !orderItemIds.has(id));
    if (invalid.length) return res.status(400).json({ error: `Item IDs not in this order: ${invalid.join(', ')}` });

    // Check for duplicate items across splits
    const seen = new Set();
    for (const id of allSplitItems) {
      if (seen.has(id)) return res.status(400).json({ error: `Item ${id} assigned to multiple splits.` });
      seen.add(id);
    }

    const newOrders = await prisma.$transaction(async (tx) => {
      const created = [];
      for (let i = 0; i < req.body.splits.length; i++) {
        const split = req.body.splits[i];
        const splitItems = order.items.filter(item => split.item_ids.includes(item.id));
        const subtotal = splitItems.reduce((s, item) => s + parseFloat(item.lineTotal), 0);

        const newOrder = await tx.restaurantOrder.create({
          data: {
            businessId:  req.user.business_id,
            orderNumber: `${order.orderNumber}-S${i + 1}`,
            tableId:     order.tableId,
            customerId:  split.customer_id || null,
            staffId:     req.user.id,
            status:      order.status,
            type:        order.type,
            covers:      1,
            notes:       `Split from ${order.orderNumber}`,
            subtotal,
            totalAmount: subtotal,
            items: {
              create: splitItems.map(item => ({
                productId:     item.productId,
                variantId:     item.variantId,
                quantity:      item.quantity,
                unitPrice:     item.unitPrice,
                modifierTotal: item.modifierTotal,
                lineTotal:     item.lineTotal,
                notes:         item.notes,
                course:        item.course,
                status:        item.status,
                modifiers: {
                  create: item.modifiers.map(m => ({
                    optionId:        m.optionId,
                    name:            m.name,
                    priceAdjustment: m.priceAdjustment,
                  })),
                },
              })),
            },
          },
          include: { items: true },
        });
        created.push(newOrder);
      }
      // Void the original order
      await tx.restaurantOrder.update({
        where: { id: req.params.id },
        data: { status: 'void', notes: `Split into ${req.body.splits.length} orders` },
      });
      return created;
    });

    res.status(201).json({
      message:    `Order split into ${newOrders.length} bills.`,
      new_orders: newOrders.map(o => ({ id: o.id, order_number: o.orderNumber, total: o.totalAmount })),
    });
  } catch (err) { next(err); }
});

// ── MOVE ORDER TO DIFFERENT TABLE ─────────────────────────────────

router.post('/orders/:id/move-table', auth, validate(z.object({
  table_id: uuid,
})), async (req, res, next) => {
  try {
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id,
               status: { in: ['pending','sent','preparing','ready','served'] } },
    });
    if (!order) return res.status(404).json({ error: 'Active order not found.' });

    const newTable = await prisma.restaurantTable.findFirst({
      where: { id: req.body.table_id, businessId: req.user.business_id },
    });
    if (!newTable) return res.status(404).json({ error: 'Table not found.' });
    if (newTable.status === 'occupied') {
      return res.status(409).json({ error: 'Table is already occupied.' });
    }

    await prisma.$transaction(async (tx) => {
      // Free old table if this was the only active order
      if (order.tableId) {
        const otherOrders = await tx.restaurantOrder.count({
          where: { tableId: order.tableId, status: { in: ['pending','sent','preparing','ready','served'] }, id: { not: order.id } },
        });
        if (otherOrders === 0) {
          await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'available' } });
        }
      }
      // Move order
      await tx.restaurantOrder.update({
        where: { id: req.params.id },
        data: { tableId: req.body.table_id },
      });
      // Mark new table occupied
      await tx.restaurantTable.update({ where: { id: req.body.table_id }, data: { status: 'occupied' } });
    });

    res.json({ message: `Order moved to table ${newTable.number}.` });
  } catch (err) { next(err); }
});

// ── MERGE TABLES ──────────────────────────────────────────────────
// Combine two active orders onto one table

router.post('/orders/merge', auth, validate(z.object({
  order_ids: z.array(uuid).min(2).max(5),
})), async (req, res, next) => {
  try {
    const orders = await prisma.restaurantOrder.findMany({
      where: { id: { in: req.body.order_ids }, businessId: req.user.business_id,
               status: { in: ['pending','sent','preparing','ready','served'] } },
      include: { items: { include: { modifiers: true } } },
    });
    if (orders.length !== req.body.order_ids.length) {
      return res.status(404).json({ error: 'One or more orders not found or not active.' });
    }

    const primary = orders[0]; // First order becomes the master
    const merged  = await prisma.$transaction(async (tx) => {
      // Move all items from other orders into primary
      for (const other of orders.slice(1)) {
        for (const item of other.items) {
          await tx.orderItem.update({ where: { id: item.id }, data: { orderId: primary.id } });
        }
        // Void merged orders
        await tx.restaurantOrder.update({
          where: { id: other.id },
          data: { status: 'void', notes: `Merged into ${primary.orderNumber}` },
        });
        // Release their tables
        if (other.tableId && other.tableId !== primary.tableId) {
          await tx.restaurantTable.update({ where: { id: other.tableId }, data: { status: 'available' } });
        }
      }
      // Recompute primary total
      const allItems = await tx.orderItem.findMany({ where: { orderId: primary.id } });
      const newTotal = allItems.reduce((s, i) => s + parseFloat(i.lineTotal), 0);
      return tx.restaurantOrder.update({
        where: { id: primary.id },
        data: { subtotal: newTotal, totalAmount: newTotal },
        include: { items: true },
      });
    });

    res.json({ message: `${orders.length} orders merged.`, order: merged });
  } catch (err) { next(err); }
});

// ── VOID SINGLE ITEM ──────────────────────────────────────────────
// Cancel a single item without voiding the whole order

router.post('/orders/:id/items/:itemId/void', auth, requireRole('owner', 'manager'), validate(z.object({
  reason: z.string().max(255).optional().default('Voided by manager'),
})), async (req, res, next) => {
  try {
    const item = await prisma.orderItem.findFirst({
      where: { id: req.params.itemId, orderId: req.params.id },
    });
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    if (item.status === 'void') return res.status(400).json({ error: 'Item already voided.' });

    await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({ where: { id: item.id }, data: { status: 'void', notes: req.body.reason } });
      await tx.restaurantOrder.update({
        where: { id: req.params.id },
        data: { subtotal: { decrement: parseFloat(item.lineTotal) }, totalAmount: { decrement: parseFloat(item.lineTotal) } },
      });
    });

    res.json({ message: 'Item voided.', amount_removed: parseFloat(item.lineTotal) });
  } catch (err) { next(err); }
});

// ── FIRE COURSE ───────────────────────────────────────────────────
// Send a specific course to kitchen now (e.g. "fire mains")

router.post('/orders/:id/fire-course', auth, validate(z.object({
  course: z.coerce.number().int().min(1).max(5),
})), async (req, res, next) => {
  try {
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id,
               status: { in: ['sent','preparing','ready','served'] } },
      include: {
        items: {
          where: { course: req.body.course, status: { not: 'void' } },
          include: { product: { select: { name: true } }, modifiers: true },
        },
      },
    });
    if (!order) return res.status(404).json({ error: 'Sent order not found.' });
    if (!order.items.length) return res.status(400).json({ error: `No items in course ${req.body.course}.` });

    const courseItems = order.items.map(i => ({
      name:      i.product.name,
      quantity:  i.quantity,
      notes:     i.notes,
      modifiers: i.modifiers.map(m => m.name),
    }));

    const ticket = await prisma.kitchenTicket.create({
      data: {
        businessId: req.user.business_id,
        orderId:    req.params.id,
        course:     req.body.course,
        items:      courseItems,
      },
    });

    res.json({ message: `Course ${req.body.course} fired to kitchen.`, ticket_id: ticket.id });
  } catch (err) { next(err); }
});

// ── REPRINT KITCHEN TICKET ────────────────────────────────────────

router.post('/kitchen/:id/reprint', auth, async (req, res, next) => {
  try {
    const ticket = await prisma.kitchenTicket.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: { order: { select: { orderNumber: true, table: { select: { number: true } }, type: true } } },
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

    // Create a duplicate ticket marked as reprint
    const reprint = await prisma.kitchenTicket.create({
      data: {
        businessId: req.user.business_id,
        orderId:    ticket.orderId,
        station:    ticket.station,
        course:     ticket.course,
        status:     'pending',
        items:      typeof ticket.items === 'string' ? JSON.parse(ticket.items) : ticket.items,
      },
    });

    res.json({ message: 'Ticket reprinted.', ticket: reprint });
  } catch (err) { next(err); }
});

// ── PRINT BILL (pre-payment) ──────────────────────────────────────
// Show the customer their bill before they pay

router.get('/orders/:id/bill', auth, async (req, res, next) => {
  try {
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: {
        items: {
          where: { status: { not: 'void' } },
          include: { product: { select: { name: true } }, modifiers: true },
        },
        table:    { select: { number: true, section: true } },
        customer: { select: { name: true, phone: true } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const business = await prisma.business.findUnique({
      where: { id: req.user.business_id },
      select: { name: true, phone: true, currency: true, taxNumber: true },
    });

    const currency = order.items[0]?.currency || business?.currency || 'USD';
    const fmt = (n) => `${currency} ${parseFloat(n || 0).toFixed(2)}`;

    // Build WhatsApp-friendly bill
    const itemLines = order.items.map(i => {
      const modText = i.modifiers.length ? ` (${i.modifiers.map(m => m.name).join(', ')})` : '';
      return `  ${i.quantity}x ${i.product.name}${modText}: ${fmt(i.lineTotal)}`;
    }).join('\n');

    const tableInfo = order.table ? 'Table ' + order.table.number : 'Takeaway';
    const sep = '─────────────────────';
    const waMsg = [
      '🧾 *Bill — ' + (business?.name || '') + '*',
      '🪑 ' + tableInfo + '  |  Order: ' + order.orderNumber,
      sep,
      itemLines,
      sep,
      '💰 *Total: ' + fmt(order.totalAmount) + '*',
      '',
      'This is your bill. Payment accepted: Cash, Zaad, M-Pesa.',
    ].join(String.fromCharCode(10));

    const customerPhone = order.customer?.phone;
    const waUrl = customerPhone
      ? 'https://wa.me/' + customerPhone.replace(/[^0-9]/g, '').replace(/^0/, '') + '?text=' + encodeURIComponent(waMsg)
      : null;

    res.json({
      order_number:   order.orderNumber,
      table:          order.table?.number,
      items:          order.items,
      total:          parseFloat(order.totalAmount),
      currency,
      wa_message:     waMsg,
      wa_url:         waUrl,
    });
  } catch (err) { next(err); }
});

// ── WAITER ASSIGNMENT ─────────────────────────────────────────────

router.put('/tables/:id/waiter', auth, validate(z.object({
  waiter_id: uuid.optional().nullable(),
})), async (req, res, next) => {
  try {
    // If assigning, the waiter must be a user in this business.
    if (req.body.waiter_id) {
      const u = await prisma.user.findFirst({ where: { id: req.body.waiter_id, businessId: req.user.business_id }, select: { id: true } });
      if (!u) return res.status(400).json({ error: 'Waiter not found.' });
    }
    const r = await prisma.restaurantTable.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: { waiterId: req.body.waiter_id || null },
    });
    if (!r.count) return res.status(404).json({ error: 'Table not found.' });
    res.json({ message: req.body.waiter_id ? 'Waiter assigned.' : 'Waiter cleared.' });
  } catch (err) { next(err); }
});

// ── 86 ITEM (mark a menu item unavailable for the day) ────────────
// Per-day availability (optionally per location) — does NOT deactivate the
// product globally; it auto-clears the next day.

router.post('/products/:id/86', auth, validate(z.object({
  available:   z.boolean().optional(), // false (or omitted) = 86 it; true = un-86
  location_id: uuid.optional().nullable(),
  reason:      z.string().max(255).optional().nullable(),
})), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true, name: true } });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const today = new Date(new Date().toISOString().slice(0, 10));
    const make86 = req.body.available === undefined ? true : !req.body.available;

    if (make86) {
      await prisma.eightySix.upsert({
        where:  { productId_date: { productId: product.id, date: today } },
        update: { reason: req.body.reason || null, locationId: req.body.location_id || null },
        create: { businessId: req.user.business_id, productId: product.id, locationId: req.body.location_id || null, date: today, reason: req.body.reason || null, createdById: req.user.id },
      });
      await prisma.kitchenTicket.create({
        data: { businessId: req.user.business_id, orderId: req.body.order_id || null, course: 0, status: 'pending',
          items: JSON.stringify([{ name: `86: ${product.name} — OUT OF STOCK`, quantity: 0, notes: 'Item marked unavailable today', modifiers: [] }]) },
      }).catch(() => {});
    } else {
      await prisma.eightySix.deleteMany({ where: { productId: product.id, date: today } });
    }
    res.json({ message: `${product.name} marked ${make86 ? 'unavailable (86d) for today' : 'available'}`, available: !make86 });
  } catch (err) { next(err); }
});

// ── DELIVERY ORDER ────────────────────────────────────────────────
// Create an order with delivery details

router.post('/orders/:id/set-delivery', auth, validate(z.object({
  delivery_address: z.string().min(1).max(500),
  delivery_phone:   z.string().min(1).max(50),
  delivery_notes:   z.string().max(255).optional(),
})), async (req, res, next) => {
  try {
    const order = await prisma.restaurantOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id, type: 'delivery' },
    });
    if (!order) return res.status(404).json({ error: 'Delivery order not found.' });

    await prisma.restaurantOrder.update({
      where: { id: req.params.id },
      data: {
        type:  'delivery',
        notes: `DELIVERY: ${req.body.delivery_address} | Tel: ${req.body.delivery_phone}${req.body.delivery_notes ? ` | ${req.body.delivery_notes}` : ''}`,
      },
    });

    res.json({ message: 'Delivery details saved.' });
  } catch (err) { next(err); }
});

// ── RESTAURANT REPORTS ────────────────────────────────────────────

router.get('/reports/revenue', auth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const bizId    = req.user.business_id;
    const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate   = to   ? new Date(to)   : new Date();

    const [
      revenueByType, topItems, coversByDay,
      avgTicketByType, kitchenTimes,
    ] = await Promise.all([
      // Revenue by order type
      prisma.restaurantOrder.groupBy({
        by: ['type'],
        where: { businessId: bizId, status: 'completed', completedAt: { gte: fromDate, lte: toDate } },
        _sum:   { totalAmount: true },
        _count: { id: true },
        _avg:   { totalAmount: true, covers: true },
      }),
      // Top 10 items
      prisma.$queryRaw`
        SELECT p.name,
               SUM(oi.quantity)::int AS qty_sold,
               ROUND(SUM(oi.line_total)::numeric, 2) AS revenue,
               ROUND(AVG(oi.unit_price)::numeric, 2) AS avg_price
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        JOIN restaurant_orders o ON oi.order_id = o.id
        WHERE o.business_id = ${bizId}::uuid
          AND o.status = 'completed'
          AND o.completed_at BETWEEN ${fromDate} AND ${toDate}
          AND oi.status != 'void'
        GROUP BY p.name
        ORDER BY revenue DESC
        LIMIT 10
      `,
      // Covers by day
      prisma.$queryRaw`
        SELECT DATE(completed_at) AS date,
               COUNT(id)::int AS orders,
               SUM(covers)::int AS covers,
               ROUND(SUM(total_amount)::numeric, 2) AS revenue
        FROM restaurant_orders
        WHERE business_id = ${bizId}::uuid
          AND status = 'completed'
          AND completed_at BETWEEN ${fromDate} AND ${toDate}
        GROUP BY DATE(completed_at)
        ORDER BY date
      `,
      // Average ticket by type
      prisma.restaurantOrder.groupBy({
        by: ['type'],
        where: { businessId: bizId, status: 'completed', completedAt: { gte: fromDate } },
        _avg: { totalAmount: true },
      }),
      // Average kitchen time (sent to all tickets ready)
      prisma.$queryRaw`
        SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (ready_at - sent_at)) / 60)::numeric, 1) AS avg_minutes
        FROM kitchen_tickets
        WHERE business_id = ${bizId}::uuid
          AND status = 'ready'
          AND ready_at IS NOT NULL
          AND sent_at >= ${fromDate}
      `,
    ]);

    res.json({
      from: fromDate.toISOString().split('T')[0],
      to:   toDate.toISOString().split('T')[0],
      by_order_type: revenueByType.map(r => ({
        type:        r.type,
        orders:      r._count.id,
        revenue:     parseFloat(r._sum.totalAmount || 0),
        avg_ticket:  parseFloat(r._avg.totalAmount || 0),
        avg_covers:  parseFloat(r._avg.covers || 0),
      })),
      top_items: topItems,
      covers_by_day: coversByDay,
      avg_kitchen_minutes: parseFloat(kitchenTimes[0]?.avg_minutes || 0),
      total_revenue: revenueByType.reduce((s, r) => s + parseFloat(r._sum.totalAmount || 0), 0),
      total_orders:  revenueByType.reduce((s, r) => s + r._count.id, 0),
    });
  } catch (err) { next(err); }
});

// ── TABLE RESERVATION ─────────────────────────────────────────────
// Book a table for a future time (distinct from hotel reservation)

router.post('/table-reservations', auth, validate(z.object({
  table_id:    uuid,
  guest_name:  z.string().trim().min(1).max(255),
  guest_phone: z.string().max(50),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time:        z.string().regex(/^\d{2}:\d{2}$/),
  covers:      z.coerce.number().int().positive().default(2),
  notes:       z.string().max(500).optional(),
})), async (req, res, next) => {
  try {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: req.body.table_id, businessId: req.user.business_id },
    });
    if (!table) return res.status(404).json({ error: 'Table not found.' });

    // Create a real reservation record (does NOT clobber the table's name).
    const reservedAt = new Date(`${req.body.date}T${req.body.time}:00`);
    const reservation = await prisma.tableReservation.create({
      data: {
        businessId: req.user.business_id,
        tableId:    req.body.table_id,
        guestName:  req.body.guest_name,
        guestPhone: req.body.guest_phone,
        reservedAt,
        covers:     req.body.covers,
        notes:      req.body.notes || null,
        createdById: req.user.id,
      },
    });

    // Notify via WhatsApp if business has a phone
    const business = await prisma.business.findUnique({
      where: { id: req.user.business_id },
      select: { name: true, phone: true, currency: true },
    });

    const guestPhone = req.body.guest_phone.replace(/\D/g, '').replace(/^0/, '');
    const msg = `✅ *Table Reservation Confirmed*

🏪 ${business?.name}
👤 ${req.body.guest_name}
🪑 Table ${table.number}
📅 ${req.body.date} at ${req.body.time}
👥 ${req.body.covers} guests

We look forward to seeing you!`;

    await prisma.whatsappLog.create({
      data: {
        businessId:    req.user.business_id,
        recipientPhone: guestPhone,
        messageType:   'table_reservation',
        content:       msg,
        referenceType: 'restaurant_table',
        referenceId:   req.body.table_id,
      },
    });

    res.status(201).json({
      message:        'Table reserved.',
      reservation_id: reservation.id,
      table:          table.number,
      wa_url:         `https://wa.me/${guestPhone}?text=${encodeURIComponent(msg)}`,
    });
  } catch (err) { next(err); }
});

// List table reservations (optionally filter by date).
router.get('/table-reservations', auth, async (req, res, next) => {
  try {
    const where = { businessId: req.user.business_id };
    if (req.query.date) {
      const d = new Date(`${req.query.date}T00:00:00`);
      where.reservedAt = { gte: d, lt: new Date(d.getTime() + 86400000) };
    }
    const reservations = await prisma.tableReservation.findMany({
      where, include: { table: { select: { number: true } } }, orderBy: { reservedAt: 'asc' }, take: 200,
    });
    res.json({ reservations });
  } catch (err) { next(err); }
});

// List items 86'd (unavailable) today.
router.get('/eighty-six', auth, async (req, res, next) => {
  try {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const items = await prisma.eightySix.findMany({
      where: { businessId: req.user.business_id, date: today },
      include: { product: { select: { name: true } } },
    });
    res.json({ items: items.map(i => ({ product_id: i.productId, name: i.product.name, location_id: i.locationId, reason: i.reason })) });
  } catch (err) { next(err); }
});

// ── RECIPES / BILL-OF-MATERIALS ───────────────────────────────────
// A menu item's recipe lists the ingredient products it consumes. Selling the
// item depletes those ingredients (handled in the sales transaction).

router.get('/products/:id/recipe', auth, async (req, res, next) => {
  try {
    const recipe = await prisma.recipe.findFirst({
      where: { productId: req.params.id, businessId: req.user.business_id },
      include: { items: { include: { ingredient: { select: { id: true, name: true, sku: true, costPrice: true } } } } },
    });
    if (!recipe) return res.status(404).json({ error: 'No recipe for this product.' });
    res.json(recipe);
  } catch (err) { next(err); }
});

router.put('/products/:id/recipe', auth, requireRole('owner', 'manager'), validate(z.object({
  yieldQty: z.coerce.number().int().positive().default(1),
  isActive: z.boolean().default(true),
  items:    z.array(z.object({ ingredient_id: uuid, quantity: z.coerce.number().positive() })).min(1),
})), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true } });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    // Every ingredient must belong to this business; none may be the item itself.
    const ingIds = [...new Set(req.body.items.map(i => i.ingredient_id))];
    if (ingIds.includes(req.params.id)) return res.status(400).json({ error: 'A recipe cannot include its own product as an ingredient.' });
    const validIng = await prisma.product.count({ where: { id: { in: ingIds }, businessId: req.user.business_id } });
    if (validIng !== ingIds.length) return res.status(400).json({ error: 'One or more ingredients were not found.' });

    const recipe = await prisma.$transaction(async (tx) => {
      const r = await tx.recipe.upsert({
        where:  { productId: req.params.id },
        update: { yieldQty: req.body.yieldQty, isActive: req.body.isActive },
        create: { businessId: req.user.business_id, productId: req.params.id, yieldQty: req.body.yieldQty, isActive: req.body.isActive },
      });
      await tx.recipeItem.deleteMany({ where: { recipeId: r.id } });
      await tx.recipeItem.createMany({ data: req.body.items.map(i => ({ recipeId: r.id, ingredientId: i.ingredient_id, quantity: i.quantity })) });
      return tx.recipe.findUnique({ where: { id: r.id }, include: { items: { include: { ingredient: { select: { id: true, name: true, sku: true } } } } } });
    });
    res.json(recipe);
  } catch (err) { next(err); }
});

router.delete('/products/:id/recipe', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const r = await prisma.recipe.deleteMany({ where: { productId: req.params.id, businessId: req.user.business_id } });
    if (!r.count) return res.status(404).json({ error: 'No recipe to delete.' });
    res.json({ message: 'Recipe removed.' });
  } catch (err) { next(err); }
});

module.exports = router;
