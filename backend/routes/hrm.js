/**
 * HRM routes — phase 1: employees, org units, settings, summary.
 * Mounted at /api/v1/hrm behind requireModule('hrm').
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const accounting = require('../lib/accounting');
const statutory = require('../lib/statutory');
const wa = require('../lib/whatsapp');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { EmployeeSchema, OrgUnitSchema, HrmSettingsSchema, EmployeeShiftSchema, AttendanceClockSchema,
  LeaveTypeSchema, LeaveTypeUpdateSchema, LeaveSchema, LeaveStatusSchema, LeaveOverrideSchema,
  RosterShiftSchema, RosterSwapSchema, HrAdvanceSchema, HrTodoSchema, StatusSchema,
  PayrollSchema, PayslipSettingsSchema } = require('../validation/schemas');

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
    const settings = await loadSettings(businessId);
    const today = new Date(tzParts(settings.timezone).date);
    const [employees, onLeave, present, pendingLeave, openTodos, payroll] = await Promise.all([
      prisma.employee.count({ where: { businessId } }),
      prisma.employee.count({ where: { businessId, status: 'on_leave' } }),
      prisma.attendance.count({ where: { businessId, date: today, clockIn: { not: null } } }),
      prisma.leave.count({ where: { businessId, status: 'pending' } }),
      prisma.hrTodo.count({ where: { businessId, status: 'pending' } }),
      prisma.payroll.aggregate({ where: { businessId, status: 'paid' }, _sum: { net: true } }),
    ]);
    res.json({ employees, present, on_leave: onLeave, pending_leave: pendingLeave, payroll: parseFloat(payroll._sum.net || 0), open_todos: openTodos });
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
// Wall-clock date + HH:MM in the business's timezone. The container runs UTC,
// but African markets (Somaliland/Somalia/Kenya/Ethiopia) are EAT (UTC+3), so a
// 09:00 clock-in must record 09:00 — not 06:00. Falls back to server time.
function tzParts(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const g = (t) => parts.find(p => p.type === t)?.value;
    let hh = g('hour'); if (hh === '24') hh = '00';
    return { date: `${g('year')}-${g('month')}-${g('day')}`, hm: `${hh}:${g('minute')}` };
  } catch { return { date: serverDate(), hm: serverNowHM() }; }
}
const hoursLabel = (h) => h > 0 ? `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m` : '—';

function decorateAtt(rec, empName, nowHM = serverNowHM()) {
  const breaks = Array.isArray(rec.breaks) ? rec.breaks : [];
  let breakMin = 0, onBreak = false, openStart = null;
  for (const b of breaks) { if (b.end) breakMin += hm2min(b.end) - hm2min(b.start); else { onBreak = true; openStart = b.start; } }
  let hours = 0, status = rec.status;
  // Span in minutes from clock-in to `end`, treating an end-before-start as an
  // overnight shift that wrapped past midnight (e.g. 22:00 → 06:00 = 8h, not 0).
  const spanMin = (start, end) => { let d = hm2min(end) - hm2min(start); if (d < 0) d += 1440; return d; };
  if (rec.clockIn && !rec.clockOut) {
    const end = onBreak ? openStart : nowHM;
    hours = Math.max(0, (spanMin(rec.clockIn, end) - breakMin) / 60);
    status = onBreak ? 'on break' : 'running';
  } else if (rec.clockIn && rec.clockOut) {
    hours = Math.max(0, (spanMin(rec.clockIn, rec.clockOut) - breakMin) / 60);
  }
  return {
    id: rec.id, employee_id: rec.employeeId, employee_name: empName,
    date: rec.date.toISOString().slice(0, 10),
    clock_in: rec.clockIn || '', clock_out: rec.clockOut || '',
    status, on_break: onBreak, break_min: breakMin,
    hours: +hours.toFixed(2), hours_label: hoursLabel(hours),
  };
}

async function clockStatusFor(businessId, employeeId, at, settings) {
  const sh = await prisma.employeeShift.findUnique({ where: { employeeId } });
  if (sh && sh.type === 'flexible') return 'present';
  const s = settings || await loadSettings(businessId);
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
    const settings = await loadSettings(businessId);
    const tp = tzParts(settings.timezone);
    const at = req.body.at || tp.hm;
    const date = new Date(req.body.date || tp.date);
    const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date } } });
    let rec;
    if (!existing || (!existing.clockIn)) {
      const status = await clockStatusFor(businessId, emp.id, at, settings);
      rec = existing
        ? await prisma.attendance.update({ where: { id: existing.id }, data: { clockIn: at, status } })
        : await prisma.attendance.create({ data: { businessId, employeeId: emp.id, date, clockIn: at, status } });
    } else if (!existing.clockOut) {
      rec = await prisma.attendance.update({ where: { id: existing.id }, data: { clockOut: at } });
    } else {
      rec = existing;
    }
    res.json(decorateAtt(rec, emp.name, tp.hm));
  } catch (err) { next(err); }
});

router.post('/attendance/break', auth, validate(AttendanceClockSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const emp = await prisma.employee.findFirst({ where: { id: req.body.employee_id, businessId }, select: { id: true, name: true } });
    if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    const settings = await loadSettings(businessId);
    const tp = tzParts(settings.timezone);
    const at = req.body.at || tp.hm;
    const date = new Date(req.body.date || tp.date);
    const rec = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date } } });
    if (!rec || !rec.clockIn || rec.clockOut) return res.status(400).json({ title: 'Employee must be clocked in', status: 400 });
    const breaks = Array.isArray(rec.breaks) ? rec.breaks : [];
    const open = breaks.find(b => !b.end);
    if (open) open.end = at; else breaks.push({ start: at, end: '' });
    const updated = await prisma.attendance.update({ where: { id: rec.id }, data: { breaks } });
    res.json(decorateAtt(updated, emp.name, tp.hm));
  } catch (err) { next(err); }
});

router.post('/attendance/auto-absent', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const settings = await loadSettings(businessId);
    const date = new Date(req.body.date || tzParts(settings.timezone).date);
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

// ── Leave ───────────────────────────────────────────────────────────────────────
const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual', defaultDays: 24, accrues: true,  paid: true },
  { name: 'Sick',   defaultDays: 12, accrues: false, paid: true },
  { name: 'Casual', defaultDays: 6,  accrues: false, paid: true },
  { name: 'Unpaid', defaultDays: 0,  accrues: false, paid: false },
];
async function ensureLeaveTypeDefaults(businessId) {
  const count = await prisma.leaveType.count({ where: { businessId } });
  if (count > 0) return;
  await prisma.leaveType.createMany({ data: DEFAULT_LEAVE_TYPES.map(t => ({ businessId, ...t })), skipDuplicates: true });
}

// Completed months of service. Accrual is earned per FULL month worked — a new
// hire on day one has earned nothing yet, not a whole month's leave. Employees
// with no recorded join date keep a full year's entitlement (legacy default).
function monthsWorked(joinedAt) {
  if (!joinedAt) return 12;
  const now = new Date(), j = new Date(joinedAt);
  let m = (now.getFullYear() - j.getFullYear()) * 12 + (now.getMonth() - j.getMonth());
  if (now.getDate() < j.getDate()) m -= 1; // monthly anniversary not yet reached
  return Math.max(0, Math.min(12, m));
}
// Balances for one employee given the type catalog, their leaves, and overrides.
function computeBalances(emp, types, leaves, overrideMap) {
  const mw = monthsWorked(emp.joinedAt);
  return types.map(t => {
    const base = overrideMap[t.name] != null ? overrideMap[t.name] : t.defaultDays;
    const entitled = t.accrues ? Math.min(base, Math.round((base / 12) * mw)) : base;
    const mine = leaves.filter(l => l.type === t.name);
    const taken = mine.filter(l => l.status === 'approved').reduce((s, l) => s + l.days, 0);
    const pending = mine.filter(l => l.status === 'pending').reduce((s, l) => s + l.days, 0);
    return { type: t.name, paid: t.paid, entitled, taken, pending, balance: entitled - taken };
  });
}
function serializeLeave(l, empName) {
  return {
    id: l.id, employee_id: l.employeeId, employee_name: empName,
    type: l.type, from: l.fromDate.toISOString().slice(0, 10), to: l.toDate.toISOString().slice(0, 10),
    days: l.days, reason: l.reason || '', status: l.status, approved_by: l.approvedBy || null,
  };
}

router.get('/leave-type', auth, async (req, res, next) => {
  try {
    await ensureLeaveTypeDefaults(req.user.business_id);
    const types = await prisma.leaveType.findMany({ where: { businessId: req.user.business_id }, orderBy: { name: 'asc' } });
    res.json(types.map(t => ({ id: t.id, name: t.name, default_days: t.defaultDays, accrues: t.accrues, paid: t.paid })));
  } catch (err) { next(err); }
});
router.post('/leave-type', auth, requireRole('owner', 'manager'), validate(LeaveTypeSchema), async (req, res, next) => {
  try {
    const t = await prisma.leaveType.upsert({
      where: { businessId_name: { businessId: req.user.business_id, name: req.body.name } },
      create: { businessId: req.user.business_id, name: req.body.name, defaultDays: req.body.default_days, accrues: req.body.accrues, paid: req.body.paid },
      update: { defaultDays: req.body.default_days, accrues: req.body.accrues, paid: req.body.paid },
    });
    res.status(201).json({ id: t.id, name: t.name, default_days: t.defaultDays, accrues: t.accrues, paid: t.paid });
  } catch (err) { next(err); }
});
router.put('/leave-type/:id', auth, requireRole('owner', 'manager'), validate(LeaveTypeUpdateSchema), async (req, res, next) => {
  try {
    const existing = await prisma.leaveType.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const { default_days, accrues, paid } = req.body;
    const t = await prisma.leaveType.update({ where: { id: req.params.id }, data: {
      ...(default_days !== undefined && { defaultDays: default_days }),
      ...(accrues !== undefined && { accrues }), ...(paid !== undefined && { paid }),
    }});
    res.json({ id: t.id, name: t.name, default_days: t.defaultDays, accrues: t.accrues, paid: t.paid });
  } catch (err) { next(err); }
});
router.delete('/leave-type/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const t = await prisma.leaveType.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!t) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.leaveType.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.get('/leave', auth, async (req, res, next) => {
  try {
    const leaves = await prisma.leave.findMany({
      where: { businessId: req.user.business_id },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
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
    const bal = computeBalances(emp, types, leaves, overrideMap).find(b => b.type === req.body.type);
    if (bal && bal.paid) {
      const available = bal.entitled - bal.taken - bal.pending;
      if (req.body.days > available) return res.status(422).json({ title: `Only ${available} ${req.body.type} day(s) available`, status: 422 });
    }
    const created = await prisma.leave.create({ data: {
      businessId, employeeId: emp.id, type: req.body.type,
      fromDate: req.body.from ? new Date(req.body.from) : new Date(),
      toDate: req.body.to ? new Date(req.body.to) : new Date(),
      days: req.body.days, reason: req.body.reason || null,
    }});
    res.status(201).json(serializeLeave(created, emp.name));
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
    // Mirror the mock: approving puts the employee on leave; otherwise back to active.
    await prisma.employee.update({ where: { id: leave.employeeId }, data: { status: status === 'approved' ? 'on_leave' : 'active' } });
    res.json(serializeLeave(updated, leave.employee?.name || '—'));
  } catch (err) { next(err); }
});

router.get('/leave-balance', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    await ensureLeaveTypeDefaults(businessId);
    const [emps, types, leaves, overrides] = await Promise.all([
      prisma.employee.findMany({ where: { businessId }, select: { id: true, name: true, joinedAt: true } }),
      prisma.leaveType.findMany({ where: { businessId } }),
      prisma.leave.findMany({ where: { businessId } }),
      prisma.employeeLeaveOverride.findMany({ where: { businessId } }),
    ]);
    const res2 = emps.map(emp => {
      const ovMap = Object.fromEntries(overrides.filter(o => o.employeeId === emp.id).map(o => [o.type, o.days]));
      return { employee_id: emp.id, employee_name: emp.name, balances: computeBalances(emp, types, leaves.filter(l => l.employeeId === emp.id), ovMap) };
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
    const [types, leaves, overrides] = await Promise.all([
      prisma.leaveType.findMany({ where: { businessId } }),
      prisma.leave.findMany({ where: { businessId, employeeId: emp.id } }),
      prisma.employeeLeaveOverride.findMany({ where: { employeeId: emp.id } }),
    ]);
    const ovMap = Object.fromEntries(overrides.map(o => [o.type, o.days]));
    res.json(computeBalances(emp, types, leaves, ovMap));
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

// ── Roster shifts ────────────────────────────────────────────────────────────────
function serializeShift(s) {
  return {
    id: s.id, employee_id: s.employeeId, employee_name: s.employee?.name || '—',
    location_id: s.locationId, location_name: s.location?.name || '—',
    date: s.date.toISOString().slice(0, 10), start: s.start, end: s.end, role: s.role || '',
  };
}
const shiftInclude = { employee: { select: { name: true } }, location: { select: { name: true } } };

router.get('/shift', auth, async (req, res, next) => {
  try {
    const shifts = await prisma.rosterShift.findMany({ where: { businessId: req.user.business_id }, include: shiftInclude, orderBy: { date: 'desc' } });
    res.json(shifts.map(serializeShift));
  } catch (err) { next(err); }
});
router.post('/shift', auth, requireRole('owner', 'manager'), validate(RosterShiftSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const emp = await prisma.employee.findFirst({ where: { id: b.employee_id, businessId: req.user.business_id } });
    if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    const shift = await prisma.rosterShift.create({
      data: { businessId: req.user.business_id, employeeId: b.employee_id, locationId: b.location_id || null, date: new Date(b.date || serverDate()), start: b.start, end: b.end, role: b.role || null },
      include: shiftInclude,
    });
    res.status(201).json(serializeShift(shift));
  } catch (err) { next(err); }
});
router.delete('/shift/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const s = await prisma.rosterShift.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!s) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.rosterShift.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Shift swaps ──────────────────────────────────────────────────────────────────
function serializeSwap(s) {
  return {
    id: s.id, shift_id: s.shiftId, from_id: s.fromId, to_id: s.toId,
    from_name: s.from?.name || '—', to_name: s.to?.name || '—',
    reason: s.reason || '', status: s.status,
    date: s.createdAt.toISOString().slice(0, 10),
    shift: s.shift ? serializeShift(s.shift) : null,
  };
}
const swapInclude = { from: { select: { name: true } }, to: { select: { name: true } }, shift: { include: shiftInclude } };

router.get('/shift-swap', auth, async (req, res, next) => {
  try {
    const swaps = await prisma.rosterSwap.findMany({ where: { businessId: req.user.business_id }, include: swapInclude, orderBy: { createdAt: 'desc' } });
    res.json(swaps.map(serializeSwap));
  } catch (err) { next(err); }
});
router.post('/shift-swap', auth, validate(RosterSwapSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const shift = await prisma.rosterShift.findFirst({ where: { id: req.body.shift_id, businessId } });
    if (!shift) return res.status(404).json({ title: 'Shift not found', status: 404 });
    const swap = await prisma.rosterSwap.create({
      data: { businessId, shiftId: shift.id, fromId: shift.employeeId, toId: req.body.to_id, reason: req.body.reason || null },
      include: swapInclude,
    });
    res.status(201).json(serializeSwap(swap));
  } catch (err) { next(err); }
});
router.put('/shift-swap/:id', auth, requireRole('owner', 'manager'), validate(StatusSchema), async (req, res, next) => {
  try {
    const swap = await prisma.rosterSwap.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!swap) return res.status(404).json({ title: 'Not found', status: 404 });
    if (req.body.status === 'approved') {
      await prisma.rosterShift.update({ where: { id: swap.shiftId }, data: { employeeId: swap.toId } });
    }
    await prisma.rosterSwap.update({ where: { id: req.params.id }, data: { status: req.body.status } });
    const updated = await prisma.rosterSwap.findUnique({ where: { id: req.params.id }, include: swapInclude });
    res.json(serializeSwap(updated));
  } catch (err) { next(err); }
});
router.delete('/shift-swap/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const s = await prisma.rosterSwap.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!s) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.rosterSwap.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Advances ─────────────────────────────────────────────────────────────────────
function serializeAdvance(a) {
  return {
    id: a.id, employee_id: a.employeeId, employee_name: a.employee?.name || '—',
    amount: parseFloat(a.amount || 0), date: a.advanceDate.toISOString().slice(0, 10),
    account_id: a.accountId, account_name: a.account?.name || '—',
    note: a.note || '', outstanding: parseFloat(a.outstanding || 0), status: a.status,
  };
}
const advanceInclude = { employee: { select: { name: true } }, account: { select: { name: true } } };

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

// ── Todos ────────────────────────────────────────────────────────────────────────
function serializeTodo(t) {
  return {
    id: t.id, title: t.title, assigned_to: t.assignedTo, assigned_name: t.assignee?.name || '—',
    priority: t.priority, status: t.status, due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : '',
  };
}
router.get('/todo', auth, async (req, res, next) => {
  try {
    const todos = await prisma.hrTodo.findMany({ where: { businessId: req.user.business_id }, include: { assignee: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
    res.json(todos.map(serializeTodo));
  } catch (err) { next(err); }
});
router.post('/todo', auth, validate(HrTodoSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const todo = await prisma.hrTodo.create({
      data: { businessId: req.user.business_id, title: b.title, assignedTo: b.assigned_to || null, priority: b.priority || 'medium', dueDate: b.due ? new Date(b.due) : null },
      include: { assignee: { select: { name: true } } },
    });
    res.status(201).json(serializeTodo(todo));
  } catch (err) { next(err); }
});
router.put('/todo/:id', auth, validate(StatusSchema), async (req, res, next) => {
  try {
    const t = await prisma.hrTodo.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!t) return res.status(404).json({ title: 'Not found', status: 404 });
    const updated = await prisma.hrTodo.update({ where: { id: req.params.id }, data: { status: req.body.status }, include: { assignee: { select: { name: true } } } });
    res.json(serializeTodo(updated));
  } catch (err) { next(err); }
});

// ── Payroll & payslip ────────────────────────────────────────────────────────────
function serializePayroll(p) {
  return {
    id: p.id, employee_id: p.employeeId, employee_name: p.employee?.name || '—', month: p.month,
    basic: parseFloat(p.basic || 0), allowance: parseFloat(p.allowance || 0), overtime: parseFloat(p.overtime || 0),
    bonus: parseFloat(p.bonus || 0), incentive: parseFloat(p.incentive || 0), deduction: parseFloat(p.deduction || 0),
    advance_recovered: parseFloat(p.advanceRecovered || 0),
    statutory_country: p.statutoryCountry || null,
    paye: parseFloat(p.paye || 0), nssf: parseFloat(p.nssf || 0), shif: parseFloat(p.shif || 0),
    housing_levy: parseFloat(p.housingLevy || 0), statutory_total: parseFloat(p.statutoryTotal || 0),
    net: parseFloat(p.net || 0), status: p.status,
  };
}

router.get('/payroll', auth, async (req, res, next) => {
  try {
    const rows = await prisma.payroll.findMany({ where: { businessId: req.user.business_id }, include: { employee: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
    res.json(rows.map(serializePayroll));
  } catch (err) { next(err); }
});

router.post('/payroll', auth, requireRole('owner', 'manager'), validate(PayrollSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const emp = await prisma.employee.findFirst({ where: { id: b.employee_id, businessId }, select: { id: true, name: true, joinedAt: true } });
    if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });

    // Pro-rate the basic for a mid-month joiner: only the days from the join date
    // to month-end are paid. Opt-in, and only when the join falls in this month.
    let basic = b.basic, proration = null;
    if (b.prorate && emp.joinedAt) {
      const { start, end } = monthRange(b.month);
      const join = new Date(emp.joinedAt);
      if (join >= start && join < end) {
        const daysInMonth = Math.round((end - start) / 86400000);
        const workedDays = Math.round((end - join) / 86400000);
        basic = +(b.basic * workedDays / daysInMonth).toFixed(2);
        proration = { worked_days: workedDays, days_in_month: daysInMonth, full_basic: b.basic, prorated_basic: basic };
      }
    }
    const gross = basic + b.allowance + b.overtime + b.bonus + b.incentive;
    // Statutory deductions (PAYE/NSSF/SHIF/Housing) computed from gross, on top of
    // the freeform deduction (advances etc.). No country → no statutory (launch markets).
    const stat = b.statutory_country && b.statutory_country !== 'none'
      ? statutory.compute(b.statutory_country, gross)
      : null;
    const statutoryTotal = stat ? stat.total_statutory : 0;
    const net = +(gross - b.deduction - statutoryTotal).toFixed(2);

    const payroll = await prisma.$transaction(async (tx) => {
      // Recover outstanding advances from the deduction (oldest first).
      let remaining = b.deduction, recovered = 0;
      if (remaining > 0) {
        const advances = await tx.hrAdvance.findMany({ where: { businessId, employeeId: emp.id, status: 'outstanding' }, orderBy: { createdAt: 'asc' } });
        for (const adv of advances) {
          if (remaining <= 0) break;
          const out = parseFloat(adv.outstanding);
          const take = Math.min(out, remaining);
          const newOut = +(out - take).toFixed(2);
          await tx.hrAdvance.update({ where: { id: adv.id }, data: { outstanding: newOut, status: newOut <= 0.001 ? 'settled' : 'outstanding' } });
          remaining = +(remaining - take).toFixed(2);
          recovered += take;
        }
      }
      const created = await tx.payroll.create({
        data: {
          businessId, employeeId: emp.id, month: b.month, basic, allowance: b.allowance,
          overtime: b.overtime, bonus: b.bonus, incentive: b.incentive, deduction: b.deduction,
          advanceRecovered: +recovered.toFixed(2),
          statutoryCountry: stat ? stat.country : null,
          paye: stat ? stat.paye : 0, nssf: stat ? stat.nssf : 0, shif: stat ? stat.shif : 0,
          housingLevy: stat ? stat.housing_levy : 0, statutoryTotal,
          net, status: 'paid',
        },
        include: { employee: { select: { name: true } } },
      });
      // GL: gross wages expensed, net paid in cash, freeform + statutory withheld as payables.
      await accounting.postPayroll(tx, { businessId, gross, net, deduction: b.deduction, advanceRecovered: +recovered.toFixed(2), statutory: statutoryTotal, sourceId: created.id, createdById: req.user.id });
      return created;
    });
    res.status(201).json({ ...serializePayroll(payroll), ...(proration && { proration }) });
  } catch (err) { next(err); }
});

// Remit a month's statutory withholding to the authority — clears the Statutory
// Payable (2120) and pays it out. Idempotent: only un-remitted runs are paid.
router.post('/payroll/remit-statutory', auth, requireRole('owner', 'manager'), validate(z.object({
  month:  z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM'),
  method: z.string().max(30).optional(),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.payroll.findMany({
        where: { businessId, month: req.body.month, statutoryTotal: { gt: 0 }, statutoryRemittedAt: null },
        select: { id: true, statutoryTotal: true },
      });
      const total = +rows.reduce((s, r) => s + parseFloat(r.statutoryTotal), 0).toFixed(2);
      if (total <= 0) return { total: 0, count: 0 };
      await tx.payroll.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { statutoryRemittedAt: new Date() } });
      await accounting.postJournal(tx, {
        businessId, description: `Statutory remittance — ${req.body.month}`,
        sourceType: 'statutory_remittance', sourceId: null, createdById: req.user.id,
        lines: [
          { code: '2120', debit: total, credit: 0, description: 'Statutory payable settled' },
          { code: accounting.tenderAccountCode(req.body.method || 'bank'), debit: 0, credit: total, description: 'Remitted to authority' },
        ],
      });
      return { total, count: rows.length };
    });
    if (result.count === 0) return res.status(400).json({ title: 'No outstanding statutory to remit for this month', status: 400 });
    res.json({ message: `Remitted statutory for ${result.count} payroll run(s).`, remitted: result.total, runs: result.count });
  } catch (err) { next(err); }
});

// Preview statutory deductions for a gross + country (no persistence) — for the
// payroll screen to show PAYE/NSSF/SHIF/Housing and net before running payroll.
router.post('/payroll/compute', auth, requireRole('owner', 'manager'), validate(z.object({
  gross: z.coerce.number().nonnegative(),
  country: z.enum(statutory.COUNTRIES).default('none'),
})), async (req, res, next) => {
  try {
    res.json(statutory.compute(req.body.country, req.body.gross));
  } catch (err) { next(err); }
});

// Statutory filing report for a month: per-employee PAYE/NSSF/SHIF/Housing plus
// totals — the numbers an operator files with KRA / NSSF / SHA.
router.get('/payroll/statutory-report', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ title: 'Provide month=YYYY-MM', status: 400 });
    const rows = await prisma.payroll.findMany({
      where: { businessId, month, statutoryTotal: { gt: 0 } },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const lines = rows.map(p => ({
      employee: p.employee?.name || '', country: p.statutoryCountry,
      gross: +(parseFloat(p.basic) + parseFloat(p.allowance) + parseFloat(p.overtime) + parseFloat(p.bonus) + parseFloat(p.incentive)).toFixed(2),
      paye: parseFloat(p.paye), nssf: parseFloat(p.nssf), shif: parseFloat(p.shif),
      housing_levy: parseFloat(p.housingLevy), total: parseFloat(p.statutoryTotal),
    }));
    const sum = (k) => +lines.reduce((s, l) => s + l[k], 0).toFixed(2);
    res.json({
      month, employees: lines.length,
      totals: { paye: sum('paye'), nssf: sum('nssf'), shif: sum('shif'), housing_levy: sum('housing_levy'), total: sum('total') },
      lines,
    });
  } catch (err) { next(err); }
});

router.get('/payslip/:id', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const p = await prisma.payroll.findFirst({
      where: { id: req.params.id, businessId },
      include: { employee: { include: { location: { select: { name: true } } } } },
    });
    if (!p) return res.status(404).json({ title: 'Not found', status: 404 });
    const emp = p.employee;
    const settings = await loadSettings(businessId);
    const { m, start, end } = monthRange(p.month);
    settings._month = m;
    const [records, leaves] = await Promise.all([
      prisma.attendance.findMany({ where: { businessId, employeeId: emp.id, date: { gte: start, lt: end } } }),
      prisma.leave.findMany({ where: { businessId, employeeId: emp.id, status: 'approved' } }),
    ]);
    const att = await buildSummary({ id: emp.id, name: emp.name, salary: emp.salary }, records, settings);
    res.json({
      employee: { name: emp.name, designation: emp.designation || '', department: emp.department || '', location: emp.location?.name || '' },
      month: p.month,
      earnings: { basic: parseFloat(p.basic), allowance: parseFloat(p.allowance), overtime: parseFloat(p.overtime), bonus: parseFloat(p.bonus), incentive: parseFloat(p.incentive) },
      deductions: { total: parseFloat(p.deduction), late: att.late_deduction, absent: att.absent_deduction, advance_recovered: parseFloat(p.advanceRecovered) },
      statutory: parseFloat(p.statutoryTotal) > 0 ? {
        country: p.statutoryCountry, paye: parseFloat(p.paye), nssf: parseFloat(p.nssf),
        shif: parseFloat(p.shif), housing_levy: parseFloat(p.housingLevy), total: parseFloat(p.statutoryTotal),
        remitted: !!p.statutoryRemittedAt,
      } : null,
      attendance: { days_worked: att.days_worked, total_hours: att.total_hours, overtime_hours: att.overtime_hours, present: att.present, late: att.late, absent: att.absent },
      leave: leaves.map(l => ({ type: l.type, days: l.days, from: l.fromDate.toISOString().slice(0, 10), to: l.toDate.toISOString().slice(0, 10) })),
      net: parseFloat(p.net), status: p.status,
      settings: {
        show_attendance: settings.showAttendance, show_overtime: settings.showOvertime, show_leave: settings.showLeave,
        show_advance: settings.showAdvance, show_bonus: settings.showBonus, show_incentive: settings.showIncentive,
        show_deduction_breakdown: settings.showDeductionBreakdown,
      },
    });
  } catch (err) { next(err); }
});

// Distribute a payslip to the employee over WhatsApp (the artifact existed; this
// closes the "delivery" half of the gap). Phone is provided by the manager.
router.post('/payslip/:id/send-whatsapp', auth, requireRole('owner', 'manager'), validate(z.object({
  phone: z.string().trim().min(3).max(50),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const p = await prisma.payroll.findFirst({ where: { id: req.params.id, businessId }, include: { employee: { select: { name: true } } } });
    if (!p) return res.status(404).json({ title: 'Payslip not found', status: 404 });
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
    const gross = ['basic', 'allowance', 'overtime', 'bonus', 'incentive'].reduce((s, k) => s + parseFloat(p[k] || 0), 0);
    const msg = `*Payslip — ${business?.name || 'Payroll'}*\n${p.employee.name} · ${p.month}\n\nGross: $${gross.toFixed(2)}\nDeductions: $${parseFloat(p.deduction).toFixed(2)}\n*Net pay: $${parseFloat(p.net).toFixed(2)}*\n\nThank you.`;
    const r = await wa.send({ businessId, to: req.body.phone, text: msg, kind: 'payslip', referenceType: 'payroll', referenceId: p.id });
    res.status(r.ok ? 200 : 502).json(r);
  } catch (err) { next(err); }
});

router.get('/payslip-settings', auth, async (req, res, next) => {
  try {
    const s = await loadSettings(req.user.business_id);
    res.json({
      show_attendance: s.showAttendance, show_overtime: s.showOvertime, show_leave: s.showLeave,
      show_advance: s.showAdvance, show_bonus: s.showBonus, show_incentive: s.showIncentive,
      show_deduction_breakdown: s.showDeductionBreakdown,
    });
  } catch (err) { next(err); }
});

router.put('/payslip-settings', auth, requireRole('owner', 'manager'), validate(PayslipSettingsSchema), async (req, res, next) => {
  try {
    await loadSettings(req.user.business_id);
    const b = req.body;
    const s = await prisma.hrmSettings.update({
      where: { businessId: req.user.business_id },
      data: {
        ...(b.show_attendance !== undefined && { showAttendance: b.show_attendance }),
        ...(b.show_overtime !== undefined && { showOvertime: b.show_overtime }),
        ...(b.show_leave !== undefined && { showLeave: b.show_leave }),
        ...(b.show_advance !== undefined && { showAdvance: b.show_advance }),
        ...(b.show_bonus !== undefined && { showBonus: b.show_bonus }),
        ...(b.show_incentive !== undefined && { showIncentive: b.show_incentive }),
        ...(b.show_deduction_breakdown !== undefined && { showDeductionBreakdown: b.show_deduction_breakdown }),
      },
    });
    res.json({
      show_attendance: s.showAttendance, show_overtime: s.showOvertime, show_leave: s.showLeave,
      show_advance: s.showAdvance, show_bonus: s.showBonus, show_incentive: s.showIncentive,
      show_deduction_breakdown: s.showDeductionBreakdown,
    });
  } catch (err) { next(err); }
});

module.exports = router;
