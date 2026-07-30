/**
 * HRM — employees, the summary tiles and the profile drawer.
 */
const {
  EmployeeSchema, EmployeeUpdateSchema, auth, computeBalances, decorateAtt, empShiftMap,
  employeeSales, ensureLeaveTypeDefaults, ensureOrgDefaults, express, getBusinessSettings,
  loadSettings, onLeaveOn, prisma, requireRole, serializeAdvance, serializeEmployee,
  serializeLeave, serializePayroll, tzParts, validate,
} = require('./_shared');

const router = express.Router();

router.get('/summary', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const settings = await loadSettings(businessId);
    const today = new Date(tzParts(settings.timezone).date);
    const [employees, onLeave, present, pendingLeave, openTodos, payroll] = await Promise.all([
      prisma.employee.count({ where: { businessId } }),
      onLeaveOn(businessId, today).then(s => s.size),
      prisma.attendance.count({ where: { businessId, date: today, clockIn: { not: null } } }),
      prisma.leave.count({ where: { businessId, status: 'pending' } }),
      prisma.hrTodo.count({ where: { businessId, status: 'pending' } }),
      prisma.payroll.aggregate({ where: { businessId, status: 'paid' }, _sum: { net: true } }),
    ]);
    res.json({ employees, present, on_leave: onLeave, pending_leave: pendingLeave, payroll: parseFloat(payroll._sum.net || 0), open_todos: openTodos });
  } catch (err) { next(err); }
});

router.get('/employee', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const settings = await loadSettings(businessId);
    const [employees, onLeave] = await Promise.all([
      prisma.employee.findMany({
        where: { businessId },
        include: { location: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      onLeaveOn(businessId, new Date(tzParts(settings.timezone).date)),
    ]);
    res.json(employees.map(e => ({ ...serializeEmployee(e), on_leave: onLeave.has(e.id) })));
  } catch (err) { next(err); }
});

router.get('/employee/:id', auth, async (req, res, next) => {
  try {
    const e = await prisma.employee.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: { location: { select: { name: true } }, user: { select: { name: true } } },
    });
    if (!e) return res.status(404).json({ title: 'Not found', status: 404 });
    const businessId = req.user.business_id;
    const pct = parseFloat(e.commissionPercent || 0);
    const settings = await loadSettings(businessId);
    const nowHM = tzParts(settings.timezone).hm;
    const fyStart = (await getBusinessSettings(businessId)).fy_start_month;
    await ensureLeaveTypeDefaults(businessId);
    const [attendance, leaves, payroll, advances, types, overrides, sales] = await Promise.all([
      prisma.attendance.findMany({ where: { businessId, employeeId: e.id }, orderBy: { date: 'desc' }, take: 30 }),
      prisma.leave.findMany({ where: { businessId, employeeId: e.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.payroll.findMany({ where: { businessId, employeeId: e.id }, orderBy: { month: 'desc' }, take: 24, include: { employee: { select: { name: true } } } }),
      prisma.hrAdvance.findMany({ where: { businessId, employeeId: e.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.leaveType.findMany({ where: { businessId } }),
      prisma.employeeLeaveOverride.findMany({ where: { employeeId: e.id } }),
      employeeSales(businessId, e.userId, pct),
    ]);
    const overrideMap = Object.fromEntries(overrides.map(o => [o.type, o.days]));
    res.json({
      ...serializeEmployee(e),
      user_name: e.user?.name || null,
      shift: (await empShiftMap(businessId))[e.id] || null,
      attendance: attendance.map(a => decorateAtt(a, e.name, nowHM)),
      leaves: leaves.map(l => serializeLeave(l, e.name)),
      payroll: payroll.map(serializePayroll),
      advances: advances.map(serializeAdvance),
      outstanding_advance: +advances.reduce((s, a) => s + parseFloat(a.outstanding || 0), 0).toFixed(2),
      leave_balance: computeBalances(e, types, leaves, overrideMap, fyStart),
      sales,
    });
  } catch (err) { next(err); }
});

router.get('/meta', auth, async (req, res, next) => {
  try {
    await ensureOrgDefaults(req.user.business_id);
    const units = await prisma.orgUnit.findMany({ where: { businessId: req.user.business_id }, orderBy: { name: 'asc' } });
    res.json({
      departments: units.filter(u => u.kind === 'department').map(u => u.name),
      designations: units.filter(u => u.kind === 'designation').map(u => u.name),
    });
  } catch (err) { next(err); }
});

router.post('/employee', auth, requireRole('owner', 'manager'), validate(EmployeeSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const created = await prisma.employee.create({
      data: {
        businessId: req.user.business_id, name: b.name, email: b.email || null,
        department: b.department || null, designation: b.designation || null,
        locationId: b.location_id || null, salary: b.salary || 0,
        joinedAt: b.joined ? new Date(b.joined) : null,
        userId: b.user_id || null, commissionPercent: b.commission_percent ?? 0,
      },
      include: { location: { select: { name: true } } },
    });
    res.status(201).json(serializeEmployee(created));
  } catch (err) { next(err); }
});

router.put('/employee/:id', auth, requireRole('owner', 'manager'), validate(EmployeeUpdateSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const e = await prisma.employee.findFirst({ where: { id: req.params.id, businessId }, select: { id: true } });
    if (!e) return res.status(404).json({ title: 'Not found', status: 404 });
    const updated = await prisma.employee.update({
      where: { id: req.params.id },
      data: {
        ...(b.name        !== undefined && { name: b.name }),
        ...(b.email       !== undefined && { email: b.email || null }),
        ...(b.department  !== undefined && { department: b.department || null }),
        ...(b.designation !== undefined && { designation: b.designation || null }),
        ...(b.location_id !== undefined && { locationId: b.location_id || null }),
        ...(b.salary      !== undefined && { salary: b.salary }),
        ...(b.joined      !== undefined && { joinedAt: b.joined ? new Date(b.joined) : null }),
        ...(b.user_id     !== undefined && { userId: b.user_id || null }),
        ...(b.commission_percent !== undefined && { commissionPercent: b.commission_percent }),
        ...(b.status      !== undefined && { status: b.status }),
      },
      include: { location: { select: { name: true } } },
    });
    res.json(serializeEmployee(updated));
  } catch (err) { next(err); }
});

router.delete('/employee/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const e = await prisma.employee.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!e) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.employee.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
