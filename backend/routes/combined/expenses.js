const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const accounting = require('../../lib/accounting');
const { auth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const {
  SupplierSchema, SupplierCommSchema, SupplierProductSchema,
  AdjustmentSchema, TransferSchema,
  TaskSchema, CommentSchema, ProjectSchema, MilestoneSchema,
  CreateUserSchema, UpdateUserSchema,
  SettingsSchema, CategorySchema, LocationSchema, CustomerSchema,
  ExpenseSchema, ExpenseCategorySchema, ExpensePaymentSchema, ExpenseImportSchema,
  PaymentAccountSchema, AccountTransferSchema, AccountDepositSchema,
  CustomerGroupSchema, UnitSchema, BrandSchema, VariationTemplateSchema, DiscountSchema,
  PriceGroupSchema, InvoiceLayoutSchema, InvoiceSchemeSchema, CommissionSettingsSchema,
  ServiceTypeSchema,
} = require('../../validation/schemas');
const { trackLogin } = require('../../lib/metrics');

// ── EXPENSES ──────────────────────────────────────────────────────────────────
// The reference's expense document: title, payee, category/sub-category, tax,
// contact, attachment, PARTIAL payments (one ExpensePayment row per tender, so
// reversals put every payment back where it came from) and recurring templates
// that materialise due copies of themselves when the list is read.
const expensesRouter = express.Router();

const expBad = (msg, statusCode = 400) => Object.assign(new Error(msg), { statusCode });
const expRound = (n) => Math.round((Number(n) || 0) * 100) / 100;
const EXP_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const expStatus = (paid, total) => (paid >= total - 0.001 ? 'paid' : paid > 0.001 ? 'partial' : 'due');

const EXP_INCLUDE = {
  category: { select: { id: true, name: true } },
  subCategory: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  taxRate: { select: { id: true, name: true, rate: true } },
  expenseForUser: { select: { id: true, name: true } },
  contact: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  payments: { orderBy: { paidOn: 'asc' } },
};

/** The document's normal-direction GL lines: Dr expense total, Cr each tender,
 *  Cr payables for the balance. A refund posts the same lines swapped. */
function expGlLines(expense, paymentRows) {
  const total = expRound(expense.amount);
  const due = expRound(expense.amountDue);
  const byAccount = new Map();
  for (const p of paymentRows) {
    const code = accounting.tenderAccountCode(p.method);
    byAccount.set(code, expRound((byAccount.get(code) || 0) + expRound(p.amount)));
  }
  const lines = [{ code: '5200', debit: total, credit: 0, description: 'Operating expense' }];
  for (const [code, amt] of byAccount) {
    if (amt > 0) lines.push({ code, debit: 0, credit: amt, description: 'Paid' });
  }
  if (due > 0) lines.push({ code: '2000', debit: 0, credit: due, description: 'Payable' });
  return lines;
}
const expSwap = (lines) => lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));

/** Post (or reverse) the document's whole GL in one journal. */
async function expJournal(tx, { businessId, userId, expense, paymentRows, reverse = false }) {
  let lines = expGlLines(expense, paymentRows);
  const mirror = Boolean(expense.isRefund) !== Boolean(reverse); // XOR
  if (mirror) lines = expSwap(lines);
  if (!lines.some((l) => l.debit > 0 || l.credit > 0)) return;
  await accounting.postJournal(tx, {
    businessId,
    // Books follow the DOCUMENT's date (backdated entry, imported history,
    // recurring catch-up) so period P&L matches the expense list. Reversals
    // are dated now — they happened now.
    ...(reverse ? {} : { date: expense.expenseDate || new Date() }),
    description: `${reverse ? 'Expense reversed' : expense.isRefund ? 'Expense refund' : 'Expense'} — ${expense.expenseNumber}`,
    sourceType: 'expense', sourceId: expense.id, createdById: userId,
    lines,
  });
}

/** Lock + load an expense with its payment rows. */
async function expLoad(tx, { businessId, expenseId }) {
  if (!EXP_UUID_RE.test(String(expenseId))) throw expBad('Expense not found.', 404);
  const locked = await tx.$queryRaw`
    SELECT id FROM expenses WHERE id = ${expenseId}::uuid AND business_id = ${businessId}::uuid FOR UPDATE`;
  if (!locked.length) throw expBad('Expense not found.', 404);
  return tx.expense.findFirst({ where: { id: expenseId, businessId }, include: { payments: true } });
}

async function expAssertRef(tx, businessId, ref, excludeId) {
  const clash = await tx.expense.findFirst({
    where: { businessId, expenseNumber: ref, ...(excludeId && { id: { not: excludeId } }) },
    select: { id: true },
  });
  if (clash) throw expBad(`Reference No "${ref}" is already used.`);
}

/** Every referenced entity must belong to the business. */
async function expAssertRefs(tx, businessId, b) {
  const checks = [
    [b.location_id, 'location', (id) => tx.location.findFirst({ where: { id, businessId }, select: { id: true } })],
    [b.category_id, 'expense category', (id) => tx.expenseCategory.findFirst({ where: { id, businessId }, select: { id: true } })],
    [b.sub_category_id, 'sub category', (id) => tx.expenseCategory.findFirst({ where: { id, businessId }, select: { id: true } })],
    [b.tax_rate_id, 'tax rate', (id) => tx.taxRate.findFirst({ where: { id, businessId }, select: { id: true, rate: true } })],
    [b.expense_for_user_id, 'user', (id) => tx.user.findFirst({ where: { id, businessId }, select: { id: true } })],
    [b.contact_id, 'contact', (id) => tx.customer.findFirst({ where: { id, businessId }, select: { id: true } })],
    [b.payment && b.payment.payment_account_id, 'payment account', (id) => tx.paymentAccount.findFirst({ where: { id, businessId }, select: { id: true } })],
  ];
  let taxRate = 0;
  for (const [id, what, find] of checks) {
    if (!id) continue;
    const row = await find(id);
    if (!row) throw expBad(`That ${what} does not exist.`, 404);
    if (what === 'tax rate') taxRate = parseFloat(row.rate) || 0;
  }
  return { taxRate };
}

const EXP_RECUR_MS = { days: 86400000, weeks: 7 * 86400000 };
function expAdvance(date, n, unit) {
  const d = new Date(date);
  if (unit === 'months' || unit === 'years') {
    // Clamp month-end overflow: Jan 31 + 1 month is Feb 28/29, never Mar 3 —
    // setMonth alone would skip February entirely and drift the day forever.
    const day = d.getDate();
    if (unit === 'months') d.setMonth(d.getMonth() + n); else d.setFullYear(d.getFullYear() + n);
    if (d.getDate() !== day) d.setDate(0);
    return d;
  }
  return new Date(d.getTime() + n * (EXP_RECUR_MS[unit] || EXP_RECUR_MS.days));
}

/** Materialise due copies of recurring templates. Runs before the list loads —
 *  no cron needed; the books catch up the moment anyone looks at them. Each
 *  copy lands unpaid (Dr expense / Cr payables) on its scheduled date. */
async function expMaterialiseRecurring(businessId, userId) {
  const now = new Date();
  const templates = await prisma.expense.findMany({
    where: { businessId, isRecurring: true, nextRecurDate: { lte: now } },
    include: { _count: { select: { recurChildren: true } } },
  });
  for (const t of templates) {
    try {
      await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw`
          SELECT id FROM expenses WHERE id = ${t.id}::uuid FOR UPDATE`;
        if (!locked.length) return;
        const fresh = await tx.expense.findFirst({ where: { id: t.id }, include: { _count: { select: { recurChildren: true } } } });
        if (!fresh || !fresh.isRecurring || !fresh.nextRecurDate || fresh.nextRecurDate > now) return;
        let generated = fresh._count.recurChildren;
        let nextDate = fresh.nextRecurDate;
        // Catch up at most 12 missed periods per read — a bounded loop, not a
        // runaway generator, if a template was ignored for a year.
        for (let i = 0; i < 12 && nextDate && nextDate <= now; i++) {
          if (fresh.recurRepetitions && generated >= fresh.recurRepetitions) { nextDate = null; break; }
          const amount = expRound(fresh.amount);
          const child = await tx.expense.create({
            data: {
              businessId, categoryId: fresh.categoryId, subCategoryId: fresh.subCategoryId,
              locationId: fresh.locationId,
              expenseNumber: `EXP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              title: fresh.title, paymentTo: fresh.paymentTo,
              amount, paymentStatus: 'due', amountPaid: 0, amountDue: amount,
              taxRateId: fresh.taxRateId, taxAmount: fresh.taxAmount,
              expenseFor: fresh.expenseFor, expenseForUserId: fresh.expenseForUserId,
              contactId: fresh.contactId, note: fresh.note, isRefund: fresh.isRefund,
              recurParentId: fresh.id, expenseDate: nextDate, createdById: fresh.createdById,
            },
          });
          await expJournal(tx, { businessId, userId: fresh.createdById, expense: child, paymentRows: [] });
          generated++;
          nextDate = expAdvance(nextDate, fresh.recurInterval || 1, fresh.recurIntervalType || 'months');
        }
        const done = fresh.recurRepetitions && generated >= fresh.recurRepetitions;
        await tx.expense.update({
          where: { id: fresh.id },
          data: { nextRecurDate: done ? null : nextDate },
        });
      });
    } catch (e) {
      // One broken template must not block the whole list.
      console.error('recurring expense generation failed:', t.id, e.message);
    }
  }
}

expensesRouter.get('/', auth, async (req, res, next) => {
  try {
    await expMaterialiseRecurring(req.user.business_id, req.user.id);
    const { location_id, category_id, payment_status, from, to, search } = req.query;
    const dateFilter = {};
    if (from && !Number.isNaN(Date.parse(from))) dateFilter.gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) dateFilter.lte = new Date(new Date(to).setDate(new Date(to).getDate() + 1));
    const where = {
      businessId: req.user.business_id,
      ...(Object.keys(dateFilter).length && { expenseDate: dateFilter }),
      ...(location_id && EXP_UUID_RE.test(location_id) && { locationId: location_id }),
      ...(category_id && EXP_UUID_RE.test(category_id) && { categoryId: category_id }),
      ...(payment_status && ['paid', 'partial', 'due'].includes(payment_status) && { paymentStatus: payment_status }),
      ...(search && {
        OR: [
          { expenseNumber: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { paymentTo: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [expenses, sums] = await Promise.all([
      prisma.expense.findMany({ where, include: EXP_INCLUDE, orderBy: { expenseDate: 'desc' }, take: 500 }),
      prisma.expense.aggregate({ where, _sum: { amount: true, amountDue: true } }),
    ]);
    res.json({
      expenses,
      totals: { total_amount: Number(sums._sum.amount || 0), total_due: Number(sums._sum.amountDue || 0) },
    });
  } catch (err) { next(err); }
});

expensesRouter.get('/:id', auth, async (req, res, next) => {
  try {
    if (!EXP_UUID_RE.test(req.params.id)) return res.status(404).json({ title: 'Expense not found.', status: 404 });
    const expense = await prisma.expense.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: EXP_INCLUDE,
    });
    if (!expense) return res.status(404).json({ title: 'Expense not found.', status: 404 });
    res.json(expense);
  } catch (err) { next(err); }
});

expensesRouter.post('/', auth, validate(ExpenseSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const expense = await prisma.$transaction(async (tx) => {
      const { taxRate } = await expAssertRefs(tx, req.user.business_id, b);
      const ref = (b.ref_no || '').trim() || `EXP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      if (b.ref_no && b.ref_no.trim()) await expAssertRef(tx, req.user.business_id, ref);

      const amount = expRound(b.amount);
      // Legacy clients send payment_status instead of a payment object:
      // 'paid' = the whole total in cash, 'due' = nothing yet.
      const payment = b.payment && expRound(b.payment.amount) > 0
        ? b.payment
        : b.payment_status === 'paid' ? { amount, method: 'cash' } : null;
      const paid = payment ? expRound(payment.amount) : 0;
      if (paid - amount > 0.001) throw expBad(`Payment (${paid.toFixed(2)}) exceeds the expense total (${amount.toFixed(2)}).`);

      const isRecurring = !!b.is_recurring;
      const expenseDate = b.date ? new Date(b.date) : new Date();
      const e = await tx.expense.create({
        data: {
          businessId: req.user.business_id,
          categoryId: b.category_id || null,
          subCategoryId: b.sub_category_id || null,
          locationId: b.location_id || null,
          expenseNumber: ref,
          title: b.title || null,
          paymentTo: b.payment_to || null,
          amount,
          paymentStatus: expStatus(paid, amount),
          amountPaid: paid,
          amountDue: expRound(amount - paid),
          taxRateId: b.tax_rate_id || null,
          taxAmount: expRound(amount * taxRate),
          expenseFor: b.expense_for || null,
          expenseForUserId: b.expense_for_user_id || null,
          contactId: b.contact_id || null,
          note: b.note || null,
          receiptUrl: b.receipt_url || null,
          documentUrl: b.document_url || null,
          documentKey: b.document_key || null,
          isRefund: b.is_refund || false,
          isRecurring,
          recurInterval: isRecurring ? (b.recur_interval || 1) : null,
          recurIntervalType: isRecurring ? (b.recur_interval_type || 'months') : null,
          recurRepetitions: isRecurring ? (b.recur_repetitions || null) : null,
          nextRecurDate: isRecurring
            ? expAdvance(expenseDate, b.recur_interval || 1, b.recur_interval_type || 'months')
            : null,
          expenseDate,
          createdById: req.user.id,
        },
      });

      const paymentRows = [];
      if (paid > 0) {
        const row = await tx.expensePayment.create({
          data: {
            businessId: req.user.business_id, expenseId: e.id,
            amount: paid, method: (payment.method || 'cash').toLowerCase(),
            paymentAccountId: payment.payment_account_id || null,
            paidOn: payment.paid_on ? new Date(payment.paid_on) : new Date(),
            note: payment.note || null, createdById: req.user.id,
          },
        });
        paymentRows.push(row);
      }

      await expJournal(tx, { businessId: req.user.business_id, userId: req.user.id, expense: e, paymentRows });
      return tx.expense.findFirst({ where: { id: e.id }, include: EXP_INCLUDE });
    });
    res.status(201).json(expense);
  } catch (err) { next(err); }
});

// Full document edit. The payment rows are kept as-is (they are money that
// actually moved); the new total may not undercut what is already paid.
expensesRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(ExpenseSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const expense = await prisma.$transaction(async (tx) => {
      const existing = await expLoad(tx, { businessId: req.user.business_id, expenseId: req.params.id });
      const { taxRate } = await expAssertRefs(tx, req.user.business_id, b);
      if (b.ref_no && b.ref_no.trim()) await expAssertRef(tx, req.user.business_id, b.ref_no.trim(), existing.id);

      const amount = expRound(b.amount);
      const paid = expRound(existing.amountPaid);
      if (paid - amount > 0.001) {
        throw expBad(`This expense already has ${paid.toFixed(2)} paid against it — the total cannot go below that.`);
      }

      // Reverse-and-repost, like every other document engine here.
      await expJournal(tx, { businessId: req.user.business_id, userId: req.user.id, expense: existing, paymentRows: existing.payments, reverse: true });

      const isRecurring = !!b.is_recurring;
      const expenseDate = b.date ? new Date(b.date) : existing.expenseDate;
      const updated = await tx.expense.update({
        where: { id: existing.id },
        data: {
          categoryId: b.category_id || null,
          subCategoryId: b.sub_category_id || null,
          locationId: b.location_id || null,
          ...(b.ref_no && b.ref_no.trim() && { expenseNumber: b.ref_no.trim() }),
          title: b.title ?? null,
          paymentTo: b.payment_to ?? null,
          amount,
          paymentStatus: expStatus(paid, amount),
          amountPaid: paid,
          amountDue: expRound(amount - paid),
          taxRateId: b.tax_rate_id || null,
          taxAmount: expRound(amount * taxRate),
          // Absent = untouched (the new editor never sends the legacy field);
          // the attachment is full-replace so removing it actually removes it.
          expenseFor: b.expense_for !== undefined ? b.expense_for : existing.expenseFor,
          expenseForUserId: b.expense_for_user_id || null,
          contactId: b.contact_id || null,
          note: b.note ?? null,
          documentUrl: b.document_url ?? null,
          documentKey: b.document_key ?? null,
          isRefund: b.is_refund || false,
          isRecurring,
          recurInterval: isRecurring ? (b.recur_interval || 1) : null,
          recurIntervalType: isRecurring ? (b.recur_interval_type || 'months') : null,
          recurRepetitions: isRecurring ? (b.recur_repetitions || null) : null,
          // Re-enabling recurrence schedules FORWARD from now. Anchoring at the
          // (possibly old) document date would make the next list read back-fill
          // a copy for every missed period — duplicate documents and journals.
          nextRecurDate: isRecurring
            ? (existing.isRecurring && existing.nextRecurDate
                ? existing.nextRecurDate
                : expAdvance(
                    expenseDate > new Date() ? expenseDate : new Date(),
                    b.recur_interval || 1, b.recur_interval_type || 'months'))
            : null,
          expenseDate,
        },
        include: { payments: true },
      });

      await expJournal(tx, { businessId: req.user.business_id, userId: req.user.id, expense: updated, paymentRows: updated.payments });
      return tx.expense.findFirst({ where: { id: existing.id }, include: EXP_INCLUDE });
    });
    res.json(expense);
  } catch (err) { next(err); }
});

// Take another payment against the balance.
expensesRouter.post('/:id/payment', auth, validate(ExpensePaymentSchema), async (req, res, next) => {
  try {
    const expense = await prisma.$transaction(async (tx) => {
      const e = await expLoad(tx, { businessId: req.user.business_id, expenseId: req.params.id });
      const amount = expRound(req.body.amount);
      const due = expRound(e.amountDue);
      if (amount - due > 0.001) throw expBad(`That is more than the ${due.toFixed(2)} still due on this expense.`);
      if (req.body.payment_account_id) {
        const acc = await tx.paymentAccount.findFirst({ where: { id: req.body.payment_account_id, businessId: req.user.business_id }, select: { id: true } });
        if (!acc) throw expBad('Payment account not found.', 404);
      }
      const method = (req.body.method || 'cash').toLowerCase();
      await tx.expensePayment.create({
        data: {
          businessId: req.user.business_id, expenseId: e.id, amount, method,
          paymentAccountId: req.body.payment_account_id || null,
          paidOn: req.body.paid_on ? new Date(req.body.paid_on) : new Date(),
          note: req.body.note || null, createdById: req.user.id,
        },
      });
      const paid = expRound(Number(e.amountPaid) + amount);
      await tx.expense.update({
        where: { id: e.id },
        data: { amountPaid: paid, amountDue: expRound(Number(e.amount) - paid), paymentStatus: expStatus(paid, Number(e.amount)) },
      });
      // Settle the payable: Dr 2000 / Cr the tender it was paid from.
      // A refund's "payment" is money coming back, so it mirrors.
      const lines = [
        { code: '2000', debit: amount, credit: 0, description: 'Payable settled' },
        { code: accounting.tenderAccountCode(method), debit: 0, credit: amount, description: 'Paid' },
      ];
      await accounting.postJournal(tx, {
        businessId: req.user.business_id,
        date: req.body.paid_on ? new Date(req.body.paid_on) : new Date(),
        description: `Expense payment — ${e.expenseNumber}`,
        sourceType: 'expense_payment', sourceId: e.id, createdById: req.user.id,
        lines: e.isRefund ? expSwap(lines) : lines,
      });
      return tx.expense.findFirst({ where: { id: e.id }, include: EXP_INCLUDE });
    });
    res.json(expense);
  } catch (err) { next(err); }
});

expensesRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      const e = await expLoad(tx, { businessId: req.user.business_id, expenseId: req.params.id });
      await expJournal(tx, { businessId: req.user.business_id, userId: req.user.id, expense: e, paymentRows: e.payments, reverse: true });
      await tx.expense.delete({ where: { id: e.id } }); // payments cascade
    });
    res.json({ message: 'Expense deleted and its ledger entries reversed.' });
  } catch (err) { next(err); }
});

// ── Import expenses — one row per spreadsheet line ────────────────────────────
expensesRouter.post('/import', auth, requireRole('owner', 'manager'), validate(ExpenseImportSchema), async (req, res, next) => {
  try {
    const created = [];
    const errors = [];
    const bizId = req.user.business_id;
    for (let i = 0; i < req.body.rows.length; i++) {
      const r = req.body.rows[i];
      try {
        await prisma.$transaction(async (tx) => {
          const amount = expRound(r.total_amount);
          if (!(amount > 0)) throw expBad('Total amount must be greater than zero.');
          const paid = expRound(r.paid_amount || 0);
          if (paid < 0) throw expBad('Paid amount cannot be negative.');
          if (paid - amount > 0.001) throw expBad(`Paid amount (${paid.toFixed(2)}) exceeds the total (${amount.toFixed(2)}).`);

          let locationId = null;
          if (r.location && r.location.trim()) {
            const loc = await tx.location.findFirst({ where: { businessId: bizId, name: { equals: r.location.trim(), mode: 'insensitive' } }, select: { id: true } });
            if (!loc) throw expBad(`Business location not found: "${r.location.trim()}".`);
            locationId = loc.id;
          } else {
            const loc = await tx.location.findFirst({ where: { businessId: bizId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
            locationId = loc && loc.id;
          }

          // Categories are created on demand, exactly as the reference promises.
          let categoryId = null, subCategoryId = null;
          if (r.category && r.category.trim()) {
            const catName = r.category.trim();
            const cat = await tx.expenseCategory.findFirst({ where: { businessId: bizId, name: { equals: catName, mode: 'insensitive' } } })
              || await tx.expenseCategory.create({ data: { businessId: bizId, name: catName } });
            categoryId = cat.id;
            if (r.sub_category && r.sub_category.trim()) {
              const subName = r.sub_category.trim();
              const existingSub = await tx.expenseCategory.findFirst({
                where: { businessId: bizId, parentId: cat.id, name: { equals: subName, mode: 'insensitive' } },
              });
              const sub = existingSub || await tx.expenseCategory.create({ data: { businessId: bizId, name: subName, parentId: cat.id } });
              subCategoryId = sub.id;
            }
          }

          let expenseForUserId = null;
          if (r.expense_for && r.expense_for.trim()) {
            const u = await tx.user.findFirst({
              where: { businessId: bizId, OR: [{ email: r.expense_for.trim().toLowerCase() }, { name: { equals: r.expense_for.trim(), mode: 'insensitive' } }] },
              select: { id: true },
            });
            if (u) expenseForUserId = u.id;
          }
          let contactId = null;
          if (r.contact_id && EXP_UUID_RE.test(r.contact_id.trim())) {
            const c = await tx.customer.findFirst({ where: { id: r.contact_id.trim(), businessId: bizId }, select: { id: true } });
            if (c) contactId = c.id;
          }
          let taxRateId = null, taxRate = 0;
          if (r.tax && r.tax.trim()) {
            const t = await tx.taxRate.findFirst({ where: { businessId: bizId, isActive: true, name: { equals: r.tax.trim(), mode: 'insensitive' } }, select: { id: true, rate: true } });
            if (t) { taxRateId = t.id; taxRate = parseFloat(t.rate) || 0; }
          }
          const ref = (r.ref_no || '').trim() || `EXP-${Date.now()}-${i}`;
          if (r.ref_no && r.ref_no.trim()) await expAssertRef(tx, bizId, ref);
          const expenseDate = r.date && !Number.isNaN(Date.parse(r.date)) ? new Date(r.date) : new Date();

          const e = await tx.expense.create({
            data: {
              businessId: bizId, categoryId, subCategoryId, locationId,
              expenseNumber: ref, amount,
              paymentStatus: expStatus(paid, amount), amountPaid: paid, amountDue: expRound(amount - paid),
              taxRateId, taxAmount: expRound(amount * taxRate),
              expenseForUserId, contactId, note: (r.note || '').trim() || null,
              expenseDate, createdById: req.user.id,
            },
          });
          const paymentRows = [];
          if (paid > 0) {
            const row = await tx.expensePayment.create({
              data: {
                businessId: bizId, expenseId: e.id, amount: paid,
                method: (() => {
                  const m = (r.payment_method || 'cash').trim().toLowerCase();
                  // Reference template speaks "Bank Transfer"/"Cheque" — both
                  // draw on the bank account, not the cash drawer.
                  if (m === 'bank transfer' || m === 'cheque') return 'bank';
                  return ['cash', 'zaad', 'evc', 'card', 'bank', 'other'].includes(m) ? m : 'cash';
                })(),
                paidOn: r.paid_on && !Number.isNaN(Date.parse(r.paid_on)) ? new Date(r.paid_on) : expenseDate,
                createdById: req.user.id,
              },
            });
            paymentRows.push(row);
          }
          await expJournal(tx, { businessId: bizId, userId: req.user.id, expense: e, paymentRows });
          return { row: i + 1, id: e.id, ref: e.expenseNumber, amount };
        }).then((r) => created.push(r));
      } catch (err) {
        errors.push({ row: i + 1, error: err.message || 'Import failed.' });
      }
    }
    // 200 even when nothing imported: the body IS the per-row report.
    res.status(created.length ? 201 : 200).json({ imported: created.length, failed: errors.length, created, errors });
  } catch (err) { next(err); }
});

const expenseCategoriesRouter = express.Router();

expenseCategoriesRouter.get('/', auth, async (req, res, next) => {
  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { businessId: req.user.business_id },
      include: { parent: { select: { id: true, name: true } }, _count: { select: { children: true, expenses: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (err) { next(err); }
});

expenseCategoriesRouter.post('/', auth, requireRole('owner', 'manager'), validate(ExpenseCategorySchema), async (req, res, next) => {
  try {
    if (req.body.parent_id) {
      const parent = await prisma.expenseCategory.findFirst({ where: { id: req.body.parent_id, businessId: req.user.business_id }, select: { id: true, parentId: true } });
      if (!parent) return res.status(404).json({ title: 'Parent category not found.', status: 404 });
      if (parent.parentId) return res.status(400).json({ title: 'Sub-categories nest one level only.', status: 400 });
    }
    // Adding must never silently rewrite an existing category (the old upsert
    // re-parented it and wiped its code). Same name = edit it instead.
    const clash = await prisma.expenseCategory.findFirst({
      where: { businessId: req.user.business_id, name: { equals: req.body.name, mode: 'insensitive' } }, select: { id: true },
    });
    if (clash) return res.status(400).json({ title: `Category "${req.body.name}" already exists.`, status: 400 });
    const category = await prisma.expenseCategory.create({
      data: { businessId: req.user.business_id, name: req.body.name, code: req.body.code || null, parentId: req.body.parent_id || null },
    });
    res.status(201).json(category);
  } catch (err) { next(err); }
});

expenseCategoriesRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(ExpenseCategorySchema), async (req, res, next) => {
  try {
    const cat = await prisma.expenseCategory.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!cat) return res.status(404).json({ title: 'Not found', status: 404 });
    if (req.body.parent_id) {
      if (req.body.parent_id === cat.id) return res.status(400).json({ title: 'A category cannot be its own parent.', status: 400 });
      const parent = await prisma.expenseCategory.findFirst({ where: { id: req.body.parent_id, businessId: req.user.business_id }, select: { id: true, parentId: true } });
      if (!parent) return res.status(404).json({ title: 'Parent category not found.', status: 404 });
      if (parent.parentId) return res.status(400).json({ title: 'Sub-categories nest one level only.', status: 400 });
      const kids = await prisma.expenseCategory.count({ where: { parentId: cat.id } });
      if (kids > 0) return res.status(400).json({ title: 'This category has sub-categories — move them first.', status: 400 });
    }
    const updated = await prisma.expenseCategory.update({
      where: { id: cat.id },
      data: { name: req.body.name, code: req.body.code || null, parentId: req.body.parent_id || null },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

expenseCategoriesRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const cat = await prisma.expenseCategory.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!cat) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.$transaction([
      // Children float up to top-level; expenses keep their history unlinked.
      prisma.expenseCategory.updateMany({ where: { parentId: cat.id }, data: { parentId: null } }),
      prisma.expense.updateMany({ where: { categoryId: cat.id }, data: { categoryId: null } }),
      prisma.expense.updateMany({ where: { subCategoryId: cat.id }, data: { subCategoryId: null } }),
      prisma.expenseCategory.delete({ where: { id: cat.id } }),
    ]);
    res.json({ message: 'Category deleted.' });
  } catch (err) { next(err); }
});

// ── PAYMENT ACCOUNTS ──────────────────────────────────────────────────────────
const paymentAccountsRouter = express.Router();

paymentAccountsRouter.get('/', auth, async (req, res, next) => {
  try {
    const accounts = await prisma.paymentAccount.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ accounts });
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/', auth, requireRole('owner', 'manager'), validate(PaymentAccountSchema), async (req, res, next) => {
  try {
    const { name, type, account_number, balance } = req.body;
    const account = await prisma.paymentAccount.create({
      data: { businessId: req.user.business_id, name, type: type || 'Cash', accountNumber: account_number || null, balance: balance || 0 },
    });
    res.status(201).json(account);
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/transfer', auth, requireRole('owner', 'manager'), validate(AccountTransferSchema), async (req, res, next) => {
  try {
    const { from_id, to_id, amount } = req.body;
    const [from, to] = await Promise.all([
      prisma.paymentAccount.findFirst({ where: { id: from_id, businessId: req.user.business_id } }),
      prisma.paymentAccount.findFirst({ where: { id: to_id, businessId: req.user.business_id } }),
    ]);
    if (!from || !to) return res.status(404).json({ title: 'Account not found', status: 404 });
    if (parseFloat(from.balance) < amount) return res.status(400).json({ title: 'Insufficient balance', status: 400 });
    await prisma.$transaction([
      prisma.paymentAccount.update({ where: { id: from_id }, data: { balance: { decrement: amount } } }),
      prisma.paymentAccount.update({ where: { id: to_id }, data: { balance: { increment: amount } } }),
    ]);
    res.json({ message: 'Transfer complete.' });
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/:id/deposit', auth, requireRole('owner', 'manager'), validate(AccountDepositSchema), async (req, res, next) => {
  try {
    const acc = await prisma.paymentAccount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!acc) return res.status(404).json({ title: 'Not found', status: 404 });
    const updated = await prisma.paymentAccount.update({ where: { id: req.params.id }, data: { balance: { increment: req.body.amount } } });
    res.json(updated);
  } catch (err) { next(err); }
});

paymentAccountsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const acc = await prisma.paymentAccount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!acc) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.paymentAccount.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Account removed.' });
  } catch (err) { next(err); }
});


module.exports = { expensesRouter, expenseCategoriesRouter, paymentAccountsRouter };
