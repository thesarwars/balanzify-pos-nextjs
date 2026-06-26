const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { SaleSchemaV3, RefundSchema, ShiftOpenSchema, ShiftCloseSchema, HoldSaleSchema } = require('../validation/schemas');
const { trackSale, trackFraudSignal } = require('../lib/metrics');
const registry  = require('../lib/payments');
const { computeTax }   = require('../lib/tax');
const webhooks         = require('../lib/webhooks');
const { convert }        = require('../lib/currency');
const { generateReceiptToken, receiptUrl, generateWhatsAppReceipt } = require('../lib/receipt');
const creditEngine = require('../lib/credit');
const accounting = require('../lib/accounting');
const rxgate = require('../lib/rxgate');
const financing = require('../lib/financing');
const fiscal = require('../lib/fiscalization');
const router = express.Router();

// ── Cart fingerprint ──────────────────────────────────────────────────────────
function cartFingerprint(items, cashierId, tipAmount = 0) {
  const payload = items
    .map(i => `${i.product_id}:${i.variant_id || ''}:${i.quantity}:${parseFloat(i.override_price ?? 0).toFixed(4)}`)
    .sort()
    .join('|') + `|cashier:${cashierId}|tip:${tipAmount}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// ── Periodic cleanup of expired sale keys ─────────────────────────────────────
let cleanupCounter = 0;
async function maybeCleanup() {
  if (++cleanupCounter % 50 !== 0) return;
  try {
    const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000);
    const cutoff1h  = new Date(Date.now() -      3600 * 1000);
    await prisma.$transaction([
      prisma.saleKey.deleteMany({ where: { used: true,  usedAt:    { lt: cutoff48h } } }),
      prisma.saleKey.deleteMany({ where: { used: false, expiresAt: { lt: cutoff1h  } } }),
    ]);
  } catch (e) { /* non-fatal */ }
}

// ── POST /api/v1/sales/initiate ───────────────────────────────────────────────
router.post('/initiate', auth, async (req, res, next) => {
  try {
    const key = `${req.user.id}-${Date.now()}-${crypto.randomUUID()}`;
    await prisma.saleKey.create({
      data: {
        key,
        cashierId:  req.user.id,
        businessId: req.user.business_id,
        expiresAt:  new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    maybeCleanup();
    res.json({ idempotency_key: key });
  } catch (err) { next(err); }
});

// ── SHIFTS ────────────────────────────────────────────────────────────────────
router.post('/shifts/open', auth, validate(ShiftOpenSchema), async (req, res, next) => {
  try {
    const existing = await prisma.shift.findFirst({ where: { cashierId: req.user.id, status: 'open' } });
    if (existing) return res.status(400).json({ error: 'You already have an open shift.', shift_id: existing.id });
    const shift = await prisma.shift.create({
      data: {
        businessId: req.user.business_id,
        locationId: req.body.location_id || null,
        cashierId:  req.user.id,
        openingFloat: req.body.opening_float || 0,
      },
    });
    res.status(201).json(shift);
  } catch (err) { next(err); }
});

router.post('/shifts/:id/close', auth, validate(ShiftCloseSchema), async (req, res, next) => {
  try {
    const shift = await prisma.shift.findFirst({ where: { id: req.params.id, cashierId: req.user.id, status: 'open' } });
    if (!shift) return res.status(404).json({ error: 'Open shift not found.' });
    const expected = parseFloat(shift.openingFloat) + parseFloat(shift.totalCash);
    const actual   = parseFloat(req.body.actual_cash) || 0;
    const updated  = await prisma.shift.update({
      where: { id: req.params.id },
      data: { status: 'closed', closingFloat: actual, actualCash: actual, expectedCash: expected, variance: actual - expected, notes: req.body.notes, closedAt: new Date() },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

router.get('/shifts/current', auth, async (req, res, next) => {
  try {
    const shift = await prisma.shift.findFirst({
      where: { cashierId: req.user.id, status: 'open' },
      include: { location: { select: { name: true } } },
    });
    res.json(shift || null);
  } catch (err) { next(err); }
});

router.get('/shifts', auth, async (req, res, next) => {
  try {
    const shifts = await prisma.shift.findMany({
      where: { businessId: req.user.business_id },
      include: { cashier: { select: { name: true } }, location: { select: { name: true } } },
      orderBy: { openedAt: 'desc' },
      take: 50,
    });
    res.json({ shifts });
  } catch (err) { next(err); }
});

// ── HELD SALES ────────────────────────────────────────────────────────────────
router.get('/held', auth, async (req, res, next) => {
  try {
    const heldSales = await prisma.heldSale.findMany({
      where: { businessId: req.user.business_id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ held_sales: heldSales });
  } catch (err) { next(err); }
});

router.post('/held', auth, validate(HoldSaleSchema), async (req, res, next) => {
  try {
    const held = await prisma.heldSale.create({
      data: {
        businessId:   req.user.business_id,
        shiftId:      req.body.shift_id || null,
        label:        req.body.label || `Hold #${Date.now()}`,
        customerName: req.body.customer_name || null,
        items:        req.body.items,
        subtotal:     req.body.subtotal || 0,
        createdById:  req.user.id,
      },
    });
    res.status(201).json(held);
  } catch (err) { next(err); }
});

router.delete('/held/:id', auth, async (req, res, next) => {
  try {
    await prisma.heldSale.deleteMany({ where: { id: req.params.id, businessId: req.user.business_id } });
    res.json({ message: 'Hold removed.' });
  } catch (err) { next(err); }
});

// ── CHECKOUT ──────────────────────────────────────────────────────────────────
// Handles: products, variants, bundles, serialised items,
//          coupons, loyalty earn/redeem, tips, FIFO cost layers,
//          credit sales, split payments, customer balances, shift totals.
// Core sale-creation transaction, callable in-process by both the HTTP route
// and the restaurant checkout. `req` is a minimal context: { user, body, ip, get }.
// Returns the sale result (with _retry on an idempotent replay); throws errors
// carrying a statusCode.
async function createSale(req) {
    const {
      items = [],
      variant_items = [],
      customer_id,
      location_id,
      payment_method,
      discount_type,
      discount_value,
      cash_tendered,
      cash_amount,
      zaad_amount,
      card_amount,
      coupon_id,
      coupon_discount,
      loyalty_points_redeemed = 0,
      tip_amount = 0,
      tip_type,
      packing_charge = 0,
      service_charge = 0,
      service_type_id,
      custom_item,
      notes,
      type,
      shift_id,
      idempotency_key,
      display_currency,   // Optional: customer's preferred display currency
    } = req.body;

    // Merge variant_items into items array
    const allItems = [
      ...items,
      ...(variant_items || []).map(vi => ({ ...vi, _is_variant: true })),
    ];

    if (!allItems.length && !custom_item) {
      throw Object.assign(new Error('No items in cart.'), { statusCode: 400 });
    }
    if (!idempotency_key) {
      throw Object.assign(new Error('Transaction token required.'), { statusCode: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {

      // ── 1. Idempotency key — lock, validate, fingerprint ─────────────────
      const keyRows = await tx.$queryRaw`
        SELECT * FROM sale_keys
        WHERE key = ${idempotency_key}
          AND cashier_id  = ${req.user.id}::uuid
          AND business_id = ${req.user.business_id}::uuid
        FOR UPDATE
      `;

      if (!keyRows.length) {
        await prisma.activityLog.create({
          data: { businessId: req.user.business_id, userId: req.user.id, action: 'invalid_idempotency_key', entityType: 'sale', details: { key: idempotency_key } },
        });
        throw Object.assign(new Error('Invalid transaction token.'), { statusCode: 400 });
      }

      const sk = keyRows[0];
      if (new Date(sk.expires_at) < new Date()) {
        throw Object.assign(new Error('Transaction token expired.'), { statusCode: 400 });
      }

      const fingerprint = cartFingerprint(allItems, req.user.id, tip_amount);

      // Genuine retry — same key, same cart
      if (sk.used) {
        if (sk.cart_fingerprint !== fingerprint) {
          trackFraudSignal('idempotency_key_cart_mismatch');
          await prisma.activityLog.create({
            data: { businessId: req.user.business_id, userId: req.user.id, action: 'FRAUD_KEY_REUSE_CART_MISMATCH', entityType: 'sale', details: { key: idempotency_key } },
          });
          await prisma.notification.create({
            data: { businessId: req.user.business_id, type: 'fraud_alert', title: 'Suspicious POS activity', message: `Cashier ${req.user.name} reused a transaction token with a different cart.`, referenceType: 'sale_key' },
          });
          throw Object.assign(new Error('Transaction conflict.'), { statusCode: 409 });
        }
        if (sk.sale_id) {
          const orig = await tx.sale.findUnique({ where: { id: sk.sale_id }, include: { items: true } });
          return { ...orig, _retry: true };
        }
      }

      // Bind fingerprint and mark used
      await tx.$executeRaw`
        UPDATE sale_keys SET cart_fingerprint = ${fingerprint}, used = true, used_at = NOW()
        WHERE key = ${idempotency_key}
      `;

      // ── 2. Resolve location ───────────────────────────────────────────────
      const locId = location_id || (
        await tx.location.findFirst({ where: { businessId: req.user.business_id }, select: { id: true } })
      )?.id;

      // ── 3. Process items — stock, variants, serials, FIFO ────────────────
      let subtotal = 0;
      const processed = [];

      const processLineItem = async (item) => {
        // Load product
        const product = await tx.product.findUnique({
          where: { id: item.product_id },
          select: { id: true, name: true, sellingPrice: true, costPrice: true, businessId: true, isSerialized: true, sellByUnit: true, unitPrice: true, packSize: true },
        });
        if (!product || product.businessId !== req.user.business_id) {
          throw Object.assign(new Error(`Product not found: ${item.product_id}`), { statusCode: 400 });
        }

        // Load variant pricing if applicable
        let variantPrice = null;
        if (item.variant_id) {
          const variant = await tx.productVariant.findUnique({
            where: { id: item.variant_id },
            select: { sellingPrice: true, isActive: true },
          });
          if (!variant || !variant.isActive) {
            throw Object.assign(new Error(`Variant not found: ${item.variant_id}`), { statusCode: 400 });
          }
          variantPrice = parseFloat(variant.sellingPrice);
        }

        // Unit sales (pharmacy partial-pack): price is server-authoritative —
        // the client flag selects the mode, the database supplies the price.
        const isUnitSale = item.sold_by_unit === true && product.sellByUnit && product.unitPrice != null;
        const basePrice = isUnitSale
          ? parseFloat(product.unitPrice)
          : (variantPrice ?? parseFloat(product.sellingPrice));
        const unitPrice = item.override_price != null ? parseFloat(item.override_price) : basePrice;
        const lineTotal = unitPrice * item.quantity;
        // Stock scale: when a product is unit-configured, stock is in base units.
        // Unit sale deducts qty; pack sale of that product deducts qty x packSize.
        const stockQty = (product.sellByUnit && product.packSize)
          ? (isUnitSale ? item.quantity : item.quantity * product.packSize)
          : item.quantity;
        subtotal += lineTotal;

        // ── Recipe / BOM ────────────────────────────────────────────────────
        // If this product is a made-to-order item (has a recipe), it has no
        // finished-good stock — selling it depletes its INGREDIENTS instead.
        const recipe = await tx.recipe.findFirst({
          where: { productId: item.product_id, businessId: req.user.business_id, isActive: true },
          include: { items: true },
        });
        if (recipe && recipe.items.length) {
          const yieldQty = recipe.yieldQty > 0 ? recipe.yieldQty : 1;
          let recipeCogs = 0;
          for (const ri of recipe.items) {
            const deductQty = Math.round(item.quantity * parseFloat(ri.quantity) / yieldQty);
            if (deductQty <= 0) continue;

            const ingRows = await tx.$queryRaw`
              SELECT quantity FROM stock_levels
              WHERE product_id = ${ri.ingredientId}::uuid AND location_id = ${locId}::uuid
              FOR UPDATE`;
            const ingQty = ingRows[0]?.quantity ?? 0;
            if (ingQty < deductQty) {
              const ing = await tx.product.findUnique({ where: { id: ri.ingredientId }, select: { name: true } });
              throw Object.assign(
                new Error(`Insufficient ingredient stock to make ${product.name}: ${ing?.name || 'ingredient'} needs ${deductQty}, have ${ingQty}.`),
                { statusCode: 400, code: 'INSUFFICIENT_INGREDIENT' }
              );
            }
            const ingNew = ingQty - deductQty;
            await tx.$executeRaw`
              UPDATE stock_levels SET quantity = ${ingNew}, updated_at = NOW()
              WHERE product_id = ${ri.ingredientId}::uuid AND location_id = ${locId}::uuid`;

            // FIFO-cost the ingredient consumption for COGS
            let ingRemaining = deductQty, ingTotalCost = 0, ingConsumed = 0;
            const ingLayers = await tx.$queryRaw`
              SELECT id, quantity_remaining, unit_cost FROM cost_layers
              WHERE product_id = ${ri.ingredientId}::uuid AND business_id = ${req.user.business_id}::uuid
                AND (location_id = ${locId}::uuid OR location_id IS NULL) AND quantity_remaining > 0
              ORDER BY received_at ASC FOR UPDATE`;
            for (const layer of ingLayers) {
              if (ingRemaining <= 0) break;
              const consume = Math.min(ingRemaining, parseInt(layer.quantity_remaining));
              ingTotalCost += consume * parseFloat(layer.unit_cost);
              ingConsumed += consume;
              await tx.$executeRaw`UPDATE cost_layers SET quantity_remaining = ${parseInt(layer.quantity_remaining) - consume} WHERE id = ${layer.id}::uuid`;
              ingRemaining -= consume;
            }
            recipeCogs += deductQty * (ingConsumed > 0 ? ingTotalCost / ingConsumed : 0);

            await tx.stockMovement.create({
              data: {
                businessId: req.user.business_id, productId: ri.ingredientId, locationId: locId,
                type: 'sale', quantity: -deductQty, balanceAfter: ingNew,
                referenceType: 'recipe', createdById: req.user.id,
              },
            });
          }
          processed.push({
            product_id:     item.product_id,
            variant_id:     item.variant_id || null,
            quantity:       item.quantity,
            unit_price:     unitPrice,
            original_price: basePrice,
            cost_price:     item.quantity > 0 ? recipeCogs / item.quantity : 0,
            total_price:    lineTotal,
            notes:          item.notes || null,
            serial_numbers: [],
          });
          return; // ingredients depleted — skip the finished-good stock/FIFO path
        }

        // Serial number validation (before stock deduction)
        if (product.isSerialized) {
          if (!item.serial_numbers?.length || item.serial_numbers.length !== item.quantity) {
            throw Object.assign(
              new Error(`${product.name} requires ${item.quantity} serial number(s).`),
              { statusCode: 400 }
            );
          }
          for (const sn of item.serial_numbers) {
            const serial = await tx.serialNumber.findFirst({
              where: { businessId: req.user.business_id, serialNumber: sn, productId: item.product_id, status: 'in_stock' },
            });
            if (!serial) {
              throw Object.assign(new Error(`Serial number ${sn} not available.`), { statusCode: 400 });
            }
          }
        }

        // Stock lock and deduction
        if (item.variant_id) {
          const stockRows = await tx.$queryRaw`
            SELECT quantity FROM stock_levels
            WHERE product_id = ${item.product_id}::uuid
              AND location_id = ${locId}::uuid
              AND (variant_id = ${item.variant_id}::uuid OR variant_id IS NULL)
            FOR UPDATE
          `;
          const qty = stockRows[0]?.quantity || 0;
          if (qty < stockQty) {
            throw Object.assign(new Error(`Insufficient stock for variant of ${product.name}. Available: ${qty}`), { statusCode: 400 });
          }
          const newQty = qty - stockQty;
          await tx.$executeRaw`
            UPDATE stock_levels SET quantity = ${newQty}, updated_at = NOW()
            WHERE product_id = ${item.product_id}::uuid AND location_id = ${locId}::uuid
              AND (variant_id = ${item.variant_id}::uuid OR variant_id IS NULL)
          `;
        } else {
          const stockRows = await tx.$queryRaw`
            SELECT quantity FROM stock_levels
            WHERE product_id = ${item.product_id}::uuid AND location_id = ${locId}::uuid
            FOR UPDATE
          `;
          const qty = stockRows[0]?.quantity || 0;
          if (qty < stockQty) {
            throw Object.assign(new Error(`Insufficient stock for ${product.name}. Available: ${qty}`), { statusCode: 400 });
          }
          const newQty = qty - stockQty;
          await tx.$executeRaw`
            INSERT INTO stock_levels (id, product_id, location_id, quantity)
            VALUES (gen_random_uuid(), ${item.product_id}::uuid, ${locId}::uuid, ${newQty})
            ON CONFLICT (product_id, location_id)
            DO UPDATE SET quantity = ${newQty}, updated_at = NOW()
          `;
        }

        // FIFO cost layer consumption — deduct from oldest layers first
        let remaining = stockQty;
        const layers = await tx.$queryRaw`
          SELECT id, quantity_remaining, unit_cost
          FROM cost_layers
          WHERE product_id = ${item.product_id}::uuid
            AND business_id = ${req.user.business_id}::uuid
            AND (location_id = ${locId}::uuid OR location_id IS NULL)
            AND quantity_remaining > 0
          ORDER BY received_at ASC
          FOR UPDATE
        `;

        let fifoUnitCost = parseFloat(product.costPrice); // fallback
        if (layers.length) {
          let totalCost = 0, totalConsumed = 0;
          for (const layer of layers) {
            if (remaining <= 0) break;
            const consume = Math.min(remaining, parseInt(layer.quantity_remaining));
            totalCost += consume * parseFloat(layer.unit_cost);
            totalConsumed += consume;
            const newRemaining = parseInt(layer.quantity_remaining) - consume;
            await tx.$executeRaw`
              UPDATE cost_layers SET quantity_remaining = ${newRemaining} WHERE id = ${layer.id}::uuid
            `;
            remaining -= consume;
          }
          if (totalConsumed > 0) fifoUnitCost = totalCost / totalConsumed;
        }

        // Stock movement
        const finalStock = (await tx.$queryRaw`
          SELECT quantity FROM stock_levels
          WHERE product_id = ${item.product_id}::uuid AND location_id = ${locId}::uuid
        `)[0]?.quantity ?? 0;

        await tx.stockMovement.create({
          data: {
            businessId:   req.user.business_id,
            productId:    item.product_id,
            variantId:    item.variant_id || null,
            locationId:   locId,
            type:         'sale',
            quantity:     -item.quantity,
            balanceAfter: finalStock,
            referenceType: 'sale',
            createdById:  req.user.id,
          },
        });

        // Mark serial numbers sold (after stock deduction succeeds)
        if (product.isSerialized && item.serial_numbers?.length) {
          for (const sn of item.serial_numbers) {
            await tx.serialNumber.updateMany({
              where: { businessId: req.user.business_id, serialNumber: sn, productId: item.product_id },
              data: { status: 'sold' },
            });
          }
        }

        processed.push({
          product_id:     item.product_id,
          variant_id:     item.variant_id || null,
          quantity:       item.quantity,
          unit_price:     unitPrice,
          original_price: basePrice,
          cost_price:     fifoUnitCost,
          total_price:    lineTotal,
          notes:          item.notes || null,
          serial_numbers: item.serial_numbers || [],
        });
      };

      // Process regular + variant items
      for (const item of allItems) await processLineItem(item);

      // Process custom item (open price, no stock)
      if (custom_item) {
        const lineTotal = parseFloat(custom_item.price) * (custom_item.quantity || 1);
        subtotal += lineTotal;
        processed.push({
          product_id: null, variant_id: null, quantity: custom_item.quantity || 1,
          unit_price: parseFloat(custom_item.price), original_price: parseFloat(custom_item.price),
          cost_price: 0, total_price: lineTotal, notes: custom_item.name,
          _custom: true,
        });
      }

      // ── 3b. Compute tax on processed lines ───────────────────────────────
      // Tax is computed after discounts (applied per-line) but before totals.
      // Each product may have its own tax rate; falls back to business default.
      const taxItems = processed.map(p => ({
        lineTotal:  p.total_price,
        taxRateId:  p.tax_rate_id || null,
        productId:  p.product_id,
      }));
      const taxResult = await computeTax(taxItems, req.user.business_id);
      // Merge tax amounts back into processed items
      taxResult.lines.forEach((tl, idx) => {
        processed[idx].tax_amount  = tl.taxAmount  || 0;
        processed[idx].tax_rate_id = tl.taxRateId  || null;
      });
      const lineTax = taxResult.totalTax;

      // ── 4. Bundle expansion ───────────────────────────────────────────────
      // Bundles are sent as bundle_id — expand into constituent items
      // (Bundle logic hooks here if bundle_id is added to schema later)

      // ── 5. Coupon — atomic lock + SERVER-SIDE discount computation ────────
      // Never trust the client's coupon_discount. Lock the coupon row, verify
      // validity + min_purchase, and recompute the discount from the coupon's
      // own type/value (mirrors POST /coupons/validate). This closes a money
      // leak where any client could pass an arbitrary discount amount.
      let couponAmt = 0;
      if (coupon_id) {
        const couponRows = await tx.$queryRaw`
          SELECT id, type, value, min_purchase, max_uses, uses_count FROM coupons
          WHERE id = ${coupon_id}::uuid
            AND business_id = ${req.user.business_id}::uuid
            AND is_active = true
            AND (valid_from  IS NULL OR valid_from  <= CURRENT_DATE)
            AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
            AND (max_uses IS NULL OR uses_count < max_uses)
          FOR UPDATE
        `;
        if (!couponRows.length) {
          throw Object.assign(new Error('Coupon is no longer valid or usage limit reached.'), { statusCode: 400 });
        }
        const c = couponRows[0];
        if (subtotal < parseFloat(c.min_purchase)) {
          throw Object.assign(new Error(`Minimum purchase of ${c.min_purchase} required for this coupon.`), { statusCode: 400, code: 'MIN_PURCHASE_NOT_MET' });
        }
        const val = parseFloat(c.value) || 0;
        couponAmt = c.type === 'pct' ? subtotal * val / 100 : Math.min(subtotal, val);
        couponAmt = parseFloat(couponAmt.toFixed(2));
      }

      // ── 6. Loyalty — validate redemption ─────────────────────────────────
      let loyaltyDiscountAmt = 0;
      let loyaltyRule = null;
      if (customer_id && loyalty_points_redeemed > 0) {
        loyaltyRule = await tx.loyaltyRule.findUnique({ where: { businessId: req.user.business_id } });
        if (!loyaltyRule || !loyaltyRule.isActive) {
          throw Object.assign(new Error('Loyalty programme is not active.'), { statusCode: 400 });
        }
        if (loyalty_points_redeemed < loyaltyRule.minRedeemPoints) {
          throw Object.assign(
            new Error(`Minimum redemption is ${loyaltyRule.minRedeemPoints} points.`),
            { statusCode: 400 }
          );
        }
        // Lock customer row to check points balance
        const custRows = await tx.$queryRaw`
          SELECT loyalty_points FROM customers
          WHERE id = ${customer_id}::uuid AND business_id = ${req.user.business_id}::uuid
          FOR UPDATE
        `;
        if (!custRows.length) throw Object.assign(new Error('Customer not found.'), { statusCode: 404 });
        const balance = parseInt(custRows[0].loyalty_points) || 0;
        if (balance < loyalty_points_redeemed) {
          throw Object.assign(
            new Error(`Insufficient loyalty points. Available: ${balance}`),
            { statusCode: 400 }
          );
        }
        loyaltyDiscountAmt = loyalty_points_redeemed * parseFloat(loyaltyRule.dollarPerPoint);
      }

      // ── 7. Calculate totals ───────────────────────────────────────────────
      const discAmt = discount_type === 'pct'
        ? subtotal * (parseFloat(discount_value) || 0) / 100
        : Math.min(subtotal, parseFloat(discount_value) || 0);
      // couponAmt was computed server-side in step 5 (never trust the client).
      const tipAmt     = tip_type === 'pct'
        ? subtotal * (parseFloat(tip_amount) || 0) / 100
        : parseFloat(tip_amount) || 0;
      const packAmt    = parseFloat(packing_charge) || 0;
      const svcChargeAmt = parseFloat(service_charge) || 0;

      const total = Math.max(0, subtotal - discAmt - couponAmt - loyaltyDiscountAmt + tipAmt + packAmt + svcChargeAmt + lineTax);

      // ── 7a. Validate all payment legs via the provider registry ──────────
      // payments[] is an array of tender lines: [{ method, amount, ... }]
      // Single payment: synthesized from payment_method + total
      // Split payment: each element in payments[] is a separate provider call
      const tenders = req.body.payments?.length
        ? req.body.payments
        : [{ method: payment_method || 'cash', amount: total,
             phone: req.body.phone, reference: req.body.payment_reference,
             tendered: cash_tendered }];

      // Validate all providers before touching stock or recording the sale
      for (const tender of tenders) {
        if (!registry.has(tender.method)) {
          throw Object.assign(
            new Error(`Unknown payment method: '${tender.method}'`),
            { statusCode: 400, code: 'UNKNOWN_PAYMENT_METHOD' }
          );
        }
        if (!(parseFloat(tender.amount) >= 0)) {
          throw Object.assign(
            new Error('Tender amount must be a non-negative number.'),
            { statusCode: 400, code: 'INVALID_TENDER_AMOUNT' }
          );
        }
      }

      // The tender legs must add up to the order total. Without this a split
      // sale could be recorded as fully paid while under-tendered (money leak).
      const tenderedTotal = tenders.reduce((s, t) => s + parseFloat(t.amount), 0);
      if (Math.abs(tenderedTotal - total) > 0.01) {
        throw Object.assign(
          new Error(`Payment legs (${tenderedTotal.toFixed(2)}) do not match the order total (${total.toFixed(2)}).`),
          { statusCode: 400, code: 'TENDER_TOTAL_MISMATCH' }
        );
      }

      // Legacy compatibility fields (kept for shift totals and backwards compat reporting)
      const pm = tenders[0]?.method || 'cash';
      const cashPaid = tenders.filter(t => t.method === 'cash').reduce((s, t) => s + parseFloat(t.amount), 0);
      const zaadPaid = tenders.filter(t => t.method === 'zaad').reduce((s, t) => s + parseFloat(t.amount), 0);
      const cardPaid = tenders.filter(t => ['stripe','visa','mastercard'].includes(t.method)).reduce((s, t) => s + parseFloat(t.amount), 0);
      const amountPaid = pm === 'credit' ? 0 : total;
      const change = cashPaid > 0 ? Math.max(0, (parseFloat(cash_tendered) || cashPaid) - total) : 0;

      // ── 8. Loyalty — compute points earned ───────────────────────────────
      let pointsEarned = 0;
      if (customer_id && pm !== 'credit') {
        if (!loyaltyRule) loyaltyRule = await tx.loyaltyRule.findUnique({ where: { businessId: req.user.business_id } });
        if (loyaltyRule?.isActive) {
          pointsEarned = Math.floor(total * parseFloat(loyaltyRule.pointsPerDollar));
        }
      }

      // ── 9. Create sale record ─────────────────────────────────────────────
      const sale = await tx.sale.create({
        data: {
          businessId:    req.user.business_id,
          shiftId:       shift_id || null,
          locationId:    locId,
          customerId:    customer_id || null,
          couponId:      coupon_id || null,
          receiptToken:  generateReceiptToken(),
          saleNumber:    `SO-${Date.now()}`,
          type:          type || 'pos',
          subtotal,
          discountType:  discount_type || 'pct',
          discountValue: parseFloat(discount_value) || 0,
          discountAmount: discAmt,
          couponDiscount: couponAmt,
          loyaltyDiscount: loyaltyDiscountAmt,
          loyaltyPointsEarned:   pointsEarned,
          loyaltyPointsRedeemed: loyalty_points_redeemed,
          taxAmount:     lineTax,
          tipAmount:     tipAmt,
          packingCharge: packAmt,
          serviceCharge: svcChargeAmt,
          serviceTypeId: service_type_id || null,
          totalAmount:   total,
          amountPaid,
          amountDue:     total - amountPaid,
          paymentMethod: pm,
          cashAmount:    cashPaid,
          zaadAmount:    zaadPaid,
          cardAmount:    cardPaid,
          cashTendered:  parseFloat(cash_tendered) || 0,
          changeGiven:   change,
          notes:         notes || null,
          cashierId:     req.user.id,
        },
      });

      // ── 10. Create sale items (skip custom items with no product_id) ──────
      const saleItemData = processed
        .filter(p => p.product_id && !p._custom)
        .map(p => ({
          saleId:        sale.id,
          productId:     p.product_id,
          variantId:     p.variant_id || null,
          quantity:      p.quantity,
          unitPrice:     p.unit_price,
          originalPrice: p.original_price,
          costPrice:     p.cost_price,
          totalPrice:    p.total_price,
          taxAmount:     p.tax_amount  || 0,
          taxRateId:     p.tax_rate_id || null,
          notes:         p.notes || null,
        }));
      if (saleItemData.length) await tx.saleItem.createMany({ data: saleItemData });

      // ── 11. Coupon: atomic uses_count increment ───────────────────────────
      if (coupon_id) {
        await tx.$executeRaw`
          UPDATE coupons SET uses_count = uses_count + 1
          WHERE id = ${coupon_id}::uuid
            AND (max_uses IS NULL OR uses_count < max_uses)
        `;
      }

      // ── 11a. Post to credit ledger if credit sale ───────────────────────────
      if (pm === 'credit' && customer_id) {
        await creditEngine.postDebit(tx, {
          businessId:   req.user.business_id,
          customerId:   customer_id,
          amount:       total,
          currency:     req.user.currency || 'USD',
          saleId:       sale.id,
          description:  `Credit sale ${sale.saleNumber || ''}`.trim(),
          recordedById: req.user.id,
        });
      }

      // ── 11b. Execute payment provider charges + write SalePayment records ─
      const paymentResults = [];
      for (const tender of tenders) {
        const provider = registry.get(tender.method);
        let result;
        try {
          result = await provider.charge({
            amount:    parseFloat(tender.amount),
            currency:  req.body.currency || req.user.currency || 'USD',
            phone:     tender.phone      || null,
            reference: tender.reference  || `${sale.id}-${tender.method}`,
            tendered:  tender.tendered   || null,
            customerId: customer_id      || null,
            creditLimit: customer_id ? undefined : null,
            meta: { sale_id: sale.id, cashier_id: req.user.id },
          });
        } catch (chargeErr) {
          // Payment provider rejected — roll back by throwing (transaction aborts)
          throw chargeErr;
        }

        await tx.salePayment.create({
          data: {
            businessId:        req.user.business_id,
            saleId:            sale.id,
            provider:          tender.method,
            amount:            parseFloat(tender.amount),
            currency:          req.body.currency || 'USD',
            status:            result.status === 'completed' ? 'completed' : 'pending',
            providerReference: result.reference || null,
            phone:             result.phone     || tender.phone || null,
            last4:             result.last4      || null,
            brand:             result.brand      || null,
            tendered:          result.tendered   || null,
            change:            result.change     || null,
            rawResponse:       result.rawResponse || null,
            note:              result.note        || null,
            completedAt:       result.status === 'completed' ? new Date() : null,
          },
        });

        // An unconfirmed async charge (e.g. M-Pesa STK push) is "in-transit": tag
        // the tender so the GL books it to clearing (1015), not real cash.
        tender.pending = result.status !== 'completed';
        paymentResults.push(result);
      }

      // If any leg is still awaiting confirmation, the sale isn't settled yet —
      // keep it pending until the provider's callback confirms (or fails) it.
      if (paymentResults.some(r => r && r.status && r.status !== 'completed')) {
        await tx.sale.update({ where: { id: sale.id }, data: { status: 'pending' } });
      }

      // ── 12. Loyalty: apply earn and redemption ────────────────────────────
      if (customer_id && (pointsEarned > 0 || loyalty_points_redeemed > 0)) {
        const netDelta = pointsEarned - loyalty_points_redeemed;

        // Update customer balance
        await tx.customer.update({
          where: { id: customer_id },
          data: { loyaltyPoints: { increment: netDelta } },
        });

        // Earn ledger entry
        if (pointsEarned > 0) {
          const newBalance = await tx.customer.findUnique({ where: { id: customer_id }, select: { loyaltyPoints: true } });
          await tx.loyaltyLedger.create({
            data: {
              businessId:  req.user.business_id,
              customerId:  customer_id,
              saleId:      sale.id,
              type:        'earn',
              points:      pointsEarned,
              balanceAfter: newBalance.loyaltyPoints,
              notes:       `Earned on sale ${sale.saleNumber}`,
              createdById: req.user.id,
            },
          });
        }

        // Redeem ledger entry
        if (loyalty_points_redeemed > 0) {
          const newBalance = await tx.customer.findUnique({ where: { id: customer_id }, select: { loyaltyPoints: true } });
          await tx.loyaltyLedger.create({
            data: {
              businessId:  req.user.business_id,
              customerId:  customer_id,
              saleId:      sale.id,
              type:        'redeem',
              points:      -loyalty_points_redeemed,
              balanceAfter: newBalance.loyaltyPoints,
              notes:       `Redeemed on sale ${sale.saleNumber}`,
              createdById: req.user.id,
            },
          });
        }
      }

      // ── 13. Link sale key to sale ─────────────────────────────────────────
      await tx.$executeRaw`UPDATE sale_keys SET sale_id = ${sale.id}::uuid WHERE key = ${idempotency_key}`;

      // ── 14. Update serial numbers with sale reference ─────────────────────
      for (const p of processed) {
        if (p.serial_numbers?.length) {
          await tx.serialNumber.updateMany({
            where: { businessId: req.user.business_id, serialNumber: { in: p.serial_numbers }, productId: p.product_id },
            data: { saleId: sale.id },
          });
        }
      }

      // ── 15. Customer balances ─────────────────────────────────────────────
      if (customer_id) {
        await tx.customer.update({
          where: { id: customer_id },
          data: {
            totalPurchases:    { increment: total },
            // outstandingBalance updated via credit ledger below — not directly
          },
        });
      }

      // ── 15b. General ledger — post the sale's double-entry journal ────────
      // COGS = sum of the (FIFO/recipe) cost of every stocked line just sold.
      const saleCogs = processed.reduce((s, p) => s + (p.product_id ? parseFloat(p.cost_price || 0) * p.quantity : 0), 0);
      await accounting.postSale(tx, {
        businessId:  req.user.business_id,
        sale,
        tenders,
        taxAmount:   lineTax,
        cogs:        saleCogs,
        createdById: req.user.id,
      });

      // Auto-collect a fixed share of the takings toward any active financing
      // advance (the lock-in mechanic), crediting the account the money landed in.
      await financing.autoCollect(tx, { businessId: req.user.business_id, tenders, createdById: req.user.id });

      // ── 16. Shift totals ──────────────────────────────────────────────────
      if (shift_id) {
        await tx.shift.update({
          where: { id: shift_id },
          data: {
            totalSales:        { increment: total },
            totalTransactions: { increment: 1 },
            totalCash:         { increment: cashPaid },
            totalZaad:         { increment: zaadPaid },
            totalCard:         { increment: cardPaid },
          },
        });
      }

      // Multi-currency display: convert total to customer's preferred currency if different from business currency
      let displayAmount = null;
      const bizCurrency = req.user.currency || 'USD';
      if (display_currency && display_currency !== bizCurrency) {
        try {
          const converted = await convert(parseFloat(sale.totalAmount), bizCurrency, display_currency, req.user.business_id);
          displayAmount = { amount: converted.amount, currency: display_currency, rate: converted.rate };
        } catch { /* non-fatal — display conversion is cosmetic */ }
      }

      return {
        ...sale,
        items:                  processed,
        loyalty_points_earned:  pointsEarned,
        payment_results:        paymentResults,
        tax_breakdown:          taxResult.breakdown,
        display_amount:         displayAmount,
        business_currency:      bizCurrency,
      };

    }, { timeout: 15000, isolationLevel: 'Serializable' });

    trackSale(
      parseFloat(result.totalAmount ?? result.total_amount ?? 0),
      result.paymentMethod ?? result.payment_method ?? 'cash'
    );

    // Auto-send WhatsApp receipt if customer has WhatsApp number
    if (result.customerId) {
      try {
        const customer = await prisma.customer.findUnique({
          where: { id: result.customerId },
          select: { name: true, whatsapp: true, phone: true },
        });
        const phone = customer?.whatsapp || customer?.phone;
        if (phone && result.receiptToken) {
          const business  = await prisma.business.findUnique({ where: { id: req.user.business_id } });
          const url       = receiptUrl(result.receiptToken);
          const items     = (result.items || []).map(i => ({
            productName: i.productName || i.product_name || i.name || 'Item',
            quantity:    i.quantity,
            unitPrice:   i.unitPrice   || i.unit_price   || 0,
            totalPrice:  i.totalPrice  || i.total_price  || 0,
          }));
          const message = generateWhatsAppReceipt({ sale: result, items, business, receiptUrl: url });
          const normalizedPhone = phone.replace(/\D/g, '').replace(/^0/, '');
          // Log it — actual sending is via wa.me (WhatsApp Business API in future)
          await prisma.whatsappLog.create({
            data: {
              businessId:    req.user.business_id,
              recipientPhone: normalizedPhone,
              messageType:   'receipt',
              content:       message,
              referenceType: 'sale',
              referenceId:   result.id,
            },
          });
          // Return wa_url in response so POS can open it with one tap
          result._wa_url = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
          result._receipt_url = url;
        }
      } catch (waErr) {
        logger.warn('auto_whatsapp_receipt_failed', { message: waErr.message, sale_id: result.id });
      }
    }

    // Fiscalize — sign the sale for the tax authority if the business has a fiscal
    // device. Best-effort and offline-safe: a failure leaves the sale unsigned in
    // the /fiscal/pending queue rather than blocking the sale. No-op when disabled.
    if (!result._retry) {
      try {
        const fr = await fiscal.fiscalizeSale(result.id, req.user.business_id);
        if (fr && !fr.skipped) {
          result._fiscal = { invoice_label: fr.invoiceLabel, verification_code: fr.verificationCode, qr_data: fr.qrData };
        }
      } catch (fErr) {
        logger.warn('auto_fiscalize_failed', { message: fErr.message, sale_id: result.id });
      }
    }

    // Emit webhook — non-blocking, never affects the response
    webhooks.emit(req.user.business_id, 'sale.completed', {
      sale_id:        result.id,
      sale_number:    result.saleNumber    ?? result.sale_number,
      total_amount:   result.totalAmount   ?? result.total_amount,
      payment_method: result.paymentMethod ?? result.payment_method,
      customer_id:    result.customerId    ?? result.customer_id    ?? null,
      cashier_id:     req.user.id,
      items_count:    result.items?.length ?? 0,
    }).catch(() => {});

    return result;
}

// Thin HTTP wrapper around the in-process sale service.
router.post('/', auth, validate(SaleSchemaV3), async (req, res, next) => {
  try {
    // Pharmacy Rx-only gate (no-op unless the business has enforcement on).
    const gate = await rxgate.check({ businessId: req.user.business_id, items: req.body.items || [] });
    if (gate.error) return res.status(400).json({ error: gate.error });

    const result = await createSale(req);

    // Record the clinical fill against each linked Rx once the sale is committed.
    if (gate.linked?.length && result?.id) {
      await rxgate.recordDispenses({ user: req.user, sale: result, linked: gate.linked });
    }
    res.status(result._retry ? 200 : 201).json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// ── GET /api/v1/sales/summary/today ──────────────────────────────────────────
router.get('/summary/today', auth, async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const [totals, byMethod] = await Promise.all([
      prisma.sale.aggregate({
        where: { businessId: req.user.business_id, createdAt: { gte: today }, status: 'completed' },
        _count: { id: true },
        _sum: { totalAmount: true, cashAmount: true, zaadAmount: true, cardAmount: true, discountAmount: true, tipAmount: true },
      }),
      prisma.sale.groupBy({
        by: ['paymentMethod'],
        where: { businessId: req.user.business_id, createdAt: { gte: today }, status: 'completed' },
        _sum: { totalAmount: true }, _count: { id: true },
      }),
    ]);
    res.json({
      total_transactions: totals._count.id,
      total_sales:   totals._sum.totalAmount  || 0,
      cash_sales:    totals._sum.cashAmount   || 0,
      zaad_sales:    totals._sum.zaadAmount   || 0,
      card_sales:    totals._sum.cardAmount   || 0,
      total_discounts: totals._sum.discountAmount || 0,
      total_tips:    totals._sum.tipAmount    || 0,
      by_method: byMethod,
    });
  } catch (err) { next(err); }
});

// ── GET /api/v1/sales ─────────────────────────────────────────────────────────
router.get('/', auth, async (req, res, next) => {
  try {
    const { page = 1, limit = 50, from, to, payment_method, status, customer_id, cashier_id, search } = req.query;
    const where = {
      businessId: req.user.business_id,
      ...(from           && { createdAt:    { gte: new Date(from) } }),
      ...(to             && { createdAt:    { lte: new Date(new Date(to).setDate(new Date(to).getDate() + 1)) } }),
      ...(payment_method && { paymentMethod: payment_method }),
      ...(status         && { status }),
      ...(customer_id    && { customerId:   customer_id }),
      ...(cashier_id     && { cashierId:    cashier_id }),
      ...(search         && { saleNumber:   { contains: search, mode: 'insensitive' } }),
    };
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: { cashier: { select: { name: true } }, customer: { select: { name: true } }, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
        take:    parseInt(limit),
        skip:    (parseInt(page) - 1) * parseInt(limit),
      }),
      prisma.sale.count({ where }),
    ]);
    res.json({ sales, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
});

// ── GET /api/v1/sales/:id ─────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res, next) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        cashier:  { select: { name: true } },
        customer: { select: { name: true, phone: true, loyaltyPoints: true } },
        coupon:   { select: { code: true, type: true, value: true } },
        items:    { include: { product: { select: { name: true, sku: true } }, variant: { select: { attributes: true, sku: true } } } },
        refunds:  { select: { refundNumber: true, totalRefunded: true, createdAt: true, reason: true } },
      },
    });
    if (!sale || sale.businessId !== req.user.business_id) {
      return res.status(404).json({ error: 'Not found.' });
    }
    res.json(sale);
  } catch (err) { next(err); }
});

// ── POST /api/v1/sales/:id/refund ─────────────────────────────────────────────
router.post('/:id/refund', auth, requireRole('owner', 'manager'), validate(RefundSchema), async (req, res, next) => {
  try {
    const { items, reason, refund_method, restock } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'No items.' });

    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, businessId: true, locationId: true, totalAmount: true, taxAmount: true,
        loyaltyPointsEarned: true, customerId: true,
        items: { select: { id: true, productId: true, quantity: true, unitPrice: true, costPrice: true } },
      },
    });
    if (!sale || sale.businessId !== req.user.business_id) {
      return res.status(404).json({ error: 'Sale not found.' });
    }

    // Build authoritative maps from the ORIGINAL sale — never trust client price/qty.
    const soldById = new Map(sale.items.map(si => [si.id, si]));

    // How much has already been refunded per sale_item, so we can't over-refund.
    const priorRefunds = await prisma.refundItem.groupBy({
      by: ['saleItemId'],
      where: { saleItemId: { in: sale.items.map(si => si.id) }, refund: { saleId: sale.id } },
      _sum: { quantity: true },
    });
    const refundedById = new Map(priorRefunds.map(r => [r.saleItemId, r._sum.quantity || 0]));

    // Validate + normalise each requested line against the source of truth.
    const validItems = [];
    for (const reqItem of items) {
      const si = soldById.get(reqItem.sale_item_id);
      if (!si) return res.status(400).json({ error: `Sale item ${reqItem.sale_item_id} does not belong to this sale.` });
      const alreadyRefunded = refundedById.get(si.id) || 0;
      const remaining = si.quantity - alreadyRefunded;
      if (reqItem.quantity > remaining) {
        return res.status(400).json({
          error: `Cannot refund ${reqItem.quantity} of item ${si.id}; only ${remaining} remain (sold ${si.quantity}, already refunded ${alreadyRefunded}).`,
          code: 'OVER_REFUND',
        });
      }
      validItems.push({
        sale_item_id: si.id,
        product_id:   si.productId,            // from the sale, not the client
        quantity:     reqItem.quantity,
        unit_price:   parseFloat(si.unitPrice), // original price, not the client's
        cost_price:   parseFloat(si.costPrice || 0), // FIFO cost captured at sale
        restock:      reqItem.restock !== false,
      });
    }

    const refund = await prisma.$transaction(async (tx) => {
      const totalRefunded = parseFloat(
        validItems.reduce((s, i) => s + i.unit_price * i.quantity, 0).toFixed(2)
      );

      const refundRecord = await tx.refund.create({
        data: {
          businessId:    req.user.business_id,
          saleId:        req.params.id,
          refundNumber:  `REF-${Date.now()}`,
          reason,
          totalRefunded,
          refundMethod:  refund_method || 'cash',
          restocked:     restock !== false,
          createdById:   req.user.id,
          items: {
            create: validItems.map(item => ({
              saleItemId: item.sale_item_id,
              productId:  item.product_id,
              quantity:   item.quantity,
              unitPrice:  item.unit_price,
              totalPrice: parseFloat((item.unit_price * item.quantity).toFixed(2)),
              restock:    item.restock,
            })),
          },
        },
      });

      // Restock + movements. Returned goods re-enter inventory as a fresh FIFO
      // cost layer (at the cost they left at), and their COGS is reversed below —
      // without this the books overstated COGS and understated inventory.
      let restockCost = 0;
      for (const item of validItems) {
        if (item.restock !== false && sale.locationId) {
          await tx.$executeRaw`
            INSERT INTO stock_levels (id, product_id, location_id, quantity)
            VALUES (gen_random_uuid(), ${item.product_id}::uuid, ${sale.locationId}::uuid, ${item.quantity})
            ON CONFLICT (product_id, location_id)
            DO UPDATE SET quantity = stock_levels.quantity + ${item.quantity}
          `;
          await tx.stockMovement.create({
            data: {
              businessId:    req.user.business_id,
              productId:     item.product_id,
              locationId:    sale.locationId,
              type:          'return',
              quantity:      item.quantity,
              referenceId:   refundRecord.id,
              referenceType: 'refund',
              createdById:   req.user.id,
            },
          });
          if (item.cost_price > 0) {
            restockCost += item.cost_price * item.quantity;
            await tx.costLayer.create({
              data: {
                businessId: req.user.business_id, productId: item.product_id, locationId: sale.locationId,
                quantityReceived: item.quantity, quantityRemaining: item.quantity, unitCost: item.cost_price,
              },
            });
          }
        }
      }

      // GL: a refund is a sale reversal. Money goes back to the customer
      // (reversing revenue + its tax share), and any restocked goods reverse COGS.
      const saleTotalAmt = parseFloat(sale.totalAmount) || 0;
      const taxPortion = saleTotalAmt > 0 ? +(totalRefunded * (parseFloat(sale.taxAmount || 0) / saleTotalAmt)).toFixed(2) : 0;
      const revenuePortion = +(totalRefunded - taxPortion).toFixed(2);
      await accounting.postJournal(tx, {
        businessId: req.user.business_id, description: `Refund — ${refundRecord.refundNumber}`,
        sourceType: 'sale_refund', sourceId: refundRecord.id, createdById: req.user.id,
        lines: [
          { code: '4000', debit: revenuePortion, credit: 0, description: 'Sales return' },
          { code: '2100', debit: taxPortion,     credit: 0, description: 'Tax reversed' },
          { code: accounting.tenderAccountCode(refund_method || 'cash'), debit: 0, credit: totalRefunded, description: 'Refund paid out' },
        ],
      });
      if (restockCost > 0) {
        await accounting.postJournal(tx, {
          businessId: req.user.business_id, description: `Refund restock — ${refundRecord.refundNumber}`,
          sourceType: 'sale_refund_cogs', sourceId: refundRecord.id, createdById: req.user.id,
          lines: [
            { code: '1200', debit: +restockCost.toFixed(2), credit: 0, description: 'Inventory restocked' },
            { code: '5000', debit: 0, credit: +restockCost.toFixed(2), description: 'COGS reversed' },
          ],
        });
      }

      // Reverse loyalty points earned on this sale
      if (sale.customerId && sale.loyaltyPointsEarned > 0) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { loyaltyPoints: { decrement: sale.loyaltyPointsEarned } },
        });
        const newBal = await tx.customer.findUnique({ where: { id: sale.customerId }, select: { loyaltyPoints: true } });
        await tx.loyaltyLedger.create({
          data: {
            businessId:  req.user.business_id,
            customerId:  sale.customerId,
            saleId:      req.params.id,
            type:        'adjust',
            points:      -sale.loyaltyPointsEarned,
            balanceAfter: Math.max(0, newBal.loyaltyPoints),
            notes:       `Points reversed on refund ${refundRecord.refundNumber}`,
            createdById: req.user.id,
          },
        });
      }

      const saleTotal = parseFloat(sale.totalAmount);
      await tx.sale.update({
        where: { id: req.params.id },
        data: { status: totalRefunded >= saleTotal ? 'refunded' : 'partially_refunded' },
      });

      return refundRecord;
    });

    webhooks.emit(req.user.business_id, 'sale.refunded', {
      refund_id:      refund.id,
      sale_id:        req.params.id,
      total_refunded: parseFloat(refund.totalRefunded),
      refund_method:  refund.refundMethod,
    }).catch(() => {});

    res.status(201).json(refund);
  } catch (err) { next(err); }
});

// ── POST /api/v1/customers/:id/payment ────────────────────────────────────────
// Record a credit repayment — posts to ledger, updates balance
router.post('/customer-payment', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const { customer_id, amount, payment_method, reference, notes } = req.body;
    if (!customer_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'customer_id and positive amount required.' });
    }
    const customer = await prisma.customer.findFirst({
      where: { id: customer_id, businessId: req.user.business_id },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    // Run in a transaction so the balance read + ledger write are atomic;
    // prevents concurrent repayments from both passing the balance check.
    const newBalance = await prisma.$transaction((tx) => creditEngine.postRepayment(tx, {
      businessId:    req.user.business_id,
      customerId:    customer_id,
      amount:        parseFloat(amount),
      currency:      req.user.currency || 'USD',
      paymentMethod: payment_method || null,
      reference:     reference      || null,
      description:   notes          || 'Credit repayment',
      recordedById:  req.user.id,
    }));

    res.json({ message: 'Payment recorded.', outstanding_balance: newBalance });
  } catch (err) {
    if (err.code === 'EXCEEDS_BALANCE') return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.createSale = createSale; // in-process sale service (used by restaurant checkout)
module.exports = router;
