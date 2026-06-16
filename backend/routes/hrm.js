/**
 * HRM routes — phase 1: employees, org units, settings, summary.
 * Mounted at /api/v1/hrm behind requireModule('hrm').
 */
const express = require('express');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { EmployeeSchema, OrgUnitSchema, HrmSettingsSchema, EmployeeShiftSchema } = require('../validation/schemas');

const router = express.Router();

const DEFAULT_DEPARTMENTS  = ['Sales', 'Inventory', 'Finance', 'Management', 'Kitchen'];
const DEFAULT_DESIGNATIONS = ['Cashier', 'Store Keeper', 'Accountant', 'Manager', 'Chef', 'Cleaner'];

// Seed a business's department/designation list on first use.
async function ensureOrgDefaults(businessId) {
  const count = await prisma.orgUnit.count({ where: { businessId } });
  if (count > 0) return;
  await prisma.orgUnit.createMany({
    data: [
      ...DEFAULT_DEPARTMENTS.map(name => ({ businessId, kind: 'department', name })),
      ...DEFAULT_DESIGNATIONS.map(name => ({ businessId, kind: 'designation', name })),
    ],
    skipDuplicates: true,
  });
}

function serializeEmployee(e) {
  return {
    id: e.id, name: e.name, email: e.email || '',
    department: e.department || '', designation: e.designation || '',
    location_id: e.locationId, location_name: e.location?.name || '—',
    salary: parseFloat(e.salary || 0),
    joined: e.joinedAt ? e.joinedAt.toISOString().slice(0, 10) : '',
    status: e.status, user_id: e.userId,
    commission_percent: parseFloat(e.commissionPercent || 0),
  };
}

async function employeeSales(businessId, userId, pct) {
  if (!userId) return { total_sale: 0, tx_count: 0, commission: 0, commission_percent: pct };
  const agg = await prisma.sale.aggregate({
    where: { businessId, cashierId: userId, status: 'completed' },
    _sum: { totalAmount: true }, _count: { id: true },
  });
  const total = parseFloat(agg._sum.totalAmount || 0);
  return { total_sale: total, tx_count: agg._count.id, commission: +(total * pct / 100).toFixed(2), commission_percent: pct };
}

// ── Summary ───────────────────────────────────────────────────────────────────
router.get('/summary', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const [employees, onLeave] = await Promise.all([
      prisma.employee.count({ where: { businessId } }),
      prisma.employee.count({ where: { businessId, status: 'on_leave' } }),
    ]);
    // present / pending_leave / payroll / open_todos arrive in later HRM phases.
    res.json({ employees, present: 0, on_leave: onLeave, pending_leave: 0, payroll: 0, open_todos: 0 });
  } catch (err) { next(err); }
});

// ── Employees ─────────────────────────────────────────────────────────────────
router.get('/employee', auth, async (req, res, next) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { businessId: req.user.business_id },
      include: { location: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(employees.map(serializeEmployee));
  } catch (err) { next(err); }
});

router.get('/employee/:id', auth, async (req, res, next) => {
  try {
    const e = await prisma.employee.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: { location: { select: { name: true } }, user: { select: { name: true } }, shift: true },
    });
    if (!e) return res.status(404).json({ title: 'Not found', status: 404 });
    const pct = parseFloat(e.commissionPercent || 0);
    res.json({
      ...serializeEmployee(e),
      user_name: e.user?.name || null,
      shift: e.shift ? { type: e.shift.type, start: e.shift.start, end: e.shift.end } : null,
      attendance: [], leaves: [], payroll: [], advances: [],   // populated in later phases
      outstanding_advance: 0, leave_balance: [],
      sales: await employeeSales(req.user.business_id, e.userId, pct),
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

router.delete('/employee/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const e = await prisma.employee.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!e) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.employee.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Org units (departments / designations) ──────────────────────────────────────
router.get('/org', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    await ensureOrgDefaults(businessId);
    const [units, emps] = await Promise.all([
      prisma.orgUnit.findMany({ where: { businessId }, orderBy: { name: 'asc' } }),
      prisma.employee.findMany({ where: { businessId }, select: { department: true, designation: true } }),
    ]);
    const count = (kind, name) => emps.filter(e => (kind === 'department' ? e.department : e.designation) === name).length;
    res.json({
      departments: units.filter(u => u.kind === 'department').map(u => ({ name: u.name, count: count('department', u.name) })),
      designations: units.filter(u => u.kind === 'designation').map(u => ({ name: u.name, count: count('designation', u.name) })),
    });
  } catch (err) { next(err); }
});

router.post('/org', auth, requireRole('owner', 'manager'), validate(OrgUnitSchema), async (req, res, next) => {
  try {
    await prisma.orgUnit.upsert({
      where: { businessId_kind_name: { businessId: req.user.business_id, kind: req.body.kind, name: req.body.name } },
      create: { businessId: req.user.business_id, kind: req.body.kind, name: req.body.name },
      update: {},
    });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/org', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const { kind, name } = req.query;
    if (!kind || !name) return res.status(400).json({ title: 'kind and name required', status: 400 });
    const field = kind === 'designation' ? 'designation' : 'department';
    const used = await prisma.employee.count({ where: { businessId: req.user.business_id, [field]: name } });
    if (used > 0) return res.status(422).json({ title: `In use by ${used} employee(s)`, status: 422 });
    await prisma.orgUnit.deleteMany({ where: { businessId: req.user.business_id, kind: String(kind), name: String(name) } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Settings ────────────────────────────────────────────────────────────────────
async function loadSettings(businessId) {
  let s = await prisma.hrmSettings.findUnique({ where: { businessId } });
  if (!s) s = await prisma.hrmSettings.create({ data: { businessId } });
  return s;
}
function serializeSettings(s, empShift) {
  return {
    work_start: s.workStart, grace_minutes: s.graceMinutes,
    standard_hours: parseFloat(s.standardHours), half_day_hours: parseFloat(s.halfDayHours),
    overtime_rate: parseFloat(s.overtimeRate), working_days: s.workingDays,
    late_deduction: parseFloat(s.lateDeduction), absent_deduction: s.absentDeduction,
    emp_shift: empShift,
    payslip: {
      show_attendance: s.showAttendance, show_overtime: s.showOvertime, show_leave: s.showLeave,
      show_advance: s.showAdvance, show_bonus: s.showBonus, show_incentive: s.showIncentive,
      show_deduction_breakdown: s.showDeductionBreakdown,
    },
  };
}
async function empShiftMap(businessId) {
  const shifts = await prisma.employeeShift.findMany({ where: { employee: { businessId } } });
  const map = {};
  shifts.forEach(sh => { map[sh.employeeId] = { type: sh.type, start: sh.start, end: sh.end }; });
  return map;
}

router.get('/settings', auth, async (req, res, next) => {
  try {
    const s = await loadSettings(req.user.business_id);
    res.json(serializeSettings(s, await empShiftMap(req.user.business_id)));
  } catch (err) { next(err); }
});

router.put('/settings', auth, requireRole('owner', 'manager'), validate(HrmSettingsSchema), async (req, res, next) => {
  try {
    await loadSettings(req.user.business_id);
    const { work_start, grace_minutes, standard_hours, half_day_hours } = req.body;
    const s = await prisma.hrmSettings.update({
      where: { businessId: req.user.business_id },
      data: {
        ...(work_start     !== undefined && { workStart: work_start }),
        ...(grace_minutes  !== undefined && { graceMinutes: grace_minutes }),
        ...(standard_hours !== undefined && { standardHours: standard_hours }),
        ...(half_day_hours !== undefined && { halfDayHours: half_day_hours }),
      },
    });
    res.json(serializeSettings(s, await empShiftMap(req.user.business_id)));
  } catch (err) { next(err); }
});

router.put('/employee/:id/shift', auth, requireRole('owner', 'manager'), validate(EmployeeShiftSchema), async (req, res, next) => {
  try {
    const emp = await prisma.employee.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!emp) return res.status(404).json({ title: 'Not found', status: 404 });
    const { type, start, end } = req.body;
    const sh = await prisma.employeeShift.upsert({
      where: { employeeId: req.params.id },
      create: { employeeId: req.params.id, type: type || 'fixed', start: start || '08:00', end: end || '16:00' },
      update: { ...(type && { type }), ...(start && { start }), ...(end && { end }) },
    });
    res.json({ employee_id: sh.employeeId, type: sh.type, start: sh.start, end: sh.end });
  } catch (err) { next(err); }
});

module.exports = router;
