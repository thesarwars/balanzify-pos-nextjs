const accounting = require("./accounting");
const credit = require("./credit");
const { generateReceiptToken } = require("./receipt");

// ── Sale invoices ("Add Sale") ───────────────────────────────────────────────
// The POS till has its own checkout (routes/sales.js createSale). This is the
// back-office invoice: a document that may be a draft, a quotation, a proforma
// or a final sale, may be only partly paid, and may carry shipping and named
// surcharges the till never sees.
//
// draft / quotation / proforma are NON-POSTING. They write the document and
// nothing else — no stock moves, no cost layer is touched, no journal, no
// receivable. Finalising one runs the exact same posting path as a sale created
// final in the first place, so there is only one way for a sale to hit the books.

const NON_POSTING = new Set(["draft", "quotation", "proforma"]);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const bad = (message, statusCode = 400, code) =>
  Object.assign(new Error(message), { statusCode, code });

/**
 * Every number on the invoice, derived from server-resolved tax rates and the
 * operator's prices. Line tax is charged on the line's own net; order tax is
 * charged on the subtotal after the order-level discount. They add up.
 *
 *   total = goods + tax + shipping + expenses
 * and the ledger credits exactly those four, so the journal balances by
 * construction against (tenders + receivable) = total.
 */
function computeTotals({
  lines,
  discountType,
  discountValue,
  orderTaxRate,
  shippingCharges,
  expenses,
}) {
  let subtotal = 0;
  let lineTax = 0;
  for (const l of lines) {
    l.net = round2(l.quantity * l.unitPrice - l.lineDiscount);
    if (l.net < 0)
      throw bad(`Discount on "${l.name}" is larger than the line total.`);
    l.taxAmount = round2(l.net * l.taxRate);
    subtotal += l.net;
    lineTax += l.taxAmount;
  }
  subtotal = round2(subtotal);
  lineTax = round2(lineTax);

  // Clamp BOTH branches. An unclamped percentage over 100 drives `goods` negative,
  // and if shipping covers the shortfall the journal still balances — so a
  // negative credit to Sales Revenue would post silently instead of being rejected.
  const discountAmount = Math.min(
    subtotal,
    discountType === "flat"
      ? round2(discountValue)
      : round2(subtotal * (round2(discountValue) / 100)),
  );

  const goods = round2(subtotal - discountAmount); // revenue, net of discount, ex-tax
  const orderTax = round2(goods * orderTaxRate);
  const tax = round2(lineTax + orderTax);
  const shipping = round2(shippingCharges);
  const expensesTotal = round2(
    expenses.reduce((s, e) => s + round2(e.amount), 0),
  );
  const total = round2(goods + tax + shipping + expensesTotal);

  return {
    subtotal,
    discountAmount,
    goods,
    lineTax,
    orderTax,
    tax,
    shipping,
    expensesTotal,
    total,
  };
}

/**
 * Mint the next number for an invoice scheme. Locks the scheme row, so two
 * invoices created at the same instant cannot take the same number.
 */
async function mintInvoiceNumber(tx, businessId, schemeId) {
  const rows = await tx.$queryRaw`
    SELECT prefix, start_number, total_digits, include_year
    FROM invoice_schemes WHERE id = ${schemeId}::uuid AND business_id = ${businessId}::uuid
    FOR UPDATE
  `;
  if (!rows.length) throw bad("Invoice scheme not found.", 404);
  const s = rows[0];
  const n = Number(s.start_number) || 1;
  await tx.$executeRaw`UPDATE invoice_schemes SET start_number = ${n + 1} WHERE id = ${schemeId}::uuid`;
  const digits = Math.max(1, Number(s.total_digits) || 4);
  const year = s.include_year ? `${new Date().getFullYear()}-` : "";
  return `${year}${s.prefix || ""}${String(n).padStart(digits, "0")}`;
}

/**
 * Deduct one line's stock and consume its cost layers, returning the COGS.
 *
 * stock_levels is locked BEFORE cost_layers — the same order routes/sales.js and
 * lib/purchaseReturnService.js use. Taking them the other way round would let a
 * sale and a purchase return of the same product deadlock.
 */
async function consumeStock(
  tx,
  {
    businessId,
    userId,
    locationId,
    productId,
    variantId,
    stockQty,
    fallbackCost,
    productName,
    saleId,
  },
) {
  const rows = variantId
    ? await tx.$queryRaw`
        SELECT quantity FROM stock_levels
        WHERE product_id = ${productId}::uuid AND location_id = ${locationId}::uuid
          AND (variant_id = ${variantId}::uuid OR variant_id IS NULL)
        FOR UPDATE`
    : await tx.$queryRaw`
        SELECT quantity FROM stock_levels
        WHERE product_id = ${productId}::uuid AND location_id = ${locationId}::uuid
        FOR UPDATE`;

  const onHand = rows.length ? Number(rows[0].quantity) : 0;
  if (onHand < stockQty) {
    throw bad(
      `Not enough stock for "${productName}" — ${onHand} on hand, ${stockQty} needed.`,
    );
  }

  const affected = variantId
    ? await tx.$executeRaw`
        UPDATE stock_levels SET quantity = quantity - ${stockQty}, updated_at = NOW()
        WHERE product_id = ${productId}::uuid AND location_id = ${locationId}::uuid
          AND (variant_id = ${variantId}::uuid OR variant_id IS NULL) AND quantity >= ${stockQty}`
    : await tx.$executeRaw`
        UPDATE stock_levels SET quantity = quantity - ${stockQty}, updated_at = NOW()
        WHERE product_id = ${productId}::uuid AND location_id = ${locationId}::uuid AND quantity >= ${stockQty}`;
  if (affected === 0)
    throw bad(
      `Stock for "${productName}" changed while the sale was being recorded — please retry.`,
      409,
    );

  // FEFO (nearest expiry) then FIFO (oldest receipt), the order used everywhere.
  const layers = await tx.$queryRaw`
    SELECT id, quantity_remaining, unit_cost FROM cost_layers
    WHERE product_id = ${productId}::uuid AND business_id = ${businessId}::uuid
      AND (location_id = ${locationId}::uuid OR location_id IS NULL)
      AND quantity_remaining > 0
    ORDER BY expiry_date ASC NULLS LAST, received_at ASC
    FOR UPDATE
  `;

  let remaining = stockQty;
  let cost = 0;
  let consumed = 0;
  for (const layer of layers) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(layer.quantity_remaining));
    const dec = await tx.$executeRaw`
      UPDATE cost_layers SET quantity_remaining = quantity_remaining - ${take}
      WHERE id = ${layer.id}::uuid AND quantity_remaining >= ${take}`;
    if (dec === 0)
      throw bad(
        "A cost layer changed while the sale was being recorded — please retry.",
        409,
      );
    cost += take * parseFloat(layer.unit_cost);
    consumed += take;
    remaining -= take;
  }
  // Stock can legitimately outrun its layers (opening balances, adjustments).
  // Value whatever the layers did not cover at the product's standard cost.
  if (remaining > 0) cost += remaining * fallbackCost;

  await tx.stockMovement.create({
    data: {
      businessId,
      productId,
      locationId,
      type: "sale",
      quantity: -stockQty,
      balanceAfter: onHand - stockQty,
      referenceType: "sale",
      referenceId: saleId || null,
      createdById: userId || null,
    },
  });

  return {
    cogs: round2(cost),
    unitCost: stockQty > 0 ? cost / stockQty : fallbackCost,
  };
}

/**
 * Resolve the request's products and tax rates into priced lines. Prices come
 * from the operator (an invoice may be negotiated), but tax RATES are always
 * read from the database — never taken from the client.
 */
async function resolveLines(tx, { businessId, items }) {
  const productIds = [...new Set(items.map((i) => i.product_id))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, businessId },
    select: {
      id: true,
      name: true,
      sku: true,
      sellingPrice: true,
      costPrice: true,
      sellByUnit: true,
      packSize: true,
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  if (byId.size !== productIds.length)
    throw bad("One of those products does not exist.", 404);

  // Reject made-to-order products up front, so even a draft says so immediately.
  // postFinal re-checks, because a product can become a recipe after the draft.
  await assertNoRecipes(
    tx,
    productIds.map((id) => ({
      productId: id,
      name: (byId.get(id) || {}).name,
    })),
  );

  const rateIds = [...new Set(items.map((i) => i.tax_rate_id).filter(Boolean))];
  const rates = rateIds.length
    ? await tx.taxRate.findMany({
        where: { id: { in: rateIds }, businessId, isActive: true },
        select: { id: true, rate: true },
      })
    : [];
  const rateById = new Map(rates.map((r) => [r.id, parseFloat(r.rate)]));
  if (rateById.size !== rateIds.length)
    throw bad("One of those tax rates does not exist.");

  return items.map((i) => {
    const p = byId.get(i.product_id);
    const unitPrice =
      i.unit_price != null ? round2(i.unit_price) : parseFloat(p.sellingPrice);
    if (unitPrice < 0)
      throw bad(`Unit price for "${p.name}" cannot be negative.`);
    return {
      productId: p.id,
      variantId: i.variant_id || null,
      name: p.name,
      quantity: Number(i.quantity),
      unitPrice,
      lineDiscount: round2(i.discount || 0),
      taxRateId: i.tax_rate_id || null,
      taxRate: i.tax_rate_id ? rateById.get(i.tax_rate_id) : 0,
      // Unit-configured products hold stock in base units; a pack sale of one
      // moves qty × packSize. Mirrors routes/sales.js.
      stockQty:
        p.sellByUnit && p.packSize
          ? Number(i.quantity) * p.packSize
          : Number(i.quantity),
      fallbackCost: parseFloat(p.costPrice) || 0,
    };
  });
}

/**
 * Made-to-order products have no finished-goods stock — the till depletes their
 * ingredients. Checked here, at the single posting choke point, because a
 * quotation can be raised while a product is ordinary and finalised after it has
 * been turned into a recipe, which would deduct stock the product never held.
 */
async function assertNoRecipes(tx, lines) {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const recipes = await tx.recipe.findMany({
    where: { productId: { in: ids } },
    select: { productId: true },
  });
  if (!recipes.length) return;
  const line = lines.find((l) => l.productId === recipes[0].productId);
  throw bad(
    `"${line ? line.name : "That product"}" is made to order. Sell it from the Point of Sale, which depletes its ingredients.`,
  );
}

/** Payment accounts are referenced by id, so they have to be proven to be ours. */
async function assertPaymentAccounts(tx, businessId, tenders) {
  const ids = [
    ...new Set(tenders.map((t) => t.payment_account_id).filter(Boolean)),
  ];
  if (!ids.length) return;
  const found = await tx.paymentAccount.findMany({
    where: { id: { in: ids }, businessId },
    select: { id: true },
  });
  if (found.length !== ids.length) throw bad("Payment account not found.", 404);
}

/** Validate the tender legs and turn them into rows we can write. */
function resolveTenders(payments, total) {
  const tenders = (payments || []).filter((p) => round2(p.amount) > 0);
  const amountPaid = round2(tenders.reduce((s, t) => s + round2(t.amount), 0));
  if (amountPaid - total > 0.01) {
    throw bad(
      `Payments (${amountPaid.toFixed(2)}) exceed the invoice total (${total.toFixed(2)}).`,
    );
  }
  return { tenders, amountPaid, amountDue: round2(total - amountPaid) };
}

/**
 * Move the goods, take the money, write the journal. Called both when a sale is
 * created final and when a draft/quotation/proforma is later finalised, so both
 * routes are guaranteed to hit the books identically.
 */
async function postFinal(
  tx,
  {
    businessId,
    userId,
    sale,
    lines,
    totals,
    tenders,
    amountPaid,
    amountDue,
    currency,
  },
) {
  if (amountDue > 0 && !sale.customerId) {
    throw bad(
      "An unpaid balance has to be billed to a customer — pick one, or take the full amount now.",
    );
  }
  await assertNoRecipes(tx, lines);
  await assertPaymentAccounts(tx, businessId, tenders);

  // Cost each line on its own: the same product can appear twice and the second
  // occurrence may consume a different (dearer) cost layer than the first.
  let cogs = 0;
  for (const line of lines) {
    const { cogs: lineCogs, unitCost } = await consumeStock(tx, {
      businessId,
      userId,
      saleId: sale.id,
      locationId: sale.locationId,
      productId: line.productId,
      variantId: line.variantId,
      stockQty: line.stockQty,
      fallbackCost: line.fallbackCost,
      productName: line.name,
    });
    cogs = round2(cogs + lineCogs);
    await tx.saleItem.update({
      where: { id: line.saleItemId },
      data: { costPrice: round2(unitCost) },
    });
  }

  let changeGiven = 0;
  for (const t of tenders) {
    const change =
      t.tendered != null ? Math.max(0, round2(t.tendered - t.amount)) : null;
    if (change) changeGiven = round2(changeGiven + change);
    await tx.salePayment.create({
      data: {
        businessId,
        saleId: sale.id,
        provider: t.method,
        amount: round2(t.amount),
        currency,
        status: "completed",
        note: t.note || null,
        paymentAccountId: t.payment_account_id || null,
        paidOn: t.paid_on ? new Date(t.paid_on) : new Date(),
        tendered: t.tendered != null ? round2(t.tendered) : null,
        change,
        completedAt: new Date(),
      },
    });
  }

  // The unpaid remainder is a receivable. postDebit locks the customer, enforces
  // their credit limit, and keeps outstandingBalance and the credit ledger in step.
  if (amountDue > 0) {
    await credit.postDebit(tx, {
      businessId,
      customerId: sale.customerId,
      amount: amountDue,
      currency,
      saleId: sale.id,
      description: `Invoice ${sale.saleNumber || ""}`.trim(),
      recordedById: userId,
    });
  }

  await accounting.postInvoiceSale(tx, {
    businessId,
    sale,
    tenders,
    goods: totals.goods,
    shipping: totals.shipping,
    otherIncome: totals.expensesTotal,
    taxAmount: totals.tax,
    cogs,
    amountDue,
    createdById: userId,
  });

  // Sale.paymentMethod is an enum and only names ONE method, so an invoice paid
  // two ways is 'split' and one paid no way at all is 'credit'. The truth of who
  // paid what lives in the SalePayment rows.
  const sumOf = (...ms) =>
    round2(
      tenders
        .filter((t) => ms.includes(t.method))
        .reduce((s, t) => s + round2(t.amount), 0),
    );
  const distinct = [...new Set(tenders.map((t) => t.method))];
  const paymentMethod =
    distinct.length === 0
      ? "credit"
      : distinct.length > 1
        ? "split"
        : distinct[0];

  return tx.sale.update({
    where: { id: sale.id },
    data: {
      status: "completed",
      amountPaid,
      amountDue,
      paymentMethod,
      cashAmount: sumOf("cash"),
      zaadAmount: sumOf(
        "zaad",
        "evc",
        "edahab",
        "mpesa",
        "telebirr",
        "cbe_birr",
        "mobile_money",
      ),
      cardAmount: sumOf("visa", "mastercard"),
      changeGiven,
    },
    include: { items: true, expenses: true, payments: true },
  });
}

/** Create an invoice. Posts to the books only when `status` is final. */
async function createInvoice(
  tx,
  { businessId, userId, currency = "USD", body },
) {
  const status = body.status || "completed";
  const isDraft = NON_POSTING.has(status);

  const location = await tx.location.findFirst({
    where: { id: body.location_id, businessId },
    select: { id: true, invoiceSchemeId: true },
  });
  if (!location) throw bad("Location not found.", 404);
  if (body.customer_id) {
    const c = await tx.customer.findFirst({
      where: { id: body.customer_id, businessId },
      select: { id: true },
    });
    if (!c) throw bad("Customer not found.", 404);
  }
  if (body.delivery_person_id) {
    const u = await tx.user.findFirst({
      where: { id: body.delivery_person_id, businessId },
      select: { id: true },
    });
    if (!u) throw bad("Delivery person not found.", 404);
  }

  let orderTaxRate = 0;
  if (body.tax_rate_id) {
    const r = await tx.taxRate.findFirst({
      where: { id: body.tax_rate_id, businessId, isActive: true },
      select: { rate: true },
    });
    if (!r) throw bad("Order tax rate not found.");
    orderTaxRate = parseFloat(r.rate);
  }

  const lines = await resolveLines(tx, { businessId, items: body.items });
  const expenses = (body.expenses || []).filter(
    (e) => e.name && round2(e.amount) > 0,
  );
  const totals = computeTotals({
    lines,
    discountType: body.discount_type || "pct",
    discountValue: body.discount_value || 0,
    orderTaxRate,
    shippingCharges: body.shipping_charges || 0,
    expenses,
  });

  // A quotation must not burn an invoice number — the sequence would gain holes
  // for documents that never became sales. It gets a provisional one, and takes
  // a real number from the scheme when it is finalised.
  const schemeId = body.invoice_scheme_id || location.invoiceSchemeId || null;
  let saleNumber = body.invoice_no ? String(body.invoice_no).trim() : null;
  if (saleNumber) {
    const clash = await tx.sale.findFirst({
      where: { businessId, saleNumber },
      select: { id: true },
    });
    if (clash) throw bad(`Invoice number "${saleNumber}" is already used.`);
  } else if (isDraft) {
    saleNumber = `${status.slice(0, 3).toUpperCase()}-${Date.now()}`;
  } else {
    saleNumber = schemeId
      ? await mintInvoiceNumber(tx, businessId, schemeId)
      : `INV-${Date.now()}`;
  }

  const { tenders, amountPaid, amountDue } = isDraft
    ? { tenders: [], amountPaid: 0, amountDue: 0 }
    : resolveTenders(body.payments, totals.total);

  const sale = await tx.sale.create({
    data: {
      businessId,
      locationId: location.id,
      customerId: body.customer_id || null,
      saleNumber,
      // Same public "view without login" link a POS receipt gets.
      receiptToken: generateReceiptToken(),
      type: "invoice",
      status: isDraft ? status : "pending", // flipped to completed by postFinal
      saleDate: body.sale_date ? new Date(body.sale_date) : new Date(),
      payTerm: body.pay_term != null ? Number(body.pay_term) : null,
      payTermPeriod: body.pay_term_period || null,
      invoiceSchemeId: schemeId,
      documentUrl: body.document_url || null,
      documentKey: body.document_key || null,
      subtotal: totals.subtotal,
      discountType: body.discount_type || "pct",
      discountValue: round2(body.discount_value || 0),
      discountAmount: totals.discountAmount,
      taxRateId: body.tax_rate_id || null,
      taxAmount: totals.tax,
      shippingCharges: totals.shipping,
      shippingDetails: body.shipping_details || null,
      shippingAddress: body.shipping_address || null,
      shippingStatus: body.shipping_status || null,
      deliveredTo: body.delivered_to || null,
      deliveryPersonId: body.delivery_person_id || null,
      shippingDocumentUrl: body.shipping_document_url || null,
      shippingDocumentKey: body.shipping_document_key || null,
      expensesTotal: totals.expensesTotal,
      totalAmount: totals.total,
      amountPaid: 0,
      amountDue: isDraft ? 0 : totals.total,
      notes: body.notes || null,
      staffNote: body.staff_note || null,
      cashierId: userId,
      expenses: {
        create: expenses.map((e) => ({
          name: e.name.trim(),
          amount: round2(e.amount),
        })),
      },
    },
  });

  // One at a time, so each line keeps the id postFinal writes its own cost to.
  for (const l of lines) {
    const item = await tx.saleItem.create({
      data: {
        saleId: sale.id,
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        originalPrice: l.unitPrice,
        discount: l.lineDiscount,
        taxRateId: l.taxRateId,
        taxAmount: l.taxAmount,
        totalPrice: l.net,
        costPrice: 0,
      },
    });
    l.saleItemId = item.id;
  }

  if (isDraft) {
    return tx.sale.findUnique({
      where: { id: sale.id },
      include: { items: true, expenses: true, payments: true },
    });
  }
  return postFinal(tx, {
    businessId,
    userId,
    sale,
    lines,
    totals,
    tenders,
    amountPaid,
    amountDue,
    currency,
  });
}

/** Turn a draft / quotation / proforma into a real, posted sale. */
async function finalizeInvoice(
  tx,
  { businessId, userId, currency = "USD", saleId, payments },
) {
  const rows =
    await tx.$queryRaw`SELECT status FROM sales WHERE id = ${saleId}::uuid AND business_id = ${businessId}::uuid FOR UPDATE`;
  if (!rows.length) throw bad("Sale not found.", 404);
  if (!NON_POSTING.has(rows[0].status))
    throw bad("Only a draft, quotation or proforma can be finalised.");

  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: {
      items: {
        include: {
          product: {
            select: {
              name: true,
              costPrice: true,
              sellByUnit: true,
              packSize: true,
            },
          },
        },
      },
      expenses: true,
      location: { select: { invoiceSchemeId: true } },
    },
  });

  const lines = sale.items.map((it) => ({
    saleItemId: it.id,
    productId: it.productId,
    variantId: it.variantId,
    name: it.product.name,
    quantity: it.quantity,
    unitPrice: parseFloat(it.unitPrice),
    lineDiscount: parseFloat(it.discount),
    taxRateId: it.taxRateId,
    taxAmount: parseFloat(it.taxAmount),
    net: parseFloat(it.totalPrice),
    stockQty:
      it.product.sellByUnit && it.product.packSize
        ? it.quantity * it.product.packSize
        : it.quantity,
    fallbackCost: parseFloat(it.product.costPrice) || 0,
  }));

  // Re-derive the money from what was stored, so a finalised draft posts exactly
  // the totals its document showed.
  const totals = {
    subtotal: parseFloat(sale.subtotal),
    discountAmount: parseFloat(sale.discountAmount),
    goods: round2(parseFloat(sale.subtotal) - parseFloat(sale.discountAmount)),
    tax: parseFloat(sale.taxAmount),
    shipping: parseFloat(sale.shippingCharges),
    expensesTotal: parseFloat(sale.expensesTotal),
    total: parseFloat(sale.totalAmount),
  };

  const { tenders, amountPaid, amountDue } = resolveTenders(
    payments,
    totals.total,
  );

  // Now it becomes an invoice, so now it takes an invoice number.
  const schemeId =
    sale.invoiceSchemeId ||
    (sale.location && sale.location.invoiceSchemeId) ||
    null;
  let saleNumber = sale.saleNumber;
  if (schemeId && /^(DRA|QUO|PRO)-\d+$/.test(saleNumber || "")) {
    saleNumber = await mintInvoiceNumber(tx, businessId, schemeId);
    await tx.sale.update({ where: { id: sale.id }, data: { saleNumber } });
  }

  return postFinal(tx, {
    businessId,
    userId,
    sale: { ...sale, saleNumber },
    lines,
    totals,
    tenders,
    amountPaid,
    amountDue,
    currency,
  });
}

/** Record a payment against an already-posted invoice: cash in, receivable down. */
async function addPayment(
  tx,
  { businessId, userId, currency = "USD", saleId, payment },
) {
  const rows =
    await tx.$queryRaw`SELECT status, amount_due, customer_id FROM sales WHERE id = ${saleId}::uuid AND business_id = ${businessId}::uuid FOR UPDATE`;
  if (!rows.length) throw bad("Sale not found.", 404);
  const row = rows[0];
  if (NON_POSTING.has(row.status))
    throw bad("Finalise the document before taking payment against it.");

  const amount = round2(payment.amount);
  if (amount <= 0) throw bad("Payment amount must be greater than zero.");
  const due = round2(row.amount_due);
  if (amount - due > 0.01)
    throw bad(
      `That is more than the ${due.toFixed(2)} still due on this sale.`,
    );
  await assertPaymentAccounts(tx, businessId, [payment]);

  await tx.salePayment.create({
    data: {
      businessId,
      saleId,
      provider: payment.method || "cash",
      amount,
      currency,
      status: "completed",
      note: payment.note || null,
      paymentAccountId: payment.payment_account_id || null,
      paidOn: payment.paid_on ? new Date(payment.paid_on) : new Date(),
      completedAt: new Date(),
    },
  });

  if (row.customer_id) {
    await credit.postRepayment(tx, {
      businessId,
      customerId: row.customer_id,
      amount,
      currency,
      paymentMethod: payment.method || "cash",
      description: "Invoice payment",
      recordedById: userId,
    });
  }

  await accounting.postSalePayment(tx, {
    businessId,
    saleId,
    method: payment.method || "cash",
    amount,
    createdById: userId,
  });

  return tx.sale.update({
    where: { id: saleId },
    data: {
      amountPaid: { increment: amount },
      amountDue: { decrement: amount },
    },
    include: { payments: true },
  });
}

module.exports = {
  NON_POSTING,
  computeTotals,
  createInvoice,
  finalizeInvoice,
  addPayment,
  mintInvoiceNumber,
  round2,
};
