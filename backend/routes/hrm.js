/**
 * HRM routes — phase 1: employees, org units, settings, summary.
 * Mounted at /api/v1/hrm behind requireModule('hrm').
 */
const express = require('express');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { EmployeeSchema, OrgUnitSchema, HrmSettingsSchema, EmployeeShiftSchema, AttendanceClockSchema } = require('../validation/schemas');

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
    const [employees, onLeave, present] = await Promise.all([
      prisma.employee.count({ where: { businessId } }),
      prisma.employee.count({ where: { businessId, status: 'on_leave' } }),
      prisma.attendance.count({ where: { businessId, date: new Date(serverDate()), clockIn: { not: null } } }),
    ]);
    // pending_leave / payroll / open_todos arrive in later HRM phases.
    res.json({ employees, present, on_leave: onLeave, pending_leave: 0, payroll: 0, open_todos: 0 });
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

// ── Attendance ──────────────────────────────────────────────────────────────────
const hm2min = (hm) => { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const pad2 = (n) => String(n).padStart(2, '0');
function serverNowHM() { const d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function serverDate() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
const hoursLabel = (h) => h > 0 ? `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m` : '—';

function decorateAtt(rec, empName) {
  const breaks = Array.isArray(rec.breaks) ? rec.breaks : [];
  let breakMin = 0, onBreak = false, openStart = null;
  for (const b of breaks) { if (b.end) breakMin += hm2min(b.end) - hm2min(b.start); else { onBreak = true; openStart = b.start; } }
  let hours = 0, status = rec.status;
  if (rec.clockIn && !rec.clockOut) {
    const end = onBreak ? openStart : serverNowHM();
    hours = Math.max(0, (hm2min(end) - hm2min(rec.clockIn) - breakMin) / 60);
    status = onBreak ? 'on break' : 'running';
  } else if (rec.clockIn && rec.clockOut) {
    hours = Math.max(0, (hm2min(rec.clockOut) - hm2min(rec.clockIn) - breakMin) / 60);
  }
  return {
    id: rec.id, employee_id: rec.employeeId, employee_name: empName,
    date: rec.date.toISOString().slice(0, 10),
    clock_in: rec.clockIn || '', clock_out: rec.clockOut || '',
    status, on_break: onBreak, break_min: breakMin,
    hours: +hours.toFixed(2), hours_label: hoursLabel(hours),
  };
}

async function clockStatusFor(businessId, employeeId, at) {
  const sh = await prisma.employeeShift.findUnique({ where: { employeeId } });
  if (sh && sh.type === 'flexible') return 'present';
  const s = await loadSettings(businessId);
  return hm2min(at) > hm2min(s.workStart) + s.graceMinutes ? 'late' : 'present';
}

router.get('/attendance', auth, async (req, res, next) => {
  try {
    const rows = await prisma.attendance.findMany({
      where: { businessId: req.user.business_id },
      include: { employee: { select: { name: true } } },
      orderBy: { date: 'desc' }, take: 300,
    });
    res.json(rows.map(r => decorateAtt(r, r.employee?.name || '—')));
  } catch (err) { next(err); }
});

router.post('/attendance/clock', auth, validate(AttendanceClockSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const emp = await prisma.employee.findFirst({ where: { id: req.body.employee_id, businessId }, select: { id: true, name: true } });
    if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    const at = req.body.at || serverNowHM();
    const date = new Date(req.body.date || serverDate());
    const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date } } });
    let rec;
    if (!existing || (!existing.clockIn)) {
      const status = await clockStatusFor(businessId, emp.id, at);
      rec = existing
        ? await prisma.attendance.update({ where: { id: existing.id }, data: { clockIn: at, status } })
        : await prisma.attendance.create({ data: { businessId, employeeId: emp.id, date, clockIn: at, status } });
    } else if (!existing.clockOut) {
      rec = await prisma.attendance.update({ where: { id: existing.id }, data: { clockOut: at } });
    } else {
      rec = existing;
    }
    res.json(decorateAtt(rec, emp.name));
  } catch (err) { next(err); }
});

router.post('/attendance/break', auth, validate(AttendanceClockSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const emp = await prisma.employee.findFirst({ where: { id: req.body.employee_id, businessId }, select: { id: true, name: true } });
    if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    const at = req.body.at || serverNowHM();
    const date = new Date(req.body.date || serverDate());
    const rec = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date } } });
    if (!rec || !rec.clockIn || rec.clockOut) return res.status(400).json({ title: 'Employee must be clocked in', status: 400 });
    const breaks = Array.isArray(rec.breaks) ? rec.breaks : [];
    const open = breaks.find(b => !b.end);
    if (open) open.end = at; else breaks.push({ start: at, end: '' });
    const updated = await prisma.attendance.update({ where: { id: rec.id }, data: { breaks } });
    res.json(decorateAtt(updated, emp.name));
  } catch (err) { next(err); }
});

router.post('/attendance/auto-absent', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const date = new Date(req.body.date || serverDate());
    const [emps, present, shifts] = await Promise.all([
      prisma.employee.findMany({ where: { businessId, status: 'active' }, select: { id: true } }),
      prisma.attendance.findMany({ where: { businessId, date }, select: { employeeId: true } }),
      prisma.employeeShift.findMany({ where: { employee: { businessId } }, select: { employeeId: true, type: true } }),
    ]);
    const has = new Set(present.map(p => p.employeeId));
    const flexible = new Set(shifts.filter(s => s.type === 'flexible').map(s => s.employeeId));
    const toAdd = emps.filter(e => !has.has(e.id) && !flexible.has(e.id));
    if (toAdd.length) {
      await prisma.attendance.createMany({ data: toAdd.map(e => ({ businessId, employeeId: e.id, date, status: 'absent' })), skipDuplicates: true });
    }
    res.json({ added: toAdd.length });
  } catch (err) { next(err); }
});

// ── Attendance summary (monthly metrics + pay derivation) ──
async function buildSummary(emp, records, settings) {
  const present = records.filter(r => r.status === 'present').length;
  const late = records.filter(r => r.status === 'late').length;
  const absent = records.filter(r => r.status === 'absent' || !r.clockIn).length;
  const daysWorked = records.filter(r => r.clockIn).length;
  const totalHours = records.reduce((s, r) => s + decorateAtt(r, '').hours, 0);
  const std = parseFloat(settings.standardHours), wd = settings.workingDays || 26;
  const otRate = parseFloat(settings.overtimeRate), lateDed = parseFloat(settings.lateDeduction);
  const salary = parseFloat(emp.salary || 0);
  const expected = std * daysWorked;
  const overtime = Math.max(0, totalHours - expected);
  const hourly = std > 0 && wd > 0 ? salary / (wd * std) : 0;
  const absentDed = settings.absentDeduction === 'day' ? (wd > 0 ? salary / wd : 0) : parseFloat(settings.absentDeduction) || 0;
  const lateDeduction = late * lateDed;
  const absentDeduction = absent * absentDed;
  return {
    employee_id: emp.id, employee_name: emp.name, month: settings._month,
    present, late, absent, days_worked: daysWorked,
    total_hours: +totalHours.toFixed(2), expected_hours: +expected.toFixed(2),
    overtime_hours: +overtime.toFixed(2), hourly_rate: +hourly.toFixed(2),
    overtime_pay: +(overtime * hourly * otRate).toFixed(2),
    late_deduction: +lateDeduction.toFixed(2), absent_deduction: +absentDeduction.toFixed(2),
    total_deduction: +(lateDeduction + absentDeduction).toFixed(2),
  };
}
function monthRange(month) {
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : serverDate().slice(0, 7);
  const start = new Date(m + '-01');
  const end = new Date(start); end.setMonth(end.getMonth() + 1);
  return { m, start, end };
}

router.get('/attendance-summary', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const { m, start, end } = monthRange(req.query.month);
    const settings = await loadSettings(businessId); settings._month = m;
    const [emps, records] = await Promise.all([
      prisma.employee.findMany({ where: { businessId }, select: { id: true, name: true, salary: true } }),
      prisma.attendance.findMany({ where: { businessId, date: { gte: start, lt: end } } }),
    ]);
    const byEmp = {};
    records.forEach(r => { (byEmp[r.employeeId] ||= []).push(r); });
    const out = await Promise.all(emps.map(e => buildSummary(e, byEmp[e.id] || [], settings)));
    res.json(out);
  } catch (err) { next(err); }
});

router.get('/attendance-summary/:empId', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const { m, start, end } = monthRange(req.query.month);
    const emp = await prisma.employee.findFirst({ where: { id: req.params.empId, businessId }, select: { id: true, name: true, salary: true } });
    if (!emp) return res.status(404).json({ title: 'Not found', status: 404 });
    const settings = await loadSettings(businessId); settings._month = m;
    const records = await prisma.attendance.findMany({ where: { businessId, employeeId: emp.id, date: { gte: start, lt: end } } });
    res.json(await buildSummary(emp, records, settings));
  } catch (err) { next(err); }
});

module.exports = router;
