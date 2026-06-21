const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const { salesCSV, productsCSV, inventoryCSV, stockMovementsCSV, generateInvoicePDF, generatePOPDF } = require('../lib/export');
const { sendReceipt } = require('../lib/email');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const router = express.Router();

// ── Sales CSV ─────────────────────────────────────────────────────────────────
router.get('/sales.csv', auth, async (req, res, next) => {
  try {
    const { from, to, payment_method, cashier_id } = req.query;
    const sales = await prisma.sale.findMany({
      where: {
        businessId: req.user.business_id,
        ...(from && { createdAt: { gte: new Date(from) } }),
        ...(to && { createdAt: { lte: new Date(new Date(to).setDate(new Date(to).getDate() + 1)) } }),
        ...(payment_method && { paymentMethod: payment_method }),
        ...(cashier_id && { cashierId: cashier_id }),
      },
      include: {
        cashier: { select: { name: true } },
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
    // Flatten for CSV
    const rows = sales.map(s => ({ ...s, cashier_name: s.cashier?.name, customer_name: s.customer?.name }));
    const csv = salesCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sales-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

// ── Products CSV ──────────────────────────────────────────────────────────────
router.get('/products.csv', auth, async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: {
        category: { select: { name: true } },
        stockLevels: true,
      },
      orderBy: { name: 'asc' },
    });
    const rows = products.map(p => ({
      ...p,
      category_name: p.category?.name,
      total_stock: p.stockLevels.reduce((s, sl) => s + sl.quantity, 0),
    }));
    const csv = productsCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="products-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

// ── Inventory CSV ─────────────────────────────────────────────────────────────
router.get('/inventory.csv', auth, async (req, res, next) => {
  try {
    const levels = await prisma.stockLevel.findMany({
      where: { product: { businessId: req.user.business_id, isActive: true } },
      include: {
        product: { select: { name: true, sku: true, barcode: true, costPrice: true, sellingPrice: true, reorderPoint: true } },
        location: { select: { name: true } },
      },
    });
    const rows = levels.map(sl => ({
      product_name: sl.product.name,
      sku: sl.product.sku,
      barcode: sl.product.barcode,
      location: sl.location.name,
      quantity: sl.quantity,
      cost_price: sl.product.costPrice,
      selling_price: sl.product.sellingPrice,
      reorder_point: sl.product.reorderPoint,
      stock_value: sl.quantity * parseFloat(sl.product.costPrice),
    }));
    const csv = inventoryCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inventory-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

// ── Stock Movements CSV ───────────────────────────────────────────────────────
router.get('/stock-movements.csv', auth, async (req, res, next) => {
  try {
    const { from, to, product_id } = req.query;
    const movements = await prisma.stockMovement.findMany({
      where: {
        businessId: req.user.business_id,
        ...(from && { createdAt: { gte: new Date(from) } }),
        ...(to && { createdAt: { lte: new Date(to) } }),
        ...(product_id && { productId: product_id }),
      },
      include: {
        product: { select: { name: true, sku: true } },
        location: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
    const rows = movements.map(m => ({
      date: m.createdAt, product: m.product?.name, sku: m.product?.sku,
      location: m.location?.name, type: m.type, quantity: m.quantity,
      balance_after: m.balanceAfter, notes: m.notes, created_by: m.createdBy?.name,
    }));
    const csv = stockMovementsCSV ? stockMovementsCSV(rows) : JSON.stringify(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="stock-movements-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

// ── Invoice PDF ───────────────────────────────────────────────────────────────
router.get('/invoice/:id.pdf', auth, async (req, res, next) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { product: { select: { name: true, sku: true } } } },
        customer: { select: { name: true, phone: true, email: true } },
        cashier: { select: { name: true } },
        business: { select: { name: true, address: true, phone: true, email: true, logoUrl: true, receiptHeader: true, receiptFooter: true, taxNumber: true } },
      },
    });
    if (!sale || sale.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    const pdf = await generateInvoicePDF(sale);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${sale.saleNumber}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// ── PO PDF ────────────────────────────────────────────────────────────────────
router.get('/purchase-order/:id.pdf', auth, async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { product: { select: { name: true, sku: true } } } },
        supplier: { select: { name: true, contactPerson: true, phone: true, address: true } },
        business: { select: { name: true, address: true, phone: true, email: true, logoUrl: true } },
      },
    });
    if (!po || po.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    const pdf = await generatePOPDF(po);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="purchase-order-${po.poNumber}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// ── Receipt email resend ──────────────────────────────────────────────────────
router.post('/receipt/:id/email', auth, validate(z.object({ email: z.string().email() })), async (req, res, next) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { product: { select: { name: true } } } },
        customer: { select: { name: true } },
      },
    });
    if (!sale || sale.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    await sendReceipt(req.body.email, sale);
    res.json({ message: 'Receipt sent.' });
  } catch (err) { next(err); }
});

module.exports = router;
