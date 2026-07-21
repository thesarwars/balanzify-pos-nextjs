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
  PaymentAccountSchema, PaymentAccountTypeSchema, LinkPaymentSchema, AccountTransferSchema, AccountDepositSchema,
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
// Reference parity: user-defined account types (one level), computed LIVE
// balances (opening/deposits/transfers + linked payment rows), a cross-source
// payment report with account linking, and the Balance Sheet / Trial Balance /
// Cash Flow views built from the same numbers the operational screens show.
const paymentAccountsRouter = express.Router();

const paBad = (msg, statusCode = 400) => Object.assign(new Error(msg), { statusCode });
const paRound = (n) => Math.round((Number(n) || 0) * 100) / 100;
const PA_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sale statuses whose money is real (mirrors the sales list's posted set).
const PA_POSTED_SALES = ['completed', 'partially_refunded', 'refunded'];

/** Filter on the date the payer says they paid, falling back to the row's
 *  creation time — the same date the report displays and sorts by. */
const paDateCond = (field, cond) => (cond ? { OR: [{ [field]: cond }, { [field]: null, createdAt: cond }] } : {});

/** Per-account payment sums: sales flow IN, expenses and purchases flow OUT.
 *  Payments of REFUND expenses are money coming back (their GL mirrors), and
 *  sale refunds are money leaving — both carry their true sign here.
 *  `until` is inclusive (lte); `before` is exclusive (lt). */
async function paPaymentSums(businessId, { until, before } = {}) {
  const dateCap = before ? { lt: before } : until ? { lte: until } : undefined;
  const [saleIn, expOut, expRefundIn, poOut, refundOut] = await Promise.all([
    prisma.salePayment.groupBy({
      by: ['paymentAccountId'],
      where: { businessId, status: 'completed', paymentAccountId: { not: null }, ...paDateCond('paidOn', dateCap) },
      _sum: { amount: true },
    }),
    prisma.expensePayment.groupBy({
      by: ['paymentAccountId'],
      where: { businessId, paymentAccountId: { not: null }, expense: { isRefund: false }, ...paDateCond('paidOn', dateCap) },
      _sum: { amount: true },
    }),
    prisma.expensePayment.groupBy({
      by: ['paymentAccountId'],
      where: { businessId, paymentAccountId: { not: null }, expense: { isRefund: true }, ...paDateCond('paidOn', dateCap) },
      _sum: { amount: true },
    }),
    prisma.pOPayment.groupBy({
      by: ['paymentAccountId'],
      where: { purchaseOrder: { businessId }, paymentAccountId: { not: null }, ...paDateCond('paidAt', dateCap) },
      _sum: { amount: true },
    }),
    prisma.refund.groupBy({
      by: ['paymentAccountId'],
      where: { businessId, paymentAccountId: { not: null }, ...(dateCap && { createdAt: dateCap }) },
      _sum: { totalRefunded: true },
    }),
  ]);
  const sums = new Map();
  const add = (rows, sign, key = 'amount') => rows.forEach((r) => {
    sums.set(r.paymentAccountId, paRound((sums.get(r.paymentAccountId) || 0) + sign * Number(r._sum[key] || 0)));
  });
  add(saleIn, 1); add(expOut, -1); add(expRefundIn, 1); add(poOut, -1); add(refundOut, -1, 'totalRefunded');
  return sums;
}

/** Payments across all three sources with no account — the red banner's number. */
async function paUnlinkedCount(businessId) {
  const [a, b, c, d] = await Promise.all([
    prisma.salePayment.count({ where: { businessId, status: 'completed', paymentAccountId: null, amount: { gt: 0 } } }),
    prisma.expensePayment.count({ where: { businessId, paymentAccountId: null } }),
    prisma.pOPayment.count({ where: { purchaseOrder: { businessId }, paymentAccountId: null } }),
    prisma.refund.count({ where: { businessId, paymentAccountId: null } }),
  ]);
  return a + b + c + d;
}

const PA_TYPE_INCLUDE = { accountType: { include: { parent: { select: { id: true, name: true } } } }, createdBy: { select: { name: true } } };

paymentAccountsRouter.get('/', auth, async (req, res, next) => {
  try {
    const { status = 'active', account_type_id } = req.query;
    const accounts = await prisma.paymentAccount.findMany({
      where: {
        businessId: req.user.business_id,
        ...(status === 'active' ? { isActive: true } : status === 'closed' ? { isActive: false } : {}),
        ...(account_type_id && PA_UUID_RE.test(account_type_id) && { accountTypeId: account_type_id }),
      },
      include: PA_TYPE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    const sums = await paPaymentSums(req.user.business_id);
    res.json({
      accounts: accounts.map((a) => ({ ...a, computedBalance: paRound(Number(a.balance) + (sums.get(a.id) || 0)) })),
      unlinked_count: await paUnlinkedCount(req.user.business_id),
    });
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/', auth, requireRole('owner', 'manager'), validate(PaymentAccountSchema), async (req, res, next) => {
  try {
    const { name, type, account_number, balance, account_type_id, note } = req.body;
    if (account_type_id) {
      const t = await prisma.paymentAccountType.findFirst({ where: { id: account_type_id, businessId: req.user.business_id }, select: { id: true } });
      if (!t) return res.status(404).json({ title: 'Account type not found.', status: 404 });
    }
    const account = await prisma.paymentAccount.create({
      data: {
        businessId: req.user.business_id, name, type: type || 'Cash',
        accountTypeId: account_type_id || null, accountNumber: account_number || null,
        note: note || null, balance: balance || 0, createdById: req.user.id,
      },
      include: PA_TYPE_INCLUDE,
    });
    res.status(201).json(account);
  } catch (err) { next(err); }
});

paymentAccountsRouter.put('/link-payment', auth, requireRole('owner', 'manager'), validate(LinkPaymentSchema), async (req, res, next) => {
  try {
    const { payment_type, payment_id, account_id } = req.body;
    const bizId = req.user.business_id;
    if (account_id) {
      const acc = await prisma.paymentAccount.findFirst({ where: { id: account_id, businessId: bizId }, select: { id: true } });
      if (!acc) return res.status(404).json({ title: 'Account not found.', status: 404 });
    }
    if (payment_type === 'sell') {
      const p = await prisma.salePayment.findFirst({ where: { id: payment_id, businessId: bizId }, select: { id: true } });
      if (!p) return res.status(404).json({ title: 'Payment not found.', status: 404 });
      await prisma.salePayment.update({ where: { id: p.id }, data: { paymentAccountId: account_id || null } });
    } else if (payment_type === 'expense') {
      const p = await prisma.expensePayment.findFirst({ where: { id: payment_id, businessId: bizId }, select: { id: true } });
      if (!p) return res.status(404).json({ title: 'Payment not found.', status: 404 });
      await prisma.expensePayment.update({ where: { id: p.id }, data: { paymentAccountId: account_id || null } });
    } else if (payment_type === 'purchase') {
      const p = await prisma.pOPayment.findFirst({ where: { id: payment_id, purchaseOrder: { businessId: bizId } }, select: { id: true } });
      if (!p) return res.status(404).json({ title: 'Payment not found.', status: 404 });
      await prisma.pOPayment.update({ where: { id: p.id }, data: { paymentAccountId: account_id || null } });
    } else {
      const r = await prisma.refund.findFirst({ where: { id: payment_id, businessId: bizId }, select: { id: true } });
      if (!r) return res.status(404).json({ title: 'Refund not found.', status: 404 });
      await prisma.refund.update({ where: { id: r.id }, data: { paymentAccountId: account_id || null } });
    }
    res.json({ message: 'Payment linked.' });
  } catch (err) { next(err); }
});


paymentAccountsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(PaymentAccountSchema), async (req, res, next) => {
  try {
    if (!PA_UUID_RE.test(req.params.id)) return res.status(404).json({ title: 'Not found', status: 404 });
    const acc = await prisma.paymentAccount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!acc) return res.status(404).json({ title: 'Not found', status: 404 });
    const { name, type, account_number, account_type_id, note } = req.body;
    if (account_type_id) {
      const t = await prisma.paymentAccountType.findFirst({ where: { id: account_type_id, businessId: req.user.business_id }, select: { id: true } });
      if (!t) return res.status(404).json({ title: 'Account type not found.', status: 404 });
    }
    // The opening balance is history, not an editable field — deposits adjust it.
    const updated = await prisma.paymentAccount.update({
      where: { id: acc.id },
      data: { name, type: type || acc.type, accountTypeId: account_type_id || null, accountNumber: account_number || null, note: note || null },
      include: PA_TYPE_INCLUDE,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/:id/reopen', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    if (!PA_UUID_RE.test(req.params.id)) return res.status(404).json({ title: 'Not found', status: 404 });
    const acc = await prisma.paymentAccount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!acc) return res.status(404).json({ title: 'Not found', status: 404 });
    const updated = await prisma.paymentAccount.update({ where: { id: acc.id }, data: { isActive: true } });
    res.json(updated);
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/transfer', auth, requireRole('owner', 'manager'), validate(AccountTransferSchema), async (req, res, next) => {
  try {
    const { from_id, to_id, amount } = req.body;
    if (from_id === to_id) return res.status(400).json({ title: 'Pick two different accounts.', status: 400 });
    await prisma.$transaction(async (tx) => {
      // Lock both rows (single IN-list = consistent order, no deadlock), then
      // judge against the LIVE balance — the number every screen shows — not
      // the stored component alone. Serialised, so two concurrent transfers
      // cannot both spend the same money.
      const locked = await tx.$queryRaw`
        SELECT id, name, balance FROM payment_accounts
        WHERE id IN (${from_id}::uuid, ${to_id}::uuid) AND business_id = ${req.user.business_id}::uuid
        FOR UPDATE`;
      const from = locked.find((r) => r.id === from_id);
      const to = locked.find((r) => r.id === to_id);
      if (!from || !to) throw paBad('Account not found', 404);
      const sums = await paPaymentSums(req.user.business_id);
      const live = paRound(Number(from.balance) + (sums.get(from_id) || 0));
      if (live < amount) throw paBad(`Insufficient balance — ${from.name} holds ${live.toFixed(2)}.`);
      await tx.paymentAccount.update({ where: { id: from_id }, data: { balance: { decrement: amount } } });
      await tx.paymentAccount.update({ where: { id: to_id }, data: { balance: { increment: amount } } });
      await tx.paymentAccountTransaction.create({ data: { businessId: req.user.business_id, accountId: from_id, type: 'transfer_out', amount, note: `To ${to.name}`, createdById: req.user.id } });
      await tx.paymentAccountTransaction.create({ data: { businessId: req.user.business_id, accountId: to_id, type: 'transfer_in', amount, note: `From ${from.name}`, createdById: req.user.id } });
    });
    res.json({ message: 'Transfer complete.' });
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/:id/deposit', auth, requireRole('owner', 'manager'), validate(AccountDepositSchema), async (req, res, next) => {
  try {
    if (!PA_UUID_RE.test(req.params.id)) return res.status(404).json({ title: 'Not found', status: 404 });
    const acc = await prisma.paymentAccount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!acc) return res.status(404).json({ title: 'Not found', status: 404 });
    const [updated] = await prisma.$transaction([
      prisma.paymentAccount.update({ where: { id: req.params.id }, data: { balance: { increment: req.body.amount } } }),
      prisma.paymentAccountTransaction.create({ data: { businessId: req.user.business_id, accountId: acc.id, type: 'deposit', amount: req.body.amount, note: req.body.note || null, createdById: req.user.id } }),
    ]);
    res.json(updated);
  } catch (err) { next(err); }
});

paymentAccountsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    if (!PA_UUID_RE.test(req.params.id)) return res.status(404).json({ title: 'Not found', status: 404 });
    const acc = await prisma.paymentAccount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!acc) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.paymentAccount.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Account closed.' });
  } catch (err) { next(err); }
});

// ── Account types (one level of nesting) ─────────────────────────────────────
paymentAccountsRouter.get('/types', auth, async (req, res, next) => {
  try {
    const types = await prisma.paymentAccountType.findMany({
      where: { businessId: req.user.business_id },
      include: { parent: { select: { id: true, name: true } }, _count: { select: { children: true, accounts: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ types });
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/types', auth, requireRole('owner', 'manager'), validate(PaymentAccountTypeSchema), async (req, res, next) => {
  try {
    if (req.body.parent_id) {
      const parent = await prisma.paymentAccountType.findFirst({ where: { id: req.body.parent_id, businessId: req.user.business_id }, select: { parentId: true } });
      if (!parent) return res.status(404).json({ title: 'Parent account type not found.', status: 404 });
      if (parent.parentId) return res.status(400).json({ title: 'Account types nest one level only.', status: 400 });
    }
    const clash = await prisma.paymentAccountType.findFirst({ where: { businessId: req.user.business_id, name: { equals: req.body.name, mode: 'insensitive' } }, select: { id: true } });
    if (clash) return res.status(400).json({ title: `Account type "${req.body.name}" already exists.`, status: 400 });
    const type = await prisma.paymentAccountType.create({
      data: { businessId: req.user.business_id, name: req.body.name, parentId: req.body.parent_id || null },
    });
    res.status(201).json(type);
  } catch (err) { next(err); }
});

paymentAccountsRouter.put('/types/:id', auth, requireRole('owner', 'manager'), validate(PaymentAccountTypeSchema), async (req, res, next) => {
  try {
    if (!PA_UUID_RE.test(req.params.id)) return res.status(404).json({ title: 'Not found', status: 404 });
    const t = await prisma.paymentAccountType.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!t) return res.status(404).json({ title: 'Not found', status: 404 });
    if (req.body.parent_id) {
      if (req.body.parent_id === t.id) return res.status(400).json({ title: 'A type cannot be its own parent.', status: 400 });
      const parent = await prisma.paymentAccountType.findFirst({ where: { id: req.body.parent_id, businessId: req.user.business_id }, select: { parentId: true } });
      if (!parent) return res.status(404).json({ title: 'Parent account type not found.', status: 404 });
      if (parent.parentId) return res.status(400).json({ title: 'Account types nest one level only.', status: 400 });
      const kids = await prisma.paymentAccountType.count({ where: { parentId: t.id } });
      if (kids > 0) return res.status(400).json({ title: 'This type has sub-types — move them first.', status: 400 });
    }
    const updated = await prisma.paymentAccountType.update({ where: { id: t.id }, data: { name: req.body.name, parentId: req.body.parent_id || null } });
    res.json(updated);
  } catch (err) { next(err); }
});

paymentAccountsRouter.delete('/types/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    if (!PA_UUID_RE.test(req.params.id)) return res.status(404).json({ title: 'Not found', status: 404 });
    const t = await prisma.paymentAccountType.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!t) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.$transaction([
      prisma.paymentAccountType.updateMany({ where: { parentId: t.id }, data: { parentId: null } }),
      prisma.paymentAccount.updateMany({ where: { accountTypeId: t.id }, data: { accountTypeId: null } }),
      prisma.paymentAccountType.delete({ where: { id: t.id } }),
    ]);
    res.json({ message: 'Account type deleted.' });
  } catch (err) { next(err); }
});

// ── Payment Account Report — every payment, linkable to an account ───────────
paymentAccountsRouter.get('/report', auth, async (req, res, next) => {
  try {
    const { account_id, from, to } = req.query;
    const bizId = req.user.business_id;
    const dateWhere = {};
    if (from && !Number.isNaN(Date.parse(from))) dateWhere.gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) dateWhere.lte = new Date(new Date(to).setDate(new Date(to).getDate() + 1));
    // account filter: 'none' = unlinked only; a uuid = that account; else all.
    const accFilter = account_id === 'none' ? { paymentAccountId: null }
      : account_id && PA_UUID_RE.test(account_id) ? { paymentAccountId: account_id } : {};

    const dCond = Object.keys(dateWhere).length ? dateWhere : undefined;
    const CAP = 500;
    const [sales, expenses, purchases, refunds] = await Promise.all([
      prisma.salePayment.findMany({
        where: { businessId: bizId, status: 'completed', amount: { gt: 0 }, ...accFilter, ...paDateCond('paidOn', dCond) },
        include: { sale: { select: { saleNumber: true, customer: { select: { name: true } } } }, paymentAccount: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' }, take: CAP,
      }),
      prisma.expensePayment.findMany({
        where: { businessId: bizId, ...accFilter, ...paDateCond('paidOn', dCond) },
        include: { expense: { select: { expenseNumber: true, title: true, paymentTo: true, isRefund: true } }, paymentAccount: { select: { id: true, name: true } } },
        orderBy: { paidOn: 'desc' }, take: CAP,
      }),
      prisma.pOPayment.findMany({
        where: { purchaseOrder: { businessId: bizId }, ...accFilter, ...paDateCond('paidAt', dCond) },
        include: { purchaseOrder: { select: { poNumber: true, supplier: { select: { name: true } } } }, paymentAccount: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' }, take: CAP,
      }),
      prisma.refund.findMany({
        where: { businessId: bizId, ...accFilter, ...(dCond && { createdAt: dCond }) },
        include: { sale: { select: { saleNumber: true, customer: { select: { name: true } } } }, paymentAccount: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' }, take: CAP,
      }),
    ]);
    const truncated = [sales, expenses, purchases, refunds].some((l) => l.length === CAP);

    const rows = [
      ...sales.map((p) => ({
        id: p.id, source: 'sell', date: p.paidOn || p.createdAt,
        ref: `SP-${String(p.id).slice(0, 8).toUpperCase()}`,
        doc_ref: p.sale?.saleNumber || '', amount: Number(p.amount), method: p.provider,
        account_id: p.paymentAccountId, account_name: p.paymentAccount?.name || '',
        description: `Customer: ${p.sale?.customer?.name || 'Walk-In Customer'}`,
      })),
      ...expenses.map((p) => ({
        id: p.id, source: 'expense', date: p.paidOn || p.createdAt,
        ref: `EP-${String(p.id).slice(0, 8).toUpperCase()}`,
        doc_ref: p.expense?.expenseNumber || '', amount: Number(p.amount), method: p.method,
        is_refund: !!p.expense?.isRefund,
        account_id: p.paymentAccountId, account_name: p.paymentAccount?.name || '',
        description: [p.expense?.isRefund && 'Expense refund', p.expense?.title, p.expense?.paymentTo && `Paid to: ${p.expense.paymentTo}`].filter(Boolean).join(' — ') || 'Expense',
      })),
      ...purchases.map((p) => ({
        id: p.id, source: 'purchase', date: p.paidAt || p.createdAt,
        ref: `PP-${String(p.id).slice(0, 8).toUpperCase()}`,
        doc_ref: p.purchaseOrder?.poNumber || '', amount: Number(p.amount), method: p.paymentMethod,
        account_id: p.paymentAccountId, account_name: p.paymentAccount?.name || '',
        description: `Supplier: ${p.purchaseOrder?.supplier?.name || '—'}`,
      })),
      ...refunds.map((r) => ({
        id: r.id, source: 'refund', date: r.createdAt,
        ref: `RF-${String(r.id).slice(0, 8).toUpperCase()}`,
        doc_ref: r.sale?.saleNumber || '', amount: Number(r.totalRefunded), method: r.refundMethod,
        account_id: r.paymentAccountId, account_name: r.paymentAccount?.name || '',
        description: `Refund — Customer: ${r.sale?.customer?.name || 'Walk-In Customer'}`,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 1000);

    res.json({ rows, truncated, unlinked_count: await paUnlinkedCount(bizId) });
  } catch (err) { next(err); }
});

// ── Balance Sheet / Trial Balance / Cash Flow ────────────────────────────────
/** The reference's simplified statement numbers, one query set for both views. */
async function paStatement(businessId, { locationId, date } = {}) {
  // Exclusive upper bound (lt next-midnight): a date-typed orderDate at the
  // NEXT day's midnight must not slip in.
  const until = date && !Number.isNaN(Date.parse(date))
    ? new Date(new Date(date).setDate(new Date(date).getDate() + 1)) : undefined;
  const [supplier, customer, stock, manualAfter] = await Promise.all([
    prisma.purchaseOrder.aggregate({
      where: {
        businessId, status: { in: ['received', 'partial'] },
        ...(locationId && { locationId }),
        ...(until && { orderDate: { lt: until } }),
      },
      _sum: { totalAmount: true, amountPaid: true },
    }),
    // Dues are LIVE values on documents dated in range. Fully-refunded sales
    // owe nothing and stay out of the due sum.
    prisma.sale.aggregate({
      where: {
        businessId, status: { in: ['completed', 'partially_refunded'] },
        ...(locationId && { locationId }),
        ...(until && { saleDate: { lt: until } }),
      },
      _sum: { amountDue: true },
    }),
    // Closing stock is the LIVE layer valuation — layers cannot be rewound to a
    // past date, so the date filter applies to dues and account movements only.
    locationId
      ? prisma.$queryRaw`
          SELECT COALESCE(ROUND(SUM(cl.quantity_remaining * cl.unit_cost)::numeric, 2), 0) AS value
          FROM cost_layers cl
          WHERE cl.business_id = ${businessId}::uuid AND cl.quantity_remaining > 0
            AND (cl.location_id = ${locationId}::uuid OR cl.location_id IS NULL)`
      : prisma.$queryRaw`
          SELECT COALESCE(ROUND(SUM(cl.quantity_remaining * cl.unit_cost)::numeric, 2), 0) AS value
          FROM cost_layers cl
          WHERE cl.business_id = ${businessId}::uuid AND cl.quantity_remaining > 0`,
    // Rewind the stored balance too: manual deposits/transfers AFTER the as-of
    // date must come back off, or the account column mixes time periods.
    until
      ? prisma.paymentAccountTransaction.groupBy({
          by: ['accountId', 'type'],
          where: { businessId, createdAt: { gte: until } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
  ]);
  const sums = await paPaymentSums(businessId, { before: until });
  const rewind = new Map();
  for (const r of manualAfter) {
    const sign = r.type === 'transfer_out' || r.type === 'withdrawal' ? 1 : -1; // undo
    rewind.set(r.accountId, paRound((rewind.get(r.accountId) || 0) + sign * Number(r._sum.amount || 0)));
  }
  const accounts = await prisma.paymentAccount.findMany({
    where: { businessId, isActive: true },
    select: { id: true, name: true, balance: true },
    orderBy: { createdAt: 'asc' },
  });
  return {
    supplier_due: paRound(Number(supplier._sum.totalAmount || 0) - Number(supplier._sum.amountPaid || 0)),
    customer_due: paRound(Number(customer._sum.amountDue || 0)),
    closing_stock: Number(stock[0]?.value || 0),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, balance: paRound(Number(a.balance) + (rewind.get(a.id) || 0) + (sums.get(a.id) || 0)) })),
  };
}

paymentAccountsRouter.get('/balance-sheet', auth, async (req, res, next) => {
  try {
    const { location_id, date } = req.query;
    const st = await paStatement(req.user.business_id, {
      locationId: location_id && PA_UUID_RE.test(location_id) ? location_id : undefined, date,
    });
    const accountTotal = paRound(st.accounts.reduce((s, a) => s + a.balance, 0));
    res.json({
      liabilities: { supplier_due: st.supplier_due, total: st.supplier_due },
      assets: {
        customer_due: st.customer_due, closing_stock: st.closing_stock,
        accounts: st.accounts, account_total: accountTotal,
        total: paRound(st.customer_due + st.closing_stock + accountTotal),
      },
    });
  } catch (err) { next(err); }
});

paymentAccountsRouter.get('/trial-balance', auth, async (req, res, next) => {
  try {
    const { location_id, date } = req.query;
    const st = await paStatement(req.user.business_id, {
      locationId: location_id && PA_UUID_RE.test(location_id) ? location_id : undefined, date,
    });
    const accountTotal = paRound(st.accounts.reduce((s, a) => s + a.balance, 0));
    res.json({
      rows: [
        { label: 'Supplier Due', debit: 0, credit: st.supplier_due },
        { label: 'Customer Due', debit: st.customer_due, credit: 0 },
        ...st.accounts.map((a) => ({
          label: a.name,
          debit: a.balance >= 0 ? a.balance : 0,
          credit: a.balance < 0 ? -a.balance : 0,
        })),
      ],
      totals: {
        debit: paRound(st.customer_due + st.accounts.reduce((s, a) => s + (a.balance > 0 ? a.balance : 0), 0)),
        credit: paRound(st.supplier_due + st.accounts.reduce((s, a) => s + (a.balance < 0 ? -a.balance : 0), 0)),
      },
    });
  } catch (err) { next(err); }
});

paymentAccountsRouter.get('/cash-flow', auth, async (req, res, next) => {
  try {
    const { account_id, from, to, type } = req.query;
    const bizId = req.user.business_id;
    const dateWhere = {};
    const fromDate = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : undefined;
    if (fromDate) dateWhere.gte = fromDate;
    if (to && !Number.isNaN(Date.parse(to))) dateWhere.lte = new Date(new Date(to).setDate(new Date(to).getDate() + 1));
    const dCond = Object.keys(dateWhere).length ? dateWhere : undefined;
    const oneAccount = account_id && PA_UUID_RE.test(account_id) ? account_id : undefined;
    const accFilter = oneAccount ? { paymentAccountId: oneAccount } : { paymentAccountId: { not: null } };
    const accTxFilter = oneAccount ? { accountId: oneAccount } : {};
    const CAP = 500;

    const [sales, expenses, purchases, refunds, manual, accounts] = await Promise.all([
      prisma.salePayment.findMany({
        where: { businessId: bizId, status: 'completed', amount: { gt: 0 }, ...accFilter, ...paDateCond('paidOn', dCond) },
        include: { sale: { select: { saleNumber: true } }, paymentAccount: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }, take: CAP,
      }),
      prisma.expensePayment.findMany({
        where: { businessId: bizId, ...accFilter, ...paDateCond('paidOn', dCond) },
        include: { expense: { select: { expenseNumber: true, title: true, isRefund: true } }, paymentAccount: { select: { name: true } } },
        orderBy: { paidOn: 'desc' }, take: CAP,
      }),
      prisma.pOPayment.findMany({
        where: { purchaseOrder: { businessId: bizId }, ...accFilter, ...paDateCond('paidAt', dCond) },
        include: { purchaseOrder: { select: { poNumber: true, supplier: { select: { name: true } } } }, paymentAccount: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }, take: CAP,
      }),
      prisma.refund.findMany({
        where: { businessId: bizId, ...accFilter, ...(dCond && { createdAt: dCond }) },
        include: { sale: { select: { saleNumber: true } }, paymentAccount: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }, take: CAP,
      }),
      prisma.paymentAccountTransaction.findMany({
        where: { businessId: bizId, ...accTxFilter, ...(dCond && { createdAt: dCond }) },
        include: { account: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }, take: CAP,
      }),
      prisma.paymentAccount.findMany({ where: { businessId: bizId }, select: { id: true, name: true, balance: true } }),
    ]);
    const truncated = [sales, expenses, purchases, refunds, manual].some((l) => l.length === CAP);

    const MANUAL_LABEL = { deposit: 'Deposit', transfer_in: 'Transfer in', transfer_out: 'Transfer out', withdrawal: 'Withdrawal' };
    const rows = [
      ...sales.map((p) => ({
        date: p.paidOn || p.createdAt, account_id: p.paymentAccountId, account: p.paymentAccount?.name || '',
        description: `Sell payment — ${p.sale?.saleNumber || ''}`, method: p.provider,
        debit: Number(p.amount), credit: 0,
      })),
      ...expenses.map((p) => ({
        date: p.paidOn || p.createdAt, account_id: p.paymentAccountId, account: p.paymentAccount?.name || '',
        // A refund expense's payment is money coming BACK (its GL mirrors).
        description: `${p.expense?.isRefund ? 'Expense refund' : 'Expense payment'} — ${p.expense?.expenseNumber || ''}${p.expense?.title ? ` (${p.expense.title})` : ''}`,
        method: p.method,
        debit: p.expense?.isRefund ? Number(p.amount) : 0,
        credit: p.expense?.isRefund ? 0 : Number(p.amount),
      })),
      ...purchases.map((p) => ({
        date: p.paidAt || p.createdAt, account_id: p.paymentAccountId, account: p.paymentAccount?.name || '',
        description: `Purchase payment — ${p.purchaseOrder?.poNumber || ''} (${p.purchaseOrder?.supplier?.name || ''})`, method: p.paymentMethod,
        debit: 0, credit: Number(p.amount),
      })),
      ...refunds.map((r) => ({
        date: r.createdAt, account_id: r.paymentAccountId, account: r.paymentAccount?.name || '',
        description: `Refund — ${r.sale?.saleNumber || ''}`, method: r.refundMethod,
        debit: 0, credit: Number(r.totalRefunded),
      })),
      ...manual.map((t) => ({
        date: t.createdAt, account_id: t.accountId, account: t.account?.name || '',
        description: `${MANUAL_LABEL[t.type] || t.type}${t.note ? ` — ${t.note}` : ''}`, method: '',
        debit: t.type === 'transfer_out' || t.type === 'withdrawal' ? 0 : Number(t.amount),
        credit: t.type === 'transfer_out' || t.type === 'withdrawal' ? Number(t.amount) : 0,
      })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Seed each account with its balance JUST BEFORE the window: today's stored
    // balance rewound past the window's manual rows, plus payment flows before
    // the window. Replaying the window's rows then lands on today's number.
    const manualSince = fromDate
      ? await prisma.paymentAccountTransaction.groupBy({
          by: ['accountId', 'type'], where: { businessId: bizId, createdAt: { gte: fromDate } }, _sum: { amount: true },
        })
      : null;
    const seeds = new Map();
    if (fromDate) {
      const paymentsBefore = await paPaymentSums(bizId, { before: fromDate });
      for (const a of accounts) {
        let stored = Number(a.balance);
        for (const m of manualSince.filter((x) => x.accountId === a.id)) {
          const sign = m.type === 'transfer_out' || m.type === 'withdrawal' ? 1 : -1; // undo
          stored = paRound(stored + sign * Number(m._sum.amount || 0));
        }
        seeds.set(a.id, paRound(stored + (paymentsBefore.get(a.id) || 0)));
      }
    } else {
      // Whole history: seed with the opening component only (stored balance
      // minus every manual row, all of which are replayed below).
      const allManual = await prisma.paymentAccountTransaction.groupBy({
        by: ['accountId', 'type'], where: { businessId: bizId }, _sum: { amount: true },
      });
      for (const a of accounts) {
        let stored = Number(a.balance);
        for (const m of allManual.filter((x) => x.accountId === a.id)) {
          const sign = m.type === 'transfer_out' || m.type === 'withdrawal' ? 1 : -1;
          stored = paRound(stored + sign * Number(m._sum.amount || 0));
        }
        seeds.set(a.id, stored);
      }
    }

    // Running balances over EVERYTHING in the window; the type filter below
    // only chooses which rows are DISPLAYED — hiding rows must not change math.
    const perAccount = new Map();
    let total = 0;
    for (const s of seeds.values()) total = paRound(total + s);
    for (const r of rows) {
      const cur = perAccount.has(r.account_id) ? perAccount.get(r.account_id) : (seeds.get(r.account_id) || 0);
      const nextBal = paRound(cur + r.debit - r.credit);
      perAccount.set(r.account_id, nextBal);
      r.account_balance = nextBal;
      total = paRound(total + r.debit - r.credit);
      r.total_balance = total;
    }

    const shown = type === 'debit' ? rows.filter((r) => r.debit > 0)
      : type === 'credit' ? rows.filter((r) => r.credit > 0) : rows;

    res.json({
      rows: shown,
      truncated,
      totals: { debit: paRound(shown.reduce((s, r) => s + r.debit, 0)), credit: paRound(shown.reduce((s, r) => s + r.credit, 0)) },
    });
  } catch (err) { next(err); }
});

module.exports = { expensesRouter, expenseCategoriesRouter, paymentAccountsRouter };
