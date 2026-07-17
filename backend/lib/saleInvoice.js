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
    // false when re-posting an EDITED sale: its SalePayment rows already exist
    // and stay attached; only their GL legs are written again (the reversal
    // credited them out, so the repost debits them back — net zero cash).
    createPaymentRows = true,
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
  if (createPaymentRows) {
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

  // `pay_full` settles the whole total to cash at post time (used by the bulk
  // import). Ringing the cash tender HERE — rather than posting the sale on
  // credit and settling afterwards — means amountDue is 0, so postFinal never
  // touches the receivable/credit-limit path and denormalises paymentMethod as
  // cash, exactly like a normal fully-paid invoice.
  const payments =
    body.pay_full && !isDraft
      ? [{ method: "cash", amount: totals.total }]
      : body.payments;
  const { tenders, amountPaid, amountDue } = isDraft
    ? { tenders: [], amountPaid: 0, amountDue: 0 }
    : resolveTenders(payments, totals.total);

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

/**
 * Undo everything a posted invoice sale did to the books, from its CURRENT
 * state — not from journal history, so editing a sale twice can never reverse
 * the same posting twice.
 *
 *   - goods go back on the shelf as fresh cost layers at each line's recorded cost
 *   - one mirror journal: Dr revenue/tax/shipping/other, Cr tenders + receivable,
 *     Dr inventory / Cr COGS
 *   - the customer's receivable for the unpaid part is released
 *
 * `sale` must be loaded with items (incl. product packSize/sellByUnit) and its
 * completed payments. Runs inside the caller's transaction.
 */
async function reverseSaleEffects(tx, { businessId, userId, sale, reason }) {
  const payments = (sale.payments || []).filter(
    (p) => p.status === "completed",
  );
  const paid = round2(payments.reduce((s, p) => s + round2(p.amount), 0));
  const due = round2(sale.amountDue);
  // paid + due must equal the total, or the reversal below would not balance.
  // A mismatch means the record is corrupt — refuse rather than guess.
  if (Math.abs(paid + due - round2(sale.totalAmount)) > 0.01) {
    throw bad(
      `This sale's payments (${paid.toFixed(2)}) and balance (${due.toFixed(2)}) do not add up to its total (${Number(sale.totalAmount).toFixed(2)}) — it cannot be reversed automatically.`,
      409,
    );
  }

  // ── Goods back on the shelf, at the cost they left it ──────────────────────
  let cogs = 0;
  for (const it of sale.items) {
    const stockQty =
      it.product && it.product.sellByUnit && it.product.packSize
        ? it.quantity * it.product.packSize
        : it.quantity;
    const costPrice = round2(it.costPrice);
    cogs = round2(cogs + costPrice * stockQty);

    await tx.$executeRaw`
      INSERT INTO stock_levels (id, product_id, location_id, quantity)
      VALUES (gen_random_uuid(), ${it.productId}::uuid, ${sale.locationId}::uuid, ${stockQty})
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET quantity = stock_levels.quantity + ${stockQty}, updated_at = NOW()
    `;
    await tx.stockMovement.create({
      data: {
        businessId,
        productId: it.productId,
        locationId: sale.locationId,
        type: "return",
        quantity: stockQty,
        referenceType: "sale_void",
        referenceId: sale.id,
        createdById: userId || null,
      },
    });
    if (costPrice > 0) {
      await tx.costLayer.create({
        data: {
          businessId,
          productId: it.productId,
          locationId: sale.locationId,
          quantityReceived: stockQty,
          quantityRemaining: stockQty,
          unitCost: costPrice,
        },
      });
    }
  }

  // ── One mirror journal for the sale's whole net effect ─────────────────────
  const goods = round2(
    Number(sale.subtotal) - Number(sale.discountAmount),
  );
  const tax = round2(sale.taxAmount);
  const shipping = round2(sale.shippingCharges);
  const other = round2(sale.expensesTotal);
  const byAccount = new Map();
  for (const p of payments) {
    const code = accounting.tenderAccountCode(p.provider);
    byAccount.set(code, round2((byAccount.get(code) || 0) + round2(p.amount)));
  }
  const lines = [];
  if (goods !== 0)
    lines.push({ code: "4000", debit: goods, credit: 0, description: "Sales revenue reversed" });
  if (shipping > 0)
    lines.push({ code: "4100", debit: shipping, credit: 0, description: "Shipping charges reversed" });
  if (other > 0)
    lines.push({ code: "4200", debit: other, credit: 0, description: "Additional expenses reversed" });
  if (tax > 0)
    lines.push({ code: "2100", debit: tax, credit: 0, description: "Sales tax reversed" });
  for (const [code, amt] of byAccount) {
    if (amt > 0)
      lines.push({ code, debit: 0, credit: amt, description: "Tender returned" });
  }
  if (due > 0)
    lines.push({ code: "1100", debit: 0, credit: due, description: "Receivable released" });
  if (cogs > 0) {
    lines.push({ code: "1200", debit: cogs, credit: 0, description: "Inventory restocked" });
    lines.push({ code: "5000", debit: 0, credit: cogs, description: "COGS reversed" });
  }
  await accounting.postJournal(tx, {
    businessId,
    description: `${reason || "Sale voided"} — ${sale.saleNumber || ""}`.trim(),
    sourceType: "sale_void",
    sourceId: sale.id,
    createdById: userId,
    lines,
  });

  // ── The customer no longer owes the unpaid part ─────────────────────────────
  if (sale.customerId && due > 0) {
    await tx.$queryRaw`
      SELECT 1 FROM customers WHERE id = ${sale.customerId}::uuid AND business_id = ${businessId}::uuid FOR UPDATE
    `;
    const cust = await tx.customer.findUnique({
      where: { id: sale.customerId },
      select: { outstandingBalance: true },
    });
    const after = round2(parseFloat(cust.outstandingBalance) - due);
    await tx.creditLedger.create({
      data: {
        businessId,
        customerId: sale.customerId,
        type: "adjustment",
        amount: due,
        direction: "credit",
        balanceAfter: after,
        saleId: sale.id,
        description: `${reason || "Sale voided"} — ${sale.saleNumber || ""}`.trim(),
        recordedById: userId || null,
      },
    });
    await tx.customer.update({
      where: { id: sale.customerId },
      data: { outstandingBalance: after },
    });
  }
}

/** Load a sale with everything reversal / edit / delete need, with guards. */
async function loadForMutation(tx, { businessId, saleId }) {
  // Lock the row first, like addPayment/finalizeInvoice do. Without it two
  // concurrent edits/deletes (double-click, batch-delete race) both read the
  // same pre-reversal snapshot and reverse it twice — restocking and unwinding
  // the ledger twice over. The lock serialises them; the second reads the state
  // the first left ('cancelled') and its guards below refuse the double action.
  const locked = await tx.$queryRaw`
    SELECT id FROM sales WHERE id = ${saleId}::uuid AND business_id = ${businessId}::uuid FOR UPDATE`;
  if (!locked.length) throw bad("Sale not found.", 404);
  const sale = await tx.sale.findFirst({
    where: { id: saleId, businessId },
    include: {
      items: {
        include: {
          product: { select: { name: true, costPrice: true, sellByUnit: true, packSize: true } },
        },
      },
      expenses: true,
      payments: true,
      refunds: { select: { id: true } },
      location: { select: { id: true, invoiceSchemeId: true } },
      shift: { select: { id: true, status: true } },
      fiscalReceipt: { select: { id: true } },
    },
  });
  if (!sale) throw bad("Sale not found.", 404);
  if (sale.refunds.length) {
    throw bad(
      "This sale already has sell returns against it — part of it has been reversed through the return path. Return the remaining items instead.",
    );
  }
  return sale;
}

/**
 * Undo everything a POSTED POS SALE did — the till counterpart of
 * reverseSaleEffects, because a till checkout touches things an invoice never
 * does: loyalty points, the register session's totals, and a revenue posting
 * that lumps tips/charges into one 4000 credit (total − tax).
 *
 * Refused whenever a faithful reversal is impossible:
 *   fiscalised (legally immutable) · register session already reconciled ·
 *   made-to-order lines (ingredients, not finished stock, were depleted) ·
 *   sell-by-unit lines (the deducted quantity is not recorded) · pending tender.
 */
async function voidPosSale(tx, { businessId, userId, sale, reason }) {
  if (sale.status === "pending") {
    throw bad("This sale is still settling with its payment provider — wait for it to complete, then correct it.");
  }
  if (sale.status !== "completed") throw bad(`A ${sale.status} sale cannot be voided.`);
  if (sale.fiscalReceipt) {
    throw bad("This sale was fiscalised — it is legally immutable. Correct it with a sell return.");
  }
  if (sale.shift && sale.shift.status !== "open") {
    throw bad("This sale's register session is already closed and reconciled. Correct it with a sell return.");
  }
  const productIds = [...new Set(sale.items.map((i) => i.productId))];
  const recipes = await tx.recipe.findMany({ where: { productId: { in: productIds } }, select: { productId: true } });
  if (recipes.length) {
    throw bad("This sale depleted recipe ingredients, which cannot be reconstructed. Correct it with a sell return.");
  }
  if (sale.items.some((i) => i.product && i.product.sellByUnit && i.product.packSize)) {
    throw bad("This sale contains sell-by-unit lines whose deducted stock quantity is not recorded. Correct it with a sell return.");
  }

  // A POS sale records EVERY tender as a payment row — credit included — so the
  // rows are the whole money story and must equal the total.
  const payments = (sale.payments || []).filter((p) => p.status === "completed");
  const paidRows = round2(payments.reduce((s, p) => s + round2(p.amount), 0));
  if (Math.abs(paidRows - round2(sale.totalAmount)) > 0.01) {
    throw bad(
      `This sale's payment rows (${paidRows.toFixed(2)}) do not add up to its total (${Number(sale.totalAmount).toFixed(2)}) — it cannot be reversed automatically.`,
      409,
    );
  }

  // ── Goods back on the shelf at the cost they left it ────────────────────────
  let cogs = 0;
  for (const it of sale.items) {
    const costPrice = round2(it.costPrice);
    cogs = round2(cogs + costPrice * it.quantity);
    await tx.$executeRaw`
      INSERT INTO stock_levels (id, product_id, location_id, quantity)
      VALUES (gen_random_uuid(), ${it.productId}::uuid, ${sale.locationId}::uuid, ${it.quantity})
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET quantity = stock_levels.quantity + ${it.quantity}, updated_at = NOW()
    `;
    await tx.stockMovement.create({
      data: {
        businessId, productId: it.productId, locationId: sale.locationId,
        type: "return", quantity: it.quantity,
        referenceType: "sale_void", referenceId: sale.id, createdById: userId || null,
      },
    });
    if (costPrice > 0) {
      await tx.costLayer.create({
        data: {
          businessId, productId: it.productId, locationId: sale.locationId,
          quantityReceived: it.quantity, quantityRemaining: it.quantity, unitCost: costPrice,
        },
      });
    }
  }

  // ── Mirror the till journal: Cr each tender back out, take back the revenue ──
  const total = round2(sale.totalAmount);
  const tax = round2(sale.taxAmount);
  const byAccount = new Map();
  for (const p of payments) {
    const code = accounting.tenderAccountCode(p.provider); // 'credit' → 1100
    byAccount.set(code, round2((byAccount.get(code) || 0) + round2(p.amount)));
  }
  const lines = [];
  if (total - tax !== 0)
    lines.push({ code: "4000", debit: round2(total - tax), credit: 0, description: "Sales revenue reversed" });
  if (tax > 0) lines.push({ code: "2100", debit: tax, credit: 0, description: "Sales tax reversed" });
  for (const [code, amt] of byAccount) {
    if (amt > 0) lines.push({ code, debit: 0, credit: amt, description: "Tender returned" });
  }
  if (cogs > 0) {
    lines.push({ code: "1200", debit: cogs, credit: 0, description: "Inventory restocked" });
    lines.push({ code: "5000", debit: 0, credit: cogs, description: "COGS reversed" });
  }
  await accounting.postJournal(tx, {
    businessId,
    description: `${reason || "Sale voided"} — ${sale.saleNumber || ""}`.trim(),
    sourceType: "sale_void", sourceId: sale.id, createdById: userId, lines,
  });

  // ── A credit sale's receivable is released on the customer too ──────────────
  const due = round2(sale.amountDue);
  if (sale.customerId && due > 0) {
    await tx.$queryRaw`SELECT 1 FROM customers WHERE id = ${sale.customerId}::uuid AND business_id = ${businessId}::uuid FOR UPDATE`;
    const cust = await tx.customer.findUnique({ where: { id: sale.customerId }, select: { outstandingBalance: true } });
    const after = round2(parseFloat(cust.outstandingBalance) - due);
    await tx.creditLedger.create({
      data: {
        businessId, customerId: sale.customerId, type: "adjustment", amount: due,
        direction: "credit", balanceAfter: after, saleId: sale.id,
        description: `${reason || "Sale voided"} — ${sale.saleNumber || ""}`.trim(),
        recordedById: userId || null,
      },
    });
    await tx.customer.update({ where: { id: sale.customerId }, data: { outstandingBalance: after } });
  }

  // ── Loyalty: give back what was redeemed, take back what was earned ─────────
  const netPoints = (sale.loyaltyPointsRedeemed || 0) - (sale.loyaltyPointsEarned || 0);
  if (sale.customerId && netPoints !== 0) {
    await tx.customer.update({ where: { id: sale.customerId }, data: { loyaltyPoints: { increment: netPoints } } });
    const newBal = await tx.customer.findUnique({ where: { id: sale.customerId }, select: { loyaltyPoints: true } });
    await tx.loyaltyLedger.create({
      data: {
        businessId, customerId: sale.customerId, saleId: sale.id,
        type: "adjust", points: netPoints, balanceAfter: Math.max(0, newBal.loyaltyPoints),
        notes: `${reason || "Sale voided"} — ${sale.saleNumber || ""}`.trim(), createdById: userId,
      },
    });
  }

  // ── The register session no longer contains this sale ───────────────────────
  if (sale.shiftId) {
    await tx.shift.update({
      where: { id: sale.shiftId },
      data: {
        totalSales: { decrement: total },
        totalTransactions: { decrement: 1 },
        totalCash: { decrement: round2(sale.cashAmount) },
        totalZaad: { decrement: round2(sale.zaadAmount) },
        totalCard: { decrement: round2(sale.cardAmount) },
      },
    });
  }
}

/**
 * Delete a sale document.
 *   draft / quotation / proforma — nothing ever posted, so the row is deleted.
 *   posted invoice sale — fully REVERSED (stock, journal, receivable, payments
 *   marked refunded) and kept as `cancelled`: its journals reference it, so the
 *   row must survive for the books to stay auditable.
 */
async function deleteInvoice(tx, { businessId, userId, saleId }) {
  const sale = await loadForMutation(tx, { businessId, saleId });

  if (NON_POSTING.has(sale.status)) {
    await tx.sale.delete({ where: { id: sale.id } }); // items/expenses cascade
    return { deleted: true, saleNumber: sale.saleNumber };
  }

  if (sale.status === "cancelled") throw bad("This sale is already cancelled.");

  if (sale.type === "pos") {
    // A till sale reverses through its own engine: loyalty, the register
    // session's totals and its lumped revenue posting all unwind with it.
    await voidPosSale(tx, { businessId, userId, sale, reason: "Sale deleted" });
    await tx.salePayment.updateMany({
      where: { saleId: sale.id, status: "completed" },
      data: { status: "refunded" },
    });
    const gone = await tx.sale.update({
      where: { id: sale.id },
      data: { status: "cancelled", amountPaid: 0, amountDue: 0 },
    });
    return { deleted: false, cancelled: true, saleNumber: gone.saleNumber };
  }

  if (sale.type !== "invoice") {
    throw bad("Only back-office and POS sales can be deleted.");
  }
  if (sale.status !== "completed") {
    throw bad(`A ${sale.status} sale cannot be deleted.`);
  }

  await reverseSaleEffects(tx, { businessId, userId, sale, reason: "Sale deleted" });
  await tx.salePayment.updateMany({
    where: { saleId: sale.id, status: "completed" },
    data: { status: "refunded" },
  });
  const updated = await tx.sale.update({
    where: { id: sale.id },
    data: { status: "cancelled", amountPaid: 0, amountDue: 0 },
  });
  return { deleted: false, cancelled: true, saleNumber: updated.saleNumber };
}

/**
 * Edit a sale document.
 *   Non-posting: the document is simply rewritten (and may be finalised at the
 *   same time by sending status "completed" with payments).
 *   Posted invoice sale: reversed and re-posted in this one transaction with the
 *   new lines — its existing payments stay attached and their money is carried
 *   through the reversal + repost untouched. If the payments now exceed the new
 *   total, the edit is refused: money would have to be handed back first.
 */
async function updateInvoice(
  tx,
  { businessId, userId, currency = "USD", saleId, body },
) {
  const sale = await loadForMutation(tx, { businessId, saleId });
  const wasPosted = !NON_POSTING.has(sale.status);
  if (wasPosted && sale.status !== "completed") {
    throw bad(`A ${sale.status} sale cannot be edited.`);
  }
  if (wasPosted && sale.type !== "invoice") {
    throw bad("Only back-office sales can be edited. POS sales are corrected with a sell return.");
  }
  if (wasPosted && (body.status || "completed") !== "completed") {
    throw bad("A posted sale stays Final — it cannot be demoted to a draft.");
  }

  // Same reference checks a fresh document gets.
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

  // Changing the invoice number is allowed, but never into a clash.
  let saleNumber = sale.saleNumber;
  if (body.invoice_no && String(body.invoice_no).trim() !== sale.saleNumber) {
    saleNumber = String(body.invoice_no).trim();
    const clash = await tx.sale.findFirst({
      where: { businessId, saleNumber, NOT: { id: sale.id } },
      select: { id: true },
    });
    if (clash) throw bad(`Invoice number "${saleNumber}" is already used.`);
  }

  // Money plan. A posted sale keeps its recorded payments; a draft being
  // finalised takes the payments from the form.
  const keptPayments = (sale.payments || []).filter((p) => p.status === "completed");
  const finalising = !wasPosted && (body.status || "completed") === "completed";
  let tenders, amountPaid, amountDue;
  if (wasPosted) {
    amountPaid = round2(keptPayments.reduce((s, p) => s + round2(p.amount), 0));
    if (amountPaid - totals.total > 0.01) {
      throw bad(
        `The ${amountPaid.toFixed(2)} already paid exceeds the new total (${totals.total.toFixed(2)}). Money would have to be returned first — use a sell return instead of shrinking the sale.`,
      );
    }
    amountDue = round2(totals.total - amountPaid);
    tenders = keptPayments.map((p) => ({
      method: p.provider,
      amount: round2(p.amount),
      payment_account_id: p.paymentAccountId || undefined,
    }));
  } else if (finalising) {
    ({ tenders, amountPaid, amountDue } = resolveTenders(body.payments, totals.total));
  } else {
    tenders = []; amountPaid = 0; amountDue = 0;
  }

  // A posted sale first has its old effects taken off the books entirely.
  if (wasPosted) {
    await reverseSaleEffects(tx, { businessId, userId, sale, reason: "Sale edited" });
  }

  // A draft taking Final now needs a real invoice number, exactly as a sale
  // created final would get: from the scheme, or the INV- fallback — never the
  // provisional DRA-/QUO-/PRO- placeholder.
  if (finalising && /^(DRA|QUO|PRO)-\d+$/.test(saleNumber || "")) {
    const schemeId = sale.invoiceSchemeId || (sale.location && sale.location.invoiceSchemeId) || null;
    saleNumber = schemeId
      ? await mintInvoiceNumber(tx, businessId, schemeId)
      : `INV-${Date.now()}`;
  }

  const newStatus = wasPosted
    ? "pending" // flipped back to completed by postFinal
    : (body.status || sale.status);

  const updated = await tx.sale.update({
    where: { id: sale.id },
    data: {
      locationId: location.id,
      customerId: body.customer_id || null,
      saleNumber,
      status: finalising ? "pending" : newStatus,
      saleDate: body.sale_date ? new Date(body.sale_date) : sale.saleDate,
      payTerm: body.pay_term != null ? Number(body.pay_term) : null,
      payTermPeriod: body.pay_term_period || null,
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
      amountDue: wasPosted || finalising ? totals.total : 0,
      notes: body.notes || null,
      staffNote: body.staff_note || null,
    },
  });

  // Replace the document's lines and expenses wholesale.
  await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
  await tx.saleExpense.deleteMany({ where: { saleId: sale.id } });
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
  for (const e of expenses) {
    await tx.saleExpense.create({
      data: { saleId: sale.id, name: e.name.trim(), amount: round2(e.amount) },
    });
  }

  if (!wasPosted && !finalising) {
    return tx.sale.findUnique({
      where: { id: sale.id },
      include: { items: true, expenses: true, payments: true },
    });
  }
  return postFinal(tx, {
    businessId,
    userId,
    sale: { ...updated, saleNumber },
    lines,
    totals,
    tenders,
    amountPaid,
    amountDue,
    currency,
    // A posted sale's payment rows already exist and stay attached.
    createPaymentRows: !wasPosted,
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

  // Now it becomes an invoice, so now it takes a real invoice number — from the
  // scheme, or the same INV- fallback a sale created final would get. Either
  // way the provisional DRA-/QUO-/PRO- placeholder never survives posting.
  const schemeId =
    sale.invoiceSchemeId ||
    (sale.location && sale.location.invoiceSchemeId) ||
    null;
  let saleNumber = sale.saleNumber;
  if (/^(DRA|QUO|PRO)-\d+$/.test(saleNumber || "")) {
    saleNumber = schemeId
      ? await mintInvoiceNumber(tx, businessId, schemeId)
      : `INV-${Date.now()}`;
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

/**
 * Bulk import: turn ONE parsed invoice (a group of spreadsheet rows sharing an
 * invoice number) into a real, posted sale, reusing the same engine every other
 * sale goes through. Products are matched by SKU first (product, then variant),
 * then by name; the customer by phone/email, then name, and created when new.
 * The sale is rung up completed and — when the batch is marked paid — settled in
 * full to cash, so it reaches the books identically to any invoice. Stamped with
 * `batch` so the whole import can be reversed later.
 *
 * The caller wraps EACH invoice in its own transaction, so one bad row (unknown
 * product, no stock) rolls back only itself and is reported while the rest land.
 */
async function importOneSale(
  tx,
  { businessId, userId, currency = "USD", batch, paid = true, defaultLocationId, invoice },
) {
  const locationId = invoice.location_id || defaultLocationId;
  if (!locationId) throw bad("No business location to import into.");

  // Customer: phone/email is the strong match, name the fallback; create when
  // new. A completed sale carries a receivable until paid and postFinal refuses
  // an unpaid balance with no customer, so every import gets one either way.
  const name = String(invoice.customer_name || "").trim();
  const phone = String(invoice.customer_phone || "").trim();
  const email = String(invoice.customer_email || "").trim();
  let customer = null;
  if (phone || email) {
    customer = await tx.customer.findFirst({
      where: {
        businessId,
        OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
      },
      select: { id: true },
    });
  }
  if (!customer && name) {
    customer = await tx.customer.findFirst({
      where: { businessId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
  }
  if (!customer) {
    customer = await tx.customer.create({
      data: {
        businessId,
        name: name || "Imported Customer",
        phone: phone || null,
        email: email || null,
      },
      select: { id: true },
    });
  }

  const items = [];
  for (const row of invoice.items || []) {
    const sku = String(row.sku || "").trim();
    const pname = String(row.product_name || "").trim();
    let productId = null;
    let variantId = null;
    if (sku) {
      const p = await tx.product.findFirst({
        where: { businessId, sku },
        select: { id: true },
      });
      if (p) productId = p.id;
      else {
        const v = await tx.productVariant.findFirst({
          where: { sku, product: { businessId } },
          select: { id: true, productId: true },
        });
        if (v) {
          productId = v.productId;
          variantId = v.id;
        }
      }
    }
    if (!productId && pname) {
      const p = await tx.product.findFirst({
        where: { businessId, name: { equals: pname, mode: "insensitive" } },
        select: { id: true },
      });
      if (p) productId = p.id;
    }
    if (!productId)
      throw bad(`Product not found: "${sku || pname || "(blank)"}".`);

    const qty = Number(row.quantity);
    if (!(qty > 0))
      throw bad(`Quantity for "${pname || sku}" must be greater than zero.`);

    // "Item Tax" arrives as a percentage; rates are stored as a fraction
    // (0.16 = 16%). Match an active rate, otherwise the line just carries no tax.
    let taxRateId = null;
    const taxPct =
      row.item_tax != null && row.item_tax !== "" ? Number(row.item_tax) : 0;
    if (taxPct > 0) {
      const rate = await tx.taxRate.findFirst({
        where: { businessId, isActive: true, rate: taxPct / 100 },
        select: { id: true },
      });
      if (rate) taxRateId = rate.id;
    }

    items.push({
      product_id: productId,
      variant_id: variantId,
      quantity: qty,
      unit_price:
        row.unit_price != null && row.unit_price !== ""
          ? Number(row.unit_price)
          : undefined,
      discount:
        row.discount != null && row.discount !== "" ? Number(row.discount) : 0,
      tax_rate_id: taxRateId,
    });
  }
  if (!items.length) throw bad("This invoice has no product lines.");

  const sale = await createInvoice(tx, {
    businessId,
    userId,
    currency,
    body: {
      location_id: locationId,
      customer_id: customer.id,
      invoice_no: String(invoice.invoice_no || "").trim() || undefined,
      sale_date: invoice.sale_date || undefined,
      status: "completed",
      discount_type: "flat",
      discount_value: 0,
      // Settle to cash at post time so a paid import never posts a receivable
      // (no credit-limit check, no ledger churn) and lands as paymentMethod=cash.
      // An unpaid import leaves the whole total due, billed to the customer.
      pay_full: paid,
      items,
    },
  });

  await tx.sale.update({
    where: { id: sale.id },
    data: { importBatch: batch },
  });
  return {
    id: sale.id,
    invoice_no: sale.saleNumber,
    total: Number(sale.totalAmount),
    customer_id: customer.id,
  };
}

module.exports = {
  NON_POSTING,
  computeTotals,
  createInvoice,
  finalizeInvoice,
  updateInvoice,
  deleteInvoice,
  addPayment,
  importOneSale,
  mintInvoiceNumber,
  round2,
};
