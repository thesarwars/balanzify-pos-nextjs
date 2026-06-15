// Comprehensive seed — one row (or more) in every table, all wired to a single
// business owned by monsieur.sarwar@gmail.com. Re-runnable: it deletes the
// existing business (cascades) and global rows it owns before re-seeding.
//
//   docker exec balanzify-local-api-1 node prisma/seed.js
//
// Login after seeding:  monsieur.sarwar@gmail.com  /  Password123!
const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const OWNER_EMAIL = 'monsieur.sarwar@gmail.com';
const PASSWORD = 'Password123!';
const S = Date.now();                 // unique suffix for human-readable numbers
const tok = () => randomUUID().replace(/-/g, '');
const day = (offset = 0) => new Date(Date.now() + offset * 86400000);
const counts = {};
async function seed(label, fn) {
  const r = await fn();
  counts[label] = (counts[label] || 0) + (Array.isArray(r) ? r.length : 1);
  return r;
}

(async () => {
  // ── 0. Clean slate ──────────────────────────────────────────────────
  // Many child tables reference parents with onDelete: RESTRICT, so a scoped
  // delete is brittle. This is a local seed DB — truncate every app table
  // (except Prisma's migration ledger) with CASCADE for a clean, re-runnable run.
  const tables = await prisma.$queryRaw`
    SELECT c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
  `;
  const list = tables.map((t) => `"${t.name}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);

  const hash = await bcrypt.hash(PASSWORD, 12);

  // ── 1. Business + users ─────────────────────────────────────────────
  const biz = await seed('businesses', () => prisma.business.create({
    data: {
      name: 'Sarwar Superstore', email: OWNER_EMAIL, phone: '+252634111222',
      address: 'Road 1, Hargeisa', city: 'Hargeisa', country: 'Somaliland',
      currency: 'USD', taxNumber: 'TAX-SS-001', market: 'somaliland',
      enabledModules: ['pos','inventory','hotel','restaurant','pharmacy','credit','insights','wholesale','construction'],
    },
  }));

  const owner = await seed('users', () => prisma.user.create({
    data: { businessId: biz.id, name: 'Sarwar (Owner)', email: OWNER_EMAIL, password: hash, role: 'owner', pin: '1234', lastLogin: new Date() },
  }));
  const manager = await prisma.user.create({ data: { businessId: biz.id, name: 'Amina Manager', email: `manager+${S}@sarwar.so`, password: hash, role: 'manager', pin: '2345' } });
  const cashier = await prisma.user.create({ data: { businessId: biz.id, name: 'Khalid Cashier', email: `cashier+${S}@sarwar.so`, password: hash, role: 'cashier', pin: '3456' } });
  const warehouse = await prisma.user.create({ data: { businessId: biz.id, name: 'Warehouse Staff', email: `warehouse+${S}@sarwar.so`, password: hash, role: 'warehouse', pin: '4567' } });
  counts.users += 3;

  // ── 2. Catalog scaffolding ──────────────────────────────────────────
  const tax = await seed('tax_rates', () => prisma.taxRate.create({ data: { businessId: biz.id, name: 'VAT 5%', rate: 0.05, isDefault: true, region: 'SO' } }));
  const category = await seed('categories', () => prisma.category.create({ data: { businessId: biz.id, name: 'Beverages', description: 'Drinks & water', color: '#3366ff' } }));
  const store = await seed('locations', () => prisma.location.create({ data: { businessId: biz.id, name: 'Main Store', type: 'store', address: 'Hargeisa' } }));
  const warehouseLoc = await prisma.location.create({ data: { businessId: biz.id, name: 'Central Warehouse', type: 'warehouse', address: 'Hargeisa Outskirts' } });
  counts.locations += 1;

  const product = await seed('products', () => prisma.product.create({
    data: {
      businessId: biz.id, categoryId: category.id, taxRateId: tax.id, name: 'Cola 330ml',
      sku: `COLA-${S}`, barcode: `61900${S % 100000}`, description: 'Soft drink', unitOfMeasure: 'unit',
      costPrice: 0.8, sellingPrice: 1.5, wholesalePrice: 1.2, minStockLevel: 10, maxStockLevel: 500,
      reorderPoint: 20, isSerialized: true, trackExpiry: true,
    },
  }));
  // pharmacy-flavoured second product (covers pharmacy fields)
  const drug = await prisma.product.create({
    data: {
      businessId: biz.id, categoryId: category.id, name: 'Paracetamol 500mg', sku: `PARA-${S}`,
      costPrice: 0.05, sellingPrice: 0.2, genericName: 'Paracetamol', strength: '500mg',
      formulation: 'tablet', manufacturer: 'Generic Pharma', isPrescriptionDrug: false,
      packSize: 100, sellByUnit: true, unitName: 'tablet', unitPrice: 0.2,
    },
  });
  counts.products += 1;

  const variant = await seed('product_variants', () => prisma.productVariant.create({
    data: { productId: product.id, sku: `COLA-${S}-CAN`, barcode: `61901${S % 100000}`, attributes: { size: '330ml', pack: 'can' }, costPrice: 0.8, sellingPrice: 1.5, wholesalePrice: 1.2, taxRateId: tax.id, createdById: owner.id },
  }));

  // ── 3. Stock ────────────────────────────────────────────────────────
  await seed('stock_levels', () => prisma.stockLevel.create({ data: { productId: product.id, locationId: store.id, quantity: 200 } }));
  await prisma.stockLevel.create({ data: { productId: drug.id, locationId: store.id, quantity: 1000 } });
  await prisma.stockLevel.create({ data: { productId: product.id, variantId: variant.id, locationId: warehouseLoc.id, quantity: 50 } });
  counts.stock_levels += 2;

  await seed('stock_batches', () => prisma.stockBatch.create({ data: { productId: product.id, locationId: store.id, batchNumber: `B-${S}`, lotNumber: `LOT-${S}`, quantity: 200, costPrice: 0.8, expiryDate: day(365), receivedDate: day(-10) } }));
  await seed('stock_movements', () => prisma.stockMovement.create({ data: { businessId: biz.id, productId: product.id, locationId: store.id, type: 'opening', quantity: 200, balanceAfter: 200, notes: 'Opening stock', createdById: owner.id } }));
  await seed('stock_adjustments', () => prisma.stockAdjustment.create({ data: { businessId: biz.id, productId: product.id, locationId: store.id, type: 'damage', quantity: -2, unitCost: 0.8, totalValue: 1.6, reason: 'Dropped crate', status: 'approved', approvedById: manager.id, approvedAt: new Date(), createdById: cashier.id } }));

  const transfer = await seed('stock_transfers', () => prisma.stockTransfer.create({ data: { businessId: biz.id, transferNumber: `TRF-${S}`, fromLocationId: warehouseLoc.id, toLocationId: store.id, status: 'received', dispatchedAt: new Date(), receivedAt: new Date(), approvedById: manager.id, createdById: warehouse.id, notes: 'Restock store' } }));
  await seed('stock_transfer_items', () => prisma.stockTransferItem.create({ data: { transferId: transfer.id, productId: product.id, requestedQty: 30, dispatchedQty: 30, receivedQty: 30 } }));

  const count = await seed('stock_counts', () => prisma.stockCount.create({ data: { businessId: biz.id, locationId: store.id, name: 'Monthly Count', type: 'full', status: 'completed', approvedById: manager.id, approvedAt: new Date(), createdById: cashier.id } }));
  await seed('stock_count_items', () => prisma.stockCountItem.create({ data: { countId: count.id, productId: product.id, systemQty: 200, countedQty: 198, countedById: cashier.id, countedAt: new Date() } }));

  // ── 4. Suppliers & purchasing ───────────────────────────────────────
  const supplier = await seed('suppliers', () => prisma.supplier.create({ data: { businessId: biz.id, name: 'Berbera Imports', contactPerson: 'Yusuf', phone: '+25263500000', whatsapp: '+25263500000', email: 'sales@berbera.so', country: 'Somaliland', city: 'Berbera', paymentTerms: 30, creditLimit: 10000, currency: 'USD', rating: 4 } }));
  await seed('supplier_products', () => prisma.supplierProduct.create({ data: { supplierId: supplier.id, productId: product.id, supplierSku: 'SUP-COLA', unitPrice: 0.75, minOrderQty: 24, leadTimeDays: 7, isPreferred: true } }));
  await seed('supplier_communications', () => prisma.supplierCommunication.create({ data: { supplierId: supplier.id, type: 'whatsapp', subject: 'Price list', notes: 'Requested Q3 catalog', createdById: owner.id } }));
  await seed('supplier_catalog', () => prisma.supplierCatalog.create({ data: { supplierId: supplier.id, businessId: biz.id, productName: 'Cola 330ml', supplierSku: 'SUP-COLA', barcode: `61900${S % 100000}`, unitPrice: 0.75, currency: 'USD', minOrderQty: 24, leadTimeDays: 7, productId: product.id } }));

  const po = await seed('purchase_orders', () => prisma.purchaseOrder.create({ data: { businessId: biz.id, supplierId: supplier.id, locationId: warehouseLoc.id, poNumber: `PO-${S}`, status: 'received', taxRateId: tax.id, orderDate: day(-14), expectedDelivery: day(-7), subtotal: 180, taxAmount: 9, freightCost: 10, totalAmount: 199, amountPaid: 199, paymentStatus: 'paid', approvedById: manager.id, approvedAt: new Date(), createdById: owner.id } }));
  await seed('purchase_order_items', () => prisma.purchaseOrderItem.create({ data: { poId: po.id, productId: product.id, orderedQty: 240, receivedQty: 240, unitPrice: 0.75, totalPrice: 180, expiryDate: day(365), batchNumber: `B-${S}` } }));
  await seed('goods_received_notes', () => prisma.goodsReceivedNote.create({ data: { poId: po.id, businessId: biz.id, grnNumber: `GRN-${S}`, receivedDate: day(-7), notes: 'All received', createdById: warehouse.id } }));
  await seed('po_payments', () => prisma.pOPayment.create({ data: { poId: po.id, amount: 199, paymentMethod: 'cash', reference: `PAY-${S}`, createdById: owner.id } }));
  await seed('cost_layers', () => prisma.costLayer.create({ data: { businessId: biz.id, productId: product.id, locationId: warehouseLoc.id, poId: po.id, quantityReceived: 240, quantityRemaining: 200, unitCost: 0.75 } }));

  // ── 5. Customers, shifts, coupons ───────────────────────────────────
  const customer = await seed('customers', () => prisma.customer.create({ data: { businessId: biz.id, name: 'Hodan Ahmed', phone: '+252634999888', whatsapp: '+252634999888', email: 'hodan@example.so', address: 'Hargeisa', creditLimit: 500, loyaltyPoints: 120, segment: 'regular', diasporaCurrency: 'USD' } }));
  const shift = await seed('shifts', () => prisma.shift.create({ data: { businessId: biz.id, locationId: store.id, cashierId: cashier.id, openingFloat: 100, status: 'open', totalSales: 0 } }));
  await seed('held_sales', () => prisma.heldSale.create({ data: { businessId: biz.id, shiftId: shift.id, label: 'Table 4', customerName: 'Walk-in', items: [{ productId: product.id, qty: 2 }], subtotal: 3, createdById: cashier.id } }));
  const coupon = await seed('coupons', () => prisma.coupon.create({ data: { businessId: biz.id, code: `SAVE10-${S}`, description: '10% off', type: 'pct', value: 10, minPurchase: 5, maxUses: 100, perCustomerLimit: 2, validFrom: day(-1), validUntil: day(30), createdById: owner.id } }));

  // ── 6. Sale + dependents ────────────────────────────────────────────
  const sale = await seed('sales', () => prisma.sale.create({
    data: {
      businessId: biz.id, shiftId: shift.id, locationId: store.id, customerId: customer.id, couponId: coupon.id,
      cashierId: cashier.id, saleNumber: `SO-${S}`, receiptToken: tok(), type: 'pos', status: 'completed',
      subtotal: 3, discountType: 'pct', discountValue: 0, totalAmount: 3, amountPaid: 3,
      paymentMethod: 'cash', cashAmount: 3, cashTendered: 5, changeGiven: 2, taxAmount: 0, loyaltyPointsEarned: 3,
    },
  }));
  const saleItem = await seed('sale_items', () => prisma.saleItem.create({ data: { saleId: sale.id, productId: product.id, variantId: variant.id, quantity: 2, unitPrice: 1.5, originalPrice: 1.5, costPrice: 0.8, totalPrice: 3, taxRateId: tax.id, taxAmount: 0 } }));
  await seed('sale_payments', () => prisma.salePayment.create({ data: { businessId: biz.id, saleId: sale.id, provider: 'cash', amount: 3, currency: 'USD', status: 'completed', tendered: 5, change: 2, completedAt: new Date() } }));
  await seed('sale_keys', () => prisma.saleKey.create({ data: { key: `${owner.id}-${S}-${tok()}`, cashierId: cashier.id, businessId: biz.id, used: true, usedAt: new Date(), saleId: sale.id, expiresAt: day(1) } }));

  const refund = await seed('refunds', () => prisma.refund.create({ data: { businessId: biz.id, saleId: sale.id, refundNumber: `RF-${S}`, reason: 'Damaged item', totalRefunded: 1.5, refundMethod: 'cash', restocked: true, createdById: manager.id } }));
  await seed('refund_items', () => prisma.refundItem.create({ data: { refundId: refund.id, saleItemId: saleItem.id, productId: product.id, quantity: 1, unitPrice: 1.5, totalPrice: 1.5, restock: true } }));

  // ── 7. Loyalty / petty cash / bundles / serials / labels ────────────
  await seed('loyalty_rules', () => prisma.loyaltyRule.create({ data: { businessId: biz.id, pointsPerDollar: 1, dollarPerPoint: 0.01, minRedeemPoints: 100, isActive: true } }));
  await seed('loyalty_ledger', () => prisma.loyaltyLedger.create({ data: { businessId: biz.id, customerId: customer.id, saleId: sale.id, type: 'earn', points: 3, balanceAfter: 123, notes: 'Sale points', createdById: cashier.id } }));
  await seed('petty_cash', () => prisma.pettyCash.create({ data: { businessId: biz.id, shiftId: shift.id, locationId: store.id, type: 'out', amount: 5, reason: 'Tea for staff', reference: `PC-${S}`, createdById: cashier.id } }));
  const bundle = await seed('product_bundles', () => prisma.productBundle.create({ data: { businessId: biz.id, name: 'Combo Pack', description: 'Cola + Paracetamol', sellingPrice: 1.6 } }));
  await seed('product_bundle_items', () => prisma.productBundleItem.create({ data: { bundleId: bundle.id, productId: product.id, variantId: variant.id, quantity: 1 } }));
  await seed('serial_numbers', () => prisma.serialNumber.create({ data: { businessId: biz.id, productId: product.id, serialNumber: `SN-${S}`, status: 'in_stock', locationId: store.id } }));
  await seed('barcode_label_jobs', () => prisma.barcodeLabelJob.create({ data: { businessId: biz.id, productIds: [product.id], labelFormat: '2x1inch', createdById: owner.id } }));

  // ── 8. Projects / tasks (+ construction) ────────────────────────────
  const project = await seed('projects', () => prisma.project.create({ data: { businessId: biz.id, name: 'Store Renovation', description: 'Repaint + shelves', category: 'maintenance', status: 'active', ownerId: manager.id, startDate: day(-10), targetDate: day(20), budget: 5000, spent: 1200, createdById: owner.id } }));
  const milestone = await seed('milestones', () => prisma.milestone.create({ data: { projectId: project.id, name: 'Phase 1', description: 'Demolition', status: 'completed', dueDate: day(-2), completedDate: day(-1), orderIndex: 1, ownerId: manager.id } }));
  const task = await seed('tasks', () => prisma.task.create({ data: { businessId: biz.id, projectId: project.id, milestoneId: milestone.id, title: 'Order paint', description: '20L white', category: 'purchase', priority: 'high', status: 'in_progress', assigneeId: warehouse.id, dueDate: day(2), createdById: manager.id } }));
  await seed('task_comments', () => prisma.taskComment.create({ data: { taskId: task.id, userId: owner.id, comment: 'Use weatherproof paint' } }));
  await seed('project_budget_lines', () => prisma.projectBudgetLine.create({ data: { projectId: project.id, category: 'materials', description: 'Paint & shelves', budgeted: 2000, actual: 1200 } }));
  await seed('labor_entries', () => prisma.laborEntry.create({ data: { projectId: project.id, workDate: day(-3), workers: 4, dailyRate: 15, total: 60, notes: 'Demolition crew' } }));
  await seed('site_logs', () => prisma.siteLog.create({ data: { projectId: project.id, logDate: day(-3), notes: 'Cleared old shelving', loggedById: warehouse.id } }));
  await seed('project_milestones', () => prisma.projectMilestone.create({ data: { projectId: project.id, name: 'Stage 1 Billing', amount: 1500, retentionPct: 5, status: 'billed', completedAt: new Date() } }));

  // ── 9. Notifications / auth / fx / reorder / scheduled / whatsapp ────
  await seed('notifications', () => prisma.notification.create({ data: { businessId: biz.id, userId: owner.id, type: 'low_stock', title: 'Low stock alert', message: 'Cola below reorder point', referenceId: product.id, referenceType: 'product' } }));
  await seed('refresh_tokens', () => prisma.refreshToken.create({ data: { tokenHash: tok() + tok(), userId: owner.id, businessId: biz.id, expiresAt: day(7), ipAddress: '127.0.0.1', userAgent: 'seed-script' } }));
  await seed('login_attempts', () => prisma.loginAttempt.create({ data: { identifier: OWNER_EMAIL, ipAddress: '127.0.0.1', succeeded: true } }));
  await seed('password_reset_tokens', () => prisma.passwordResetToken.create({ data: { userId: owner.id, tokenHash: tok() + tok(), expiresAt: day(1) } }));
  await seed('exchange_rates', () => prisma.exchangeRate.create({ data: { businessId: biz.id, fromCurrency: 'USD', toCurrency: 'SOS', rate: 8500, source: 'manual' } }));
  await seed('reorder_suggestions', () => prisma.reorderSuggestion.create({ data: { businessId: biz.id, productId: product.id, locationId: store.id, currentStock: 8, reorderPoint: 20, suggestedQty: 240, preferredSupplierId: supplier.id, estimatedCost: 180, contactId: owner.id } }));
  await seed('scheduled_reports', () => prisma.scheduledReport.create({ data: { businessId: biz.id, name: 'Daily Sales', reportType: 'sales', frequency: 'daily', sendTime: '20:00', recipients: [OWNER_EMAIL], createdById: owner.id } }));
  await seed('whatsapp_log', () => prisma.whatsappLog.create({ data: { businessId: biz.id, recipientPhone: '+252634999888', messageType: 'receipt', content: 'Thank you for your purchase', referenceType: 'sale', referenceId: sale.id } }));

  // ── 10. Webhooks ────────────────────────────────────────────────────
  const endpoint = await seed('webhook_endpoints', () => prisma.webhookEndpoint.create({ data: { businessId: biz.id, url: 'https://example.com/hook', secret: tok(), events: ['sale.completed'], description: 'Sales webhook' } }));
  await seed('webhook_deliveries', () => prisma.webhookDelivery.create({ data: { endpointId: endpoint.id, businessId: biz.id, event: 'sale.completed', deliveryId: `WD-${S}`, payload: JSON.stringify({ saleId: sale.id }), status: 'delivered', statusCode: 200, attemptCount: 1, lastAttemptAt: new Date() } }));

  // ── 11. Tax already created. Hotel module ───────────────────────────
  await seed('hotel_settings', () => prisma.hotelSettings.create({ data: { businessId: biz.id, currency: 'USD', taxRate: 0.05, serviceChargePct: 0.10, depositPct: 0.20, wifiPassword: 'sarwar123' } }));
  const roomType = await seed('room_types', () => prisma.roomType.create({ data: { businessId: biz.id, name: 'Deluxe Double', description: 'Sea view', maxOccupancy: 2, bedConfiguration: '1 King', amenities: ['WiFi','AC','TV'], baseRate: 45, currency: 'USD' } }));
  const room = await seed('rooms', () => prisma.room.create({ data: { businessId: biz.id, roomTypeId: roomType.id, number: '101', floor: 1, status: 'occupied', notes: 'Corner room' } }));
  const ratePlan = await seed('rate_plans', () => prisma.ratePlan.create({ data: { businessId: biz.id, roomTypeId: roomType.id, name: 'Rack Rate', ratePerNight: 45, currency: 'USD', minNights: 1, includesBreakfast: true } }));
  const corporate = await seed('corporate_accounts', () => prisma.corporateAccount.create({ data: { businessId: biz.id, companyName: 'Telesom', contactPerson: 'Sahra', phone: '+25263400000', email: 'ap@telesom.so', creditLimit: 20000, paymentTermsDays: 30, currency: 'USD' } }));
  const resGroup = await seed('reservation_groups', () => prisma.reservationGroup.create({ data: { businessId: biz.id, groupNumber: `GRP-${S}`, name: 'NGO Delegation', organiserName: 'UN Office', corporateAccountId: corporate.id, billingType: 'master', checkInDate: day(0), checkOutDate: day(3), roomCount: 5, pax: 5, createdById: owner.id } }));
  const reservation = await seed('reservations', () => prisma.reservation.create({ data: { businessId: biz.id, reservationNumber: `RES-${S}`, roomId: room.id, guestId: customer.id, status: 'checked_in', checkInDate: day(0), checkOutDate: day(2), actualCheckIn: new Date(), nights: 2, adults: 2, children: 0, ratePlanId: ratePlan.id, ratePerNight: 45, totalRoomCharge: 90, depositPaid: 20, bookingSource: 'walk_in', guestIdType: 'passport', guestIdNumber: 'P12345', groupId: resGroup.id, createdById: owner.id, checkedInById: cashier.id } }));
  const folio = await seed('folios', () => prisma.folio.create({ data: { businessId: biz.id, folioNumber: `FOL-${S}`, reservationId: reservation.id, guestId: customer.id, status: 'open', currency: 'USD', totalCharges: 90, totalPayments: 20, balance: 70 } }));
  await seed('folio_charges', () => prisma.folioCharge.create({ data: { folioId: folio.id, businessId: biz.id, type: 'room_night', description: 'Room 101 - night 1', quantity: 1, unitAmount: 45, totalAmount: 45, currency: 'USD', taxAmount: 2.25, taxRateId: tax.id, chargeDate: day(0), postedById: cashier.id } }));
  await seed('folio_payments', () => prisma.folioPayment.create({ data: { folioId: folio.id, businessId: biz.id, provider: 'zaad', amount: 20, currency: 'USD', reference: `ZAAD-${S}`, notes: 'Deposit', receivedById: cashier.id } }));
  await seed('housekeeping_logs', () => prisma.housekeepingLog.create({ data: { businessId: biz.id, roomId: room.id, type: 'stayover', status: 'done', assignedToId: warehouse.id, startedAt: new Date(), completedAt: new Date(), notes: 'Towels changed' } }));
  await seed('lost_found', () => prisma.lostFound.create({ data: { businessId: biz.id, itemName: 'Sunglasses', description: 'Black Ray-Ban', foundDate: day(-1), foundLocation: 'Room 101', foundById: warehouse.id, guestId: customer.id, status: 'in_storage', storageLocation: 'Front desk drawer' } }));

  // ── 12. Restaurant module ───────────────────────────────────────────
  const modGroup = await seed('modifier_groups', () => prisma.modifierGroup.create({ data: { businessId: biz.id, name: 'Spice level', isRequired: true, minSelect: 1, maxSelect: 1 } }));
  const modOption = await seed('modifier_options', () => prisma.modifierOption.create({ data: { groupId: modGroup.id, name: 'Extra Hot', priceAdjustment: 0, isDefault: false } }));
  await seed('product_modifier_groups', () => prisma.productModifierGroup.create({ data: { productId: product.id, groupId: modGroup.id, sortOrder: 1 } }));
  const table = await seed('restaurant_tables', () => prisma.restaurantTable.create({ data: { businessId: biz.id, number: 'T1', name: 'Window table', capacity: 4, section: 'Indoor', status: 'occupied' } }));
  const order = await seed('restaurant_orders', () => prisma.restaurantOrder.create({ data: { businessId: biz.id, orderNumber: `ORD-${S}`, tableId: table.id, customerId: customer.id, staffId: cashier.id, status: 'preparing', type: 'dine_in', covers: 2, folioId: folio.id, subtotal: 3, taxAmount: 0.15, totalAmount: 3.15, sentToKitchenAt: new Date() } }));
  const orderItem = await seed('order_items', () => prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, variantId: variant.id, quantity: 2, unitPrice: 1.5, modifierTotal: 0, lineTotal: 3, notes: 'No ice', course: 1, status: 'pending' } }));
  await seed('order_item_modifiers', () => prisma.orderItemModifier.create({ data: { orderItemId: orderItem.id, optionId: modOption.id, name: 'Extra Hot', priceAdjustment: 0 } }));
  await seed('kitchen_tickets', () => prisma.kitchenTicket.create({ data: { businessId: biz.id, orderId: order.id, station: 'Bar', course: 1, status: 'preparing', items: [{ name: 'Cola 330ml', qty: 2 }], startedAt: new Date() } }));

  // ── 13. Credit / payment plans / diaspora / settlement ──────────────
  const provider = await seed('settlement_providers', () => prisma.settlementProvider.create({ data: { name: 'Premier Bank Somaliland', type: 'bank', country: 'SO', currency: 'USD', supportsInbound: true, mode: 'manual' } }));
  await seed('settlement_accounts', () => prisma.settlementAccount.create({ data: { businessId: biz.id, providerId: provider.id, accountNumber: '0011223344', accountName: 'Sarwar Superstore', currency: 'USD', isDefault: true } }));
  const plan = await seed('payment_plans', () => prisma.paymentPlan.create({ data: { businessId: biz.id, customerId: customer.id, saleId: sale.id, planNumber: `PLN-${S}`, description: 'TV - 3 months', totalAmount: 300, downPayment: 60, balanceAmount: 240, installments: 3, frequency: 'monthly', status: 'active', startDate: day(0), diasporaEnabled: true } }));
  const planItem = await seed('payment_plan_items', () => prisma.paymentPlanItem.create({ data: { planId: plan.id, businessId: biz.id, customerId: customer.id, installmentNo: 1, dueDate: day(30), amount: 80, status: 'pending', paymentToken: tok() } }));
  await seed('credit_ledger', () => prisma.creditLedger.create({ data: { businessId: biz.id, customerId: customer.id, type: 'purchase', amount: 240, direction: 'debit', balanceAfter: 240, currency: 'USD', saleId: sale.id, planItemId: planItem.id, description: 'Credit sale - TV' } }));
  await seed('diaspora_payments', () => prisma.diasporaPayment.create({ data: { businessId: biz.id, customerId: customer.id, planItemId: planItem.id, payerName: 'Cabdi (London)', payerPhone: '+447700900000', payerCountry: 'GB', amount: 80, currency: 'GBP', localAmount: 100, localCurrency: 'USD', fxRate: 1.25, provider: 'stripe', status: 'completed', settlementProviderId: provider.id, paymentToken: tok(), settledAt: new Date() } }));

  // ── 14. Wholesale ───────────────────────────────────────────────────
  const wholesale = await seed('wholesale_orders', () => prisma.wholesaleOrder.create({ data: { businessId: biz.id, customerId: customer.id, orderNumber: `WS-${S}`, status: 'delivered', paymentStatus: 'paid', subtotal: 120, total: 120, amountPaid: 120, driverName: 'Cali', deliveredAt: new Date(), createdById: warehouse.id } }));
  await seed('wholesale_order_items', () => prisma.wholesaleOrderItem.create({ data: { orderId: wholesale.id, productId: product.id, quantity: 100, unitPrice: 1.2, lineTotal: 120, picked: true } }));

  // ── 15. Activity log ────────────────────────────────────────────────
  await seed('activity_log', () => prisma.activityLog.create({ data: { businessId: biz.id, userId: owner.id, action: 'seed', entityType: 'business', entityId: biz.id, details: { note: 'Comprehensive seed run' } } }));

  // ── Done ────────────────────────────────────────────────────────────
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(JSON.stringify({ ok: true, businessId: biz.id, owner: OWNER_EMAIL, password: PASSWORD, tablesSeeded: Object.keys(counts).length, totalRows: total, counts }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('SEED FAILED:', e.message);
  if (e.meta) console.error('meta:', JSON.stringify(e.meta));
  await prisma.$disconnect();
  process.exit(1);
});
