/**
 * HRM — leave types, entitlement balances and leave requests.
 */
const {
  LeaveOverrideSchema, LeaveSchema, LeaveStatusSchema, LeaveTypeSchema, LeaveTypeUpdateSchema,
  PL_UUID, auth, computeBalances, ensureLeaveTypeDefaults, express, getBusinessSettings,
  holidayDays, loadSettings, nextRef, prisma, requireRole, serializeLeave, validate,
} = require('./_shared');

const router = express.Router();

router.get('/leave-type', auth, async (req, res, next) => {
  try {
    await ensureLeaveTypeDefaults(req.user.business_id);
    const types = await prisma.leaveType.findMany({ where: { businessId: req.user.business_id }, orderBy: { name: 'asc' } });
    res.json(types.map(t => ({ id: t.id, name: t.name, default_days: t.defaultDays, count_interval: t.countInterval, accrues: t.accrues, paid: t.paid })));
  } catch (err) { next(err); }
});

router.post('/leave-type', auth, requireRole('owner', 'manager'), validate(LeaveTypeSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const clash = await prisma.leaveType.findUnique({
      where: { businessId_name: { businessId, name: req.body.name } }, select: { id: true },
    });
    if (clash) {
      return res.status(409).json({
        title: `A leave type called "${req.body.name}" already exists. Edit it instead.`,
        status: 409, code: 'LEAVE_TYPE_EXISTS', leave_type_id: clash.id,
      });
    }
    const t = await prisma.leaveType.create({
      data: { businessId, name: req.body.name, defaultDays: req.body.default_days, countInterval: req.body.count_interval, accrues: req.body.accrues, paid: req.body.paid },
    });
    res.status(201).json({ id: t.id, name: t.name, default_days: t.defaultDays, count_interval: t.countInterval, accrues: t.accrues, paid: t.paid });
  } catch (err) { next(err); }
});

router.put('/leave-type/:id', auth, requireRole('owner', 'manager'), validate(LeaveTypeUpdateSchema), async (req, res, next) => {
  try {
    const existing = await prisma.leaveType.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const { default_days, accrues, paid, count_interval } = req.body;
    const t = await prisma.leaveType.update({ where: { id: req.params.id }, data: {
      ...(default_days !== undefined && { defaultDays: default_days }),
      ...(count_interval !== undefined && { countInterval: count_interval }),
      ...(accrues !== undefined && { accrues }), ...(paid !== undefined && { paid }),
    }});
    res.json({ id: t.id, name: t.name, default_days: t.defaultDays, count_interval: t.countInterval, accrues: t.accrues, paid: t.paid });
  } catch (err) { next(err); }
});

router.delete('/leave-type/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const t = await prisma.leaveType.findFirst({ where: { id: req.params.id, businessId } });
    if (!t) return res.status(404).json({ title: 'Not found', status: 404 });
    const used = await prisma.leave.count({ where: { businessId, type: t.name } });
    if (used > 0) {
      return res.status(422).json({
        title: `In use by ${used} leave request(s). Deleting it would drop them from every balance.`,
        status: 422, code: 'LEAVE_TYPE_IN_USE', used,
      });
    }
    // Overrides are keyed by type NAME, so they would otherwise dangle and
    // silently reattach if a type of the same name were recreated.
    await prisma.$transaction([
      prisma.employeeLeaveOverride.deleteMany({ where: { businessId, type: t.name } }),
      prisma.leaveType.delete({ where: { id: req.params.id } }),
    ]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.get('/leave', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const q = req.query;
    if (q.employee_id && !PL_UUID.test(String(q.employee_id))) {
      return res.status(400).json({ title: 'employee_id must be a UUID.', status: 400 });
    }
    if (q.status && !['pending', 'approved', 'rejected'].includes(String(q.status))) {
      return res.status(400).json({ title: 'status must be pending, approved or rejected.', status: 400 });
    }
    // Shape alone is not enough — 2026-13-40 matches the pattern but is not a
    // real day, and an Invalid Date reaches Prisma as a 500.
    const day = (v) => {
      const str = String(v);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
      const d = new Date(str);
      return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== str ? null : d;
    };
    const fromDay = q.from ? day(q.from) : null;
    const toDay = q.to ? day(q.to) : null;
    for (const [k, v, parsed] of [['from', q.from, fromDay], ['to', q.to, toDay]]) {
      if (v && !parsed) return res.status(400).json({ title: `${k} must be a real YYYY-MM-DD date.`, status: 400 });
    }
    // A leave overlaps the window if it starts before the end and ends after
    // the start — not merely if its start falls inside it.
    const overlap = {};
    if (toDay) overlap.fromDate = { lte: toDay };
    if (fromDay) overlap.toDate = { gte: fromDay };
    const take = Math.min(Math.max(parseInt(q.limit, 10) || 500, 1), 2000);
    const leaves = await prisma.leave.findMany({
      where: {
        businessId,
        ...(q.employee_id && { employeeId: String(q.employee_id) }),
        ...(q.status && { status: String(q.status) }),
        ...(q.type && { type: String(q.type) }),
        ...overlap,
      },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    res.json(leaves.map(l => serializeLeave(l, l.employee?.name || '—')));
  } catch (err) { next(err); }
});

router.post('/leave', auth, validate(LeaveSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const emp = await prisma.employee.findFirst({ where: { id: req.body.employee_id, businessId }, select: { id: true, name: true, joinedAt: true } });
    if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    await ensureLeaveTypeDefaults(businessId);
    const [types, leaves, overrides] = await Promise.all([
      prisma.leaveType.findMany({ where: { businessId } }),
      prisma.leave.findMany({ where: { businessId, employeeId: emp.id } }),
      prisma.employeeLeaveOverride.findMany({ where: { employeeId: emp.id } }),
    ]);
    const overrideMap = Object.fromEntries(overrides.map(o => [o.type, o.days]));
    const fyStart = (await getBusinessSettings(businessId)).fy_start_month;
    const bal = computeBalances(emp, types, leaves, overrideMap, fyStart).find(b => b.type === req.body.type);
    if (!bal) {
      return res.status(422).json({
        title: `"${req.body.type}" is not one of this business's leave types.`,
        status: 422, code: 'UNKNOWN_LEAVE_TYPE',
        leave_types: types.map(t => t.name),
      });
    }
    const fromDate = new Date(req.body.from), toDate = new Date(req.body.to);
    // Days must fit the period asked for, or a one-day request could burn a
    // month of entitlement. A company holiday inside the period is not a leave
    // day, so it does not count towards the cap either.
    const calendarDays = Math.round((toDate - fromDate) / 86400000) + 1;
    const empLoc = await prisma.employee.findUnique({ where: { id: emp.id }, select: { locationId: true } });
    const offDays = await holidayDays(businessId, fromDate, toDate, empLoc?.locationId ?? null);
    const workingDays = Math.max(0, calendarDays - offDays.size);
    if (req.body.days > workingDays) {
      return res.status(422).json({
        title: offDays.size > 0
          ? `${req.body.days} day(s) does not fit ${req.body.from} to ${req.body.to} — ${calendarDays} day(s) less ${offDays.size} holiday(s) leaves ${workingDays}.`
          : `${req.body.days} day(s) does not fit ${req.body.from} to ${req.body.to} (${calendarDays} day(s)).`,
        status: 422, code: 'DAYS_EXCEED_PERIOD',
        calendar_days: calendarDays, holidays: offDays.size, working_days: workingDays,
      });
    }
    if (bal.paid && req.body.days > bal.balance) {
      return res.status(422).json({ title: `Only ${bal.balance} ${req.body.type} day(s) available`, status: 422 });
    }
    const lset = await loadSettings(businessId);
    const created = await prisma.leave.create({ data: {
      businessId, employeeId: emp.id, type: req.body.type,
      referenceNo: await nextRef(prisma.leave, businessId, lset.leaveRefPrefix),
      fromDate, toDate,
      days: req.body.days, reason: req.body.reason || null,
    }});
    res.status(201).json(serializeLeave(created, emp.name));
  } catch (err) { next(err); }
});

// Edit a pending request. Once it is approved the days are committed against
// the entitlement, so changing it then would silently move someone's balance —
// reject it back to pending first.
router.put('/leave/:id/details', auth, requireRole('owner', 'manager'), validate(LeaveSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const leave = await prisma.leave.findFirst({ where: { id: req.params.id, businessId }, include: { employee: { select: { name: true } } } });
    if (!leave) return res.status(404).json({ title: 'Not found', status: 404 });
    if (leave.status === 'approved') {
      return res.status(422).json({ title: 'An approved request cannot be edited — reject it first.', status: 422, code: 'LEAVE_APPROVED' });
    }
    const emp = await prisma.employee.findFirst({ where: { id: b.employee_id, businessId }, select: { id: true, name: true, joinedAt: true, locationId: true } });
    if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    await ensureLeaveTypeDefaults(businessId);
    const types = await prisma.leaveType.findMany({ where: { businessId } });
    if (!types.some(t => t.name === b.type)) {
      return res.status(422).json({ title: `"${b.type}" is not one of this business's leave types.`, status: 422, code: 'UNKNOWN_LEAVE_TYPE' });
    }
    const fromDate = new Date(b.from), toDate = new Date(b.to);
    const calendarDays = Math.round((toDate - fromDate) / 86400000) + 1;
    const offDays = await holidayDays(businessId, fromDate, toDate, emp.locationId ?? null);
    const workingDays = Math.max(0, calendarDays - offDays.size);
    if (b.days > workingDays) {
      return res.status(422).json({
        title: `${b.days} day(s) does not fit ${b.from} to ${b.to} (${workingDays} working day(s)).`,
        status: 422, code: 'DAYS_EXCEED_PERIOD',
      });
    }
    const updated = await prisma.leave.update({
      where: { id: leave.id },
      data: { employeeId: emp.id, type: b.type, fromDate, toDate, days: b.days, reason: b.reason || null },
    });
    res.json(serializeLeave(updated, emp.name));
  } catch (err) { next(err); }
});

// Withdraw a request. An approved one has already moved the balance, so it must
// be rejected first rather than vanishing from the record.
router.delete('/leave/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const leave = await prisma.leave.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true, status: true } });
    if (!leave) return res.status(404).json({ title: 'Not found', status: 404 });
    if (leave.status === 'approved') {
      return res.status(422).json({ title: 'An approved request cannot be deleted — reject it first.', status: 422, code: 'LEAVE_APPROVED' });
    }
    await prisma.leave.delete({ where: { id: leave.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.put('/leave/:id', auth, requireRole('owner', 'manager'), validate(LeaveStatusSchema), async (req, res, next) => {
  try {
    const leave = await prisma.leave.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, include: { employee: { select: { name: true } } } });
    if (!leave) return res.status(404).json({ title: 'Not found', status: 404 });
    const { status } = req.body;
    const updated = await prisma.leave.update({
      where: { id: req.params.id },
      data: { status, approvedBy: status === 'approved' ? (req.body.approved_by || req.user.name || 'Manager') : null },
    });
    res.json(serializeLeave(updated, leave.employee?.name || '—'));
  } catch (err) { next(err); }
});

router.get('/leave-balance', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    await ensureLeaveTypeDefaults(businessId);
    const fyStart = (await getBusinessSettings(businessId)).fy_start_month;
    const [emps, types, leaves, overrides] = await Promise.all([
      prisma.employee.findMany({ where: { businessId }, select: { id: true, name: true, joinedAt: true } }),
      prisma.leaveType.findMany({ where: { businessId } }),
      // Only the statuses that move a balance — rejected rows are dead weight.
      prisma.leave.findMany({ where: { businessId, status: { in: ['approved', 'pending'] } } }),
      prisma.employeeLeaveOverride.findMany({ where: { businessId } }),
    ]);
    const res2 = emps.map(emp => {
      const ovMap = Object.fromEntries(overrides.filter(o => o.employeeId === emp.id).map(o => [o.type, o.days]));
      return { employee_id: emp.id, employee_name: emp.name, balances: computeBalances(emp, types, leaves.filter(l => l.employeeId === emp.id), ovMap, fyStart) };
    });
    res.json(res2);
  } catch (err) { next(err); }
});

router.get('/leave-balance/:empId', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    await ensureLeaveTypeDefaults(businessId);
    const emp = await prisma.employee.findFirst({ where: { id: req.params.empId, businessId }, select: { id: true, name: true, joinedAt: true } });
    if (!emp) return res.status(404).json({ title: 'Not found', status: 404 });
    const fyStart = (await getBusinessSettings(businessId)).fy_start_month;
    const [types, leaves, overrides] = await Promise.all([
      prisma.leaveType.findMany({ where: { businessId } }),
      prisma.leave.findMany({ where: { businessId, employeeId: emp.id } }),
      prisma.employeeLeaveOverride.findMany({ where: { employeeId: emp.id } }),
    ]);
    const ovMap = Object.fromEntries(overrides.map(o => [o.type, o.days]));
    res.json(computeBalances(emp, types, leaves, ovMap, fyStart));
  } catch (err) { next(err); }
});

router.get('/leave-override/:empId', auth, async (req, res, next) => {
  try {
    const overrides = await prisma.employeeLeaveOverride.findMany({ where: { employeeId: req.params.empId, businessId: req.user.business_id } });
    res.json(Object.fromEntries(overrides.map(o => [o.type, o.days])));
  } catch (err) { next(err); }
});

router.put('/leave-override/:empId', auth, requireRole('owner', 'manager'), validate(LeaveOverrideSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const emp = await prisma.employee.findFirst({ where: { id: req.params.empId, businessId } });
    if (!emp) return res.status(404).json({ title: 'Not found', status: 404 });
    for (const [type, days] of Object.entries(req.body.overrides)) {
      if (days == null) {
        await prisma.employeeLeaveOverride.deleteMany({ where: { employeeId: emp.id, type } });
      } else {
        await prisma.employeeLeaveOverride.upsert({
          where: { employeeId_type: { employeeId: emp.id, type } },
          create: { businessId, employeeId: emp.id, type, days },
          update: { days },
        });
      }
    }
    res.json({ employee_id: emp.id, overrides: req.body.overrides });
  } catch (err) { next(err); }
});

module.exports = router;
