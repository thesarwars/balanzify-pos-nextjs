/**
 * HRM — salary advances and their recovery.
 */
const {
  HrAdvanceSchema, accounting, advanceInclude, auth, express, prisma, requireRole,
  serializeAdvance, serverDate, validate,
} = require('./_shared');

const router = express.Router();

router.get('/advance', auth, async (req, res, next) => {
  try {
    const advances = await prisma.hrAdvance.findMany({ where: { businessId: req.user.business_id }, include: advanceInclude, orderBy: { createdAt: 'desc' } });
    res.json(advances.map(serializeAdvance));
  } catch (err) { next(err); }
});

router.get('/advance/outstanding/:empId', auth, async (req, res, next) => {
  try {
    const agg = await prisma.hrAdvance.aggregate({ where: { businessId: req.user.business_id, employeeId: req.params.empId, status: 'outstanding' }, _sum: { outstanding: true } });
    res.json({ outstanding: parseFloat(agg._sum.outstanding || 0) });
  } catch (err) { next(err); }
});

router.post('/advance', auth, requireRole('owner', 'manager'), validate(HrAdvanceSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const emp = await prisma.employee.findFirst({ where: { id: b.employee_id, businessId } });
    if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    const advance = await prisma.$transaction(async (tx) => {
      let method = 'cash';
      if (b.account_id) {
        const acc = await tx.paymentAccount.findFirst({ where: { id: b.account_id, businessId } });
        if (!acc) throw Object.assign(new Error('Account not found'), { status: 404 });
        method = String(acc.type || 'cash').toLowerCase().replace(/\s+/g, '_');
        await tx.paymentAccount.update({ where: { id: b.account_id }, data: { balance: { decrement: b.amount } } });
        // Visible in Cash Flow — a balance must never mutate without a trace.
        await tx.paymentAccountTransaction.create({
          data: { businessId, accountId: b.account_id, type: 'withdrawal', amount: b.amount, note: `Salary advance — ${emp.fullName || emp.name || ''}`.trim(), createdById: req.user.id },
        });
      }
      const adv = await tx.hrAdvance.create({
        data: { businessId, employeeId: emp.id, amount: b.amount, advanceDate: new Date(b.date || serverDate()), accountId: b.account_id || null, note: b.note || null, outstanding: b.amount },
        include: advanceInclude,
      });
      // GL: a salary advance is a receivable funded out of the chosen account.
      await accounting.postAdvance(tx, { businessId, amount: b.amount, method, sourceId: adv.id, createdById: req.user.id });
      return adv;
    });
    res.status(201).json(serializeAdvance(advance));
  } catch (err) { if (err.status === 404) return res.status(404).json({ title: err.message, status: 404 }); next(err); }
});

router.delete('/advance/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const a = await prisma.hrAdvance.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!a) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.hrAdvance.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
