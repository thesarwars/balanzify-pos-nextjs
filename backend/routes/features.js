const express = require('express');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  CouponSchema, ApplyCouponSchema, LoyaltyRuleSchema, PettyCashSchema,
  BundleSchema, ScheduledReportSchema, CustomerSegmentSchema,
  BarcodeJobSchema, SupplierCatalogImportSchema,
} = require('../validation/schemas');

// ══════════════════════════════════════════════════════════════════════════════
// COUPONS
// ══════════════════════════════════════════════════════════════════════════════
const couponsRouter = express.Router();

couponsRouter.get('/', auth, async (req, res, next) => {
  try {
    const coupons = await prisma.coupon.findMany({
      where: { businessId: req.user.business_id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ coupons });
  } catch (err) { next(err); }
});

couponsRouter.post('/', auth, requireRole('owner', 'manager'), validate(CouponSchema), async (req, res, next) => {
  try {
    const { code, description, type, value, min_purchase, max_uses, per_customer_limit, valid_from, valid_until, is_active } = req.body;
    const coupon = await prisma.coupon.create({
      data: {
        businessId: req.user.business_id,
        code: code.toUpperCase().trim(),
        description,
        type,
        value,
        minPurchase: min_purchase || 0,
        maxUses: max_uses || null,
        perCustomerLimit: per_customer_limit || 1,
        validFrom: valid_from ? new Date(valid_from) : null,
        validUntil: valid_until ? new Date(valid_until) : null,
        isActive: is_active ?? true,
        createdById: req.user.id,
      },
    });
    res.status(201).json(coupon);
  } catch (err) {
    // Unique constraint violation — code already exists
    if (err.code === 'P2002') return res.status(409).json({ title: `Coupon code '${req.body.code}' already exists`, status: 409 });
    next(err);
  }
});

couponsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(CouponSchema.partial()), async (req, res, next) => {
  try {
    const { description, type, value, min_purchase, max_uses, per_customer_limit, valid_from, valid_until, is_active } = req.body;
    const coupon = await prisma.coupon.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: {
        description,
        type,
        value,
        minPurchase: min_purchase,
        maxUses: max_uses,
        perCustomerLimit: per_customer_limit,
        validFrom: valid_from ? new Date(valid_from) : null,
        validUntil: valid_until ? new Date(valid_until) : null,
        isActive: is_active,
      },
    });
    if (!coupon.count) return res.status(404).json({ title: 'Not found', status: 404 });
    const updated = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err) { next(err); }
});

// Validate a coupon code before checkout
couponsRouter.post('/validate', auth, validate(ApplyCouponSchema), async (req, res, next) => {
  try {
    const { code, subtotal } = req.body;
    const businessId = req.user.business_id;
    const normalizedCode = code.toUpperCase().trim();

    // Single atomic query: all validity conditions checked in the database at the
    // same instant. No separate read-then-check step — eliminates the race condition
    // where two concurrent requests both pass the findFirst check before either
    // increments uses_count.
    const rows = await prisma.$queryRaw`
      SELECT *
      FROM coupons
      WHERE business_id  = ${businessId}::uuid
        AND code         = ${normalizedCode}
        AND is_active    = true
        AND (valid_from  IS NULL OR valid_from  <= CURRENT_DATE)
        AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
        AND (max_uses    IS NULL OR uses_count  <  max_uses)
      LIMIT 1
    `;

    if (!rows.length) {
      return res.status(404).json({ title: 'Invalid or expired coupon', status: 404, code: 'INVALID_COUPON' });
    }

    const coupon = rows[0];

    if (parseFloat(subtotal) < parseFloat(coupon.min_purchase)) {
      return res.status(400).json({
        title: `Minimum purchase of $${coupon.min_purchase} required`,
        status: 400,
        code: 'MIN_PURCHASE_NOT_MET',
      });
    }

    let discount = 0;
    const sub = parseFloat(subtotal);
    const val = parseFloat(coupon.value);
    if (coupon.type === 'pct')  discount = sub * val / 100;
    if (coupon.type === 'flat') discount = Math.min(sub, val);

    res.json({ valid: true, coupon, discount: parseFloat(discount.toFixed(2)) });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// LOYALTY
// ══════════════════════════════════════════════════════════════════════════════
const loyaltyRouter = express.Router();

loyaltyRouter.get('/rules', auth, async (req, res, next) => {
  try {
    const rule = await prisma.loyaltyRule.findUnique({
      where: { businessId: req.user.business_id },
    });
    res.json(rule || null);
  } catch (err) { next(err); }
});

loyaltyRouter.put('/rules', auth, requireRole('owner'), validate(LoyaltyRuleSchema), async (req, res, next) => {
  try {
    const { points_per_dollar, dollar_per_point, min_redeem_points, is_active } = req.body;
    const rule = await prisma.loyaltyRule.upsert({
      where: { businessId: req.user.business_id },
      create: { businessId: req.user.business_id, pointsPerDollar: points_per_dollar, dollarPerPoint: dollar_per_point, minRedeemPoints: min_redeem_points, isActive: is_active },
      update: { pointsPerDollar: points_per_dollar, dollarPerPoint: dollar_per_point, minRedeemPoints: min_redeem_points, isActive: is_active },
    });
    res.json(rule);
  } catch (err) { next(err); }
});

loyaltyRouter.get('/customer/:customerId', auth, async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.customerId, businessId: req.user.business_id },
      select: { loyaltyPoints: true },
    });
    if (!customer) return res.status(404).json({ title: 'Customer not found', status: 404 });

    const ledger = await prisma.loyaltyLedger.findMany({
      where: { customerId: req.params.customerId },
      include: { sale: { select: { saleNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ points_balance: customer.loyaltyPoints || 0, ledger });
  } catch (err) { next(err); }
});

loyaltyRouter.post('/adjust', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const { customer_id, points, type, notes } = req.body;
    if (!['earn', 'redeem', 'adjust'].includes(type)) {
      return res.status(400).json({ title: 'Invalid adjustment type', status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Row-level lock on customer
      const custRows = await tx.$queryRaw`
        SELECT loyalty_points FROM customers
        WHERE id = ${customer_id}::uuid AND business_id = ${req.user.business_id}::uuid
        FOR UPDATE
      `;
      if (!custRows.length) throw Object.assign(new Error('Customer not found'), { statusCode: 404 });

      const current = custRows[0].loyalty_points || 0;
      const delta = type === 'redeem' ? -Math.abs(points) : Math.abs(points);
      const newBalance = Math.max(0, current + delta);

      await tx.customer.update({
        where: { id: customer_id },
        data: { loyaltyPoints: newBalance },
      });
      await tx.loyaltyLedger.create({
        data: {
          businessId: req.user.business_id,
          customerId: customer_id,
          type,
          points: delta,
          balanceAfter: newBalance,
          notes: notes || null,
          createdById: req.user.id,
        },
      });
      return { new_balance: newBalance, delta };
    });

    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ title: err.message, status: err.statusCode });
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PETTY CASH
// ══════════════════════════════════════════════════════════════════════════════
const pettyCashRouter = express.Router();

pettyCashRouter.get('/', auth, async (req, res, next) => {
  try {
    const { from, to, shift_id } = req.query;
    const entries = await prisma.pettyCash.findMany({
      where: {
        businessId: req.user.business_id,
        ...(from && { createdAt: { gte: new Date(from) } }),
        ...(to && { createdAt: { lte: new Date(new Date(to).setDate(new Date(to).getDate() + 1)) } }),
        ...(shift_id && { shiftId: shift_id }),
      },
      include: {
        createdBy: { select: { name: true } },
        location: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const totals = entries.reduce(
      (acc, r) => {
        if (r.type === 'in') acc.total_in += parseFloat(r.amount);
        else acc.total_out += parseFloat(r.amount);
        return acc;
      },
      { total_in: 0, total_out: 0 }
    );

    res.json({ entries, ...totals, net: totals.total_in - totals.total_out });
  } catch (err) { next(err); }
});

pettyCashRouter.post('/', auth, validate(PettyCashSchema), async (req, res, next) => {
  try {
    const { type, amount, reason, reference, shift_id, location_id } = req.body;
    const entry = await prisma.pettyCash.create({
      data: {
        businessId: req.user.business_id,
        shiftId: shift_id || null,
        locationId: location_id || null,
        type,
        amount,
        reason,
        reference: reference || null,
        createdById: req.user.id,
      },
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// BUNDLES
// ══════════════════════════════════════════════════════════════════════════════
const bundlesRouter = express.Router();

bundlesRouter.get('/', auth, async (req, res, next) => {
  try {
    const bundles = await prisma.productBundle.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: {
        items: {
          include: {
            product: { select: { name: true, sku: true } },
            variant: { select: { attributes: true, sku: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ bundles });
  } catch (err) { next(err); }
});

bundlesRouter.post('/', auth, requireRole('owner', 'manager'), validate(BundleSchema), async (req, res, next) => {
  try {
    const { name, description, selling_price, items } = req.body;
    const bundle = await prisma.productBundle.create({
      data: {
        businessId: req.user.business_id,
        name,
        description,
        sellingPrice: selling_price || 0,
        items: {
          create: items.map(item => ({
            productId: item.product_id,
            variantId: item.variant_id || null,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    res.status(201).json(bundle);
  } catch (err) { next(err); }
});

bundlesRouter.delete('/:id', auth, requireRole('owner'), async (req, res, next) => {
  try {
    await prisma.productBundle.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: { isActive: false },
    });
    res.json({ message: 'Bundle archived.' });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// BARCODE LABEL PRINTING
// ══════════════════════════════════════════════════════════════════════════════
const labelsRouter = express.Router();

labelsRouter.post('/generate', auth, validate(BarcodeJobSchema), async (req, res, next) => {
  try {
    const { product_ids, label_format } = req.body;

    const products = await prisma.product.findMany({
      where: {
        id: { in: product_ids },
        businessId: req.user.business_id,
        isActive: true,
      },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const business = await prisma.business.findUnique({
      where: { id: req.user.business_id },
      select: { name: true, logoUrl: true },
    });
    const businessName = business?.name || 'Balanzify';

    const PDFDocument = require('pdfkit');
    const chunks = [];
    const doc = new PDFDocument({ margin: 10, size: 'A4' });
    doc.on('data', c => chunks.push(c));

    const labelSizes = {
      '2x1inch':    { w: 144, h: 72,  cols: 4 },
      '4x2inch':    { w: 288, h: 144, cols: 2 },
      '3x1.5inch':  { w: 216, h: 108, cols: 3 },
    };
    const { w, h, cols } = labelSizes[label_format || '2x1inch'];
    const margin = 10, colGap = 5, rowGap = 5;

    // Flatten products + variants into label rows
    const labelRows = [];
    for (const prod of products) {
      if (prod.variants.length) {
        for (const v of prod.variants) {
          labelRows.push({ prod, variant: v });
        }
      } else {
        labelRows.push({ prod, variant: null });
      }
    }

    let col = 0, row = 0;
    for (let i = 0; i < labelRows.length; i++) {
      const { prod, variant } = labelRows[i];
      const x = margin + col * (w + colGap);
      const y = margin + row * (h + rowGap);

      doc.rect(x, y, w, h).stroke('#CCCCCC');
      doc.fontSize(7).font('Helvetica').fillColor('#666666').text(businessName, x + 4, y + 4, { width: w - 8 });

      const displayName = variant
        ? `${prod.name} (${Object.values(variant.attributes || {}).join('/')})`
        : prod.name;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text(displayName, x + 4, y + 16, { width: w - 8, height: 20, ellipsis: true });

      const price = variant ? parseFloat(variant.sellingPrice) : parseFloat(prod.sellingPrice);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1B3A6B').text(`$${price.toFixed(2)}`, x + 4, y + h - 28, { width: w / 2 - 4 });

      const code = (variant?.sku || prod.sku || variant?.barcode || prod.barcode || prod.id.substring(0, 8));
      doc.fontSize(7).font('Helvetica').fillColor('#333333').text(code, x + w / 2, y + h - 26, { width: w / 2 - 4, align: 'right' });

      col++;
      if (col >= cols) { col = 0; row++; }
      if ((row + 1) * (h + rowGap) + margin > doc.page.height - margin && i < labelRows.length - 1) {
        doc.addPage(); row = 0; col = 0;
      }
    }

    await new Promise(resolve => { doc.on('end', resolve); doc.end(); });
    const pdf = Buffer.concat(chunks);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="barcode-labels-${Date.now()}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// WHATSAPP UTILS
// ══════════════════════════════════════════════════════════════════════════════
const whatsappRouter = express.Router();

whatsappRouter.get('/po/:poId', auth, async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.poId, businessId: req.user.business_id },
      include: {
        supplier: { select: { name: true, whatsapp: true } },
        items: { include: { product: { select: { name: true } } } },
        business: { select: { name: true } },
      },
    });
    if (!po) return res.status(404).json({ title: 'PO not found', status: 404 });

    const lines = po.items
      .map(i => `• ${i.product.name}: ${i.orderedQty} x $${parseFloat(i.unitPrice).toFixed(2)} = $${parseFloat(i.totalPrice).toFixed(2)}`)
      .join('\n');
    const msg = `*Purchase Order ${po.poNumber}*\nFrom: ${po.business.name}\nDate: ${new Date(po.createdAt).toLocaleDateString('en-GB')}\n\n${lines}\n\n*Total: $${parseFloat(po.totalAmount).toFixed(2)}*\n\nPlease confirm receipt.`;

    const phone = po.supplier?.whatsapp?.replace(/\D/g, '') || '';
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

    await prisma.whatsappLog.create({
      data: {
        businessId: req.user.business_id,
        recipientPhone: phone,
        messageType: 'purchase_order',
        content: msg,
        referenceType: 'purchase_order',
        referenceId: req.params.poId,
      },
    });

    res.json({ url, phone, message: msg });
  } catch (err) { next(err); }
});

whatsappRouter.get('/statement/:customerId', auth, async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.customerId, businessId: req.user.business_id },
    });
    if (!customer) return res.status(404).json({ title: 'Customer not found', status: 404 });

    const [recentSales, business] = await Promise.all([
      prisma.sale.findMany({
        where: { customerId: req.params.customerId, status: 'completed' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { saleNumber: true, totalAmount: true, createdAt: true, paymentMethod: true },
      }),
      prisma.business.findUnique({
        where: { id: req.user.business_id },
        select: { name: true },
      }),
    ]);

    const lines = recentSales
      .map(s => `• ${s.saleNumber}: $${parseFloat(s.totalAmount).toFixed(2)} (${new Date(s.createdAt).toLocaleDateString('en-GB')})`)
      .join('\n') || 'None';
    const balance = parseFloat(customer.outstandingBalance || 0);
    const msg = `*Account Statement*\n${business.name}\n\nDear ${customer.name},\n\nRecent transactions:\n${lines}\n\n*Outstanding balance: $${balance.toFixed(2)}*\n\nThank you for your business.`;
    const phone = customer.whatsapp?.replace(/\D/g, '') || customer.phone?.replace(/\D/g, '') || '';
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    res.json({ url, phone, message: msg, balance });
  } catch (err) { next(err); }
});

whatsappRouter.post('/broadcast', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const { message, segment, customer_ids } = req.body;
    if (!message?.trim()) return res.status(400).json({ title: 'Message required', status: 400 });

    const customers = await prisma.customer.findMany({
      where: {
        businessId: req.user.business_id,
        whatsappOptedIn: true,
        ...(segment && { segment }),
        ...(customer_ids?.length && { id: { in: customer_ids } }),
      },
      select: { id: true, name: true, phone: true, whatsapp: true },
    });

    const links = customers
      .map(c => {
        const phone = (c.whatsapp || c.phone || '').replace(/\D/g, '');
        return { customer_id: c.id, name: c.name, phone, url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` };
      })
      .filter(l => l.phone);

    // Log all broadcast messages
    if (links.length) {
      await prisma.whatsappLog.createMany({
        data: links.map(l => ({
          businessId: req.user.business_id,
          recipientPhone: l.phone,
          messageType: 'broadcast',
          content: message,
          referenceType: 'marketing',
        })),
      });
    }

    res.json({ links, total: links.length });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// SUPPLIER CATALOG IMPORT
// ══════════════════════════════════════════════════════════════════════════════
const supplierCatalogRouter = express.Router({ mergeParams: true });

supplierCatalogRouter.get('/', auth, async (req, res, next) => {
  try {
    const catalog = await prisma.supplierCatalog.findMany({
      where: { supplierId: req.params.supplierId, businessId: req.user.business_id },
      orderBy: { productName: 'asc' },
    });
    res.json({ catalog });
  } catch (err) { next(err); }
});

supplierCatalogRouter.post('/import', auth, requireRole('owner', 'manager'), validate(SupplierCatalogImportSchema), async (req, res, next) => {
  try {
    const { items } = req.body;
    const supplier = await prisma.supplier.findFirst({
      where: { id: req.params.supplierId, businessId: req.user.business_id },
    });
    if (!supplier) return res.status(404).json({ title: 'Supplier not found', status: 404 });

    // createMany + skipDuplicates replaces the ON CONFLICT DO NOTHING loop
    await prisma.supplierCatalog.createMany({
      data: items.map(item => ({
        supplierId: req.params.supplierId,
        businessId: req.user.business_id,
        productName: item.product_name,
        supplierSku: item.supplier_sku || null,
        barcode: item.barcode || null,
        unitPrice: item.unit_price,
        currency: item.currency || 'USD',
        minOrderQty: item.min_order_qty || 1,
        leadTimeDays: item.lead_time_days || 0,
      })),
      skipDuplicates: true,
    });

    res.json({ imported: items.length, total: items.length });
  } catch (err) { next(err); }
});

supplierCatalogRouter.post('/:catalogId/link', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ title: 'product_id required', status: 400 });

    const catalog = await prisma.supplierCatalog.findFirst({
      where: { id: req.params.catalogId, businessId: req.user.business_id },
    });
    if (!catalog) return res.status(404).json({ title: 'Catalog item not found', status: 404 });

    await prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId: req.params.supplierId, productId: product_id } },
      create: {
        supplierId: req.params.supplierId,
        productId: product_id,
        supplierSku: catalog.supplierSku,
        unitPrice: catalog.unitPrice,
        minOrderQty: catalog.minOrderQty,
        leadTimeDays: catalog.leadTimeDays,
      },
      update: {
        unitPrice: catalog.unitPrice,
        minOrderQty: catalog.minOrderQty,
        leadTimeDays: catalog.leadTimeDays,
      },
    });
    res.json({ message: 'Linked to product.' });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULED REPORTS
// ══════════════════════════════════════════════════════════════════════════════
const scheduledReportsRouter = express.Router();

scheduledReportsRouter.get('/', auth, async (req, res, next) => {
  try {
    const reports = await prisma.scheduledReport.findMany({
      where: { businessId: req.user.business_id },
      orderBy: { name: 'asc' },
    });
    res.json({ reports });
  } catch (err) { next(err); }
});

scheduledReportsRouter.post('/', auth, requireRole('owner', 'manager'), validate(ScheduledReportSchema), async (req, res, next) => {
  try {
    const { name, report_type, frequency, send_time, day_of_week, day_of_month, recipients, filters, is_active } = req.body;
    const report = await prisma.scheduledReport.create({
      data: {
        businessId: req.user.business_id,
        name,
        reportType: report_type,
        frequency,
        sendTime: send_time || '08:00',
        dayOfWeek: day_of_week || null,
        dayOfMonth: day_of_month || null,
        recipients: recipients || [],
        filters: filters || {},
        isActive: is_active ?? true,
        createdById: req.user.id,
      },
    });
    res.status(201).json(report);
  } catch (err) { next(err); }
});

scheduledReportsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(ScheduledReportSchema.partial()), async (req, res, next) => {
  try {
    const { name, frequency, send_time, recipients, is_active } = req.body;
    const count = await prisma.scheduledReport.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: {
        name,
        frequency,
        sendTime: send_time,
        recipients: recipients || [],
        isActive: is_active,
      },
    });
    if (!count.count) return res.status(404).json({ title: 'Not found', status: 404 });
    const updated = await prisma.scheduledReport.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err) { next(err); }
});

scheduledReportsRouter.delete('/:id', auth, requireRole('owner'), async (req, res, next) => {
  try {
    await prisma.scheduledReport.deleteMany({
      where: { id: req.params.id, businessId: req.user.business_id },
    });
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMER SEGMENTS
// ══════════════════════════════════════════════════════════════════════════════
const customerSegmentsRouter = express.Router();

customerSegmentsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(CustomerSegmentSchema), async (req, res, next) => {
  try {
    const { segment, whatsapp_opted_in, diaspora_currency } = req.body;
    const count = await prisma.customer.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: {
        segment: segment || null,
        whatsappOptedIn: whatsapp_opted_in ?? true,
        diasporaCurrency: diaspora_currency || 'USD',
      },
    });
    if (!count.count) return res.status(404).json({ title: 'Not found', status: 404 });
    const updated = await prisma.customer.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err) { next(err); }
});

customerSegmentsRouter.get('/', auth, async (req, res, next) => {
  try {
    // groupBy segment with aggregate totals
    const raw = await prisma.customer.groupBy({
      by: ['segment'],
      where: { businessId: req.user.business_id, isActive: true },
      _count: { id: true },
      _sum: { outstandingBalance: true, totalPurchases: true },
    });
    const segments = raw.map(r => ({
      segment: r.segment,
      count: r._count.id,
      total_outstanding: r._sum.outstandingBalance || 0,
      total_purchases: r._sum.totalPurchases || 0,
    }));
    res.json({ segments });
  } catch (err) { next(err); }
});

module.exports = {
  couponsRouter, loyaltyRouter, pettyCashRouter, bundlesRouter,
  labelsRouter, whatsappRouter, supplierCatalogRouter,
  scheduledReportsRouter, customerSegmentsRouter,
};
