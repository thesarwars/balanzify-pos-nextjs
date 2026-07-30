/**
 * HRM routes — phase 1: employees, org units, settings, summary.
 * Mounted at /api/v1/hrm behind requireModule('hrm').
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const accounting = require('../lib/accounting');
const statutory = require('../lib/statutory');
const commission = require('../lib/commission');
const wa = require('../lib/whatsapp');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { EmployeeSchema, EmployeeUpdateSchema, OrgUnitSchema, HrmSettingsSchema, HolidaySchema, ShiftTemplateSchema, ShiftAssignSchema, AttendanceClockSchema,
  LeaveTypeSchema, LeaveTypeUpdateSchema, LeaveSchema, LeaveStatusSchema, LeaveOverrideSchema,
  RosterShiftSchema, RosterSwapSchema, HrAdvanceSchema, HrTodoSchema, StatusSchema,
  PayrollSchema, PayrollGroupSchema, PayComponentSchema, SalesTargetSchema, PayslipSettingsSchema } = require('../validation/schemas');

const router = express.Router();

const PL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_DEPARTMENTS  = ['Sales', 'Inventory', 'Finance', 'Management', 'Kitchen'];
const DEFAULT_DESIGNATIONS = ['Cashier', 'Store Keeper', 'Accountant', 'Manager', 'Chef', 'Cleaner'];

// Seed a business's department/designation list ONCE. Keying this off "are
// there zero org units?" meant deleting them all resurrected the whole default
// set on the next read, so the flag is what records that we have seeded.
async function ensureOrgDefaults(businessId) {
  const settings = await loadSettings(businessId);
  if (settings.orgSeeded) return;
  await prisma.hrmSettings.update({ where: { businessId }, data: { orgSeeded: true } });
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

// Employee ids with an approved leave covering `date`. This is the single
// source of truth for "on leave" — Employee.status stays an employment state.
async function onLeaveOn(businessId, date) {
  const rows = await prisma.leave.findMany({
    where: { businessId, status: 'approved', fromDate: { lte: date }, toDate: { gte: date } },
    select: { employeeId: true },
  });
  return new Set(rows.map(r => r.employeeId));
}

async function employeeSales(businessId, userId, pct) {
  if (!userId) return { total_sale: 0, tx_count: 0, commission: 0, commission_percent: pct };
  const agg = await prisma.sale.aggregate({
    where: { businessId, cashierId: userId, status: 'completed' },
    _sum: { totalAmount: true }, _count: { id: true },
  });
  const total = parseFloat(agg._sum.totalAmount || 0);
  // Tiered bands where the user has them, the flat percent where they do not.
  const c = await commission.commissionForUser(businessId, userId, total, pct);
  return { total_sale: total, tx_count: agg._count.id, commission: c.commission, commission_percent: c.percent };
}

// ── Sales targets (tiered commission bands) ─────────────────────────────────
router.get('/sales-target', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const [users, bands] = await Promise.all([
      prisma.user.findMany({ where: { businessId, isActive: true }, select: { id: true, name: true, commissionPercent: true }, orderBy: { name: 'asc' } }),
      prisma.salesTargetBand.findMany({ where: { businessId }, orderBy: { fromAmount: 'asc' } }),
    ]);
    const byUser = {};
    for (const b of bands) (byUser[b.userId] ||= []).push({
      from_amount: parseFloat(b.fromAmount), to_amount: b.toAmount == null ? null : parseFloat(b.toAmount),
      commission_percent: parseFloat(b.commissionPercent),
    });
    res.json(users.map(u => ({
      user_id: u.id, name: u.name,
      flat_percent: parseFloat(u.commissionPercent || 0),
      bands: byUser[u.id] || [],
    })));
  } catch (err) { next(err); }
});

// The whole band set for a user is submitted at once, as the reference does.
router.put('/sales-target/:userId', auth, requireRole('owner', 'manager'), validate(SalesTargetSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const user = await prisma.user.findFirst({ where: { id: req.params.userId, businessId }, select: { id: true } });
    if (!user) return res.status(404).json({ title: 'User not found', status: 404 });
    const bands = req.body.bands;
    for (const b of bands) {
      if (b.to_amount != null && b.to_amount < b.from_amount) {
        return res.status(422).json({ title: `A band cannot end (${b.to_amount}) below where it starts (${b.from_amount}).`, status: 422, code: 'BAND_REVERSED' });
      }
    }
    // Overlapping bands would make the payout depend on row order.
    const sorted = [...bands].sort((a, b) => a.from_amount - b.from_amount);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      if (prev.to_amount == null || sorted[i].from_amount <= prev.to_amount) {
        return res.status(422).json({ title: 'Bands overlap — each must start above the one before it ends.', status: 422, code: 'BANDS_OVERLAP' });
      }
    }
    await prisma.$transaction([
      prisma.salesTargetBand.deleteMany({ where: { businessId, userId: req.params.userId } }),
      ...(bands.length ? [prisma.salesTargetBand.createMany({
        data: bands.map(b => ({
          businessId, userId: req.params.userId,
          fromAmount: b.from_amount, toAmount: b.to_amount ?? null,
          commissionPercent: b.commission_percent,
        })),
      })] : []),
    ]);
    const fresh = await prisma.salesTargetBand.findMany({ where: { businessId, userId: req.params.userId }, orderBy: { fromAmount: 'asc' } });
    res.json({
      user_id: req.params.userId,
      bands: fresh.map(b => ({ from_amount: parseFloat(b.fromAmount), to_amount: b.toAmount == null ? null : parseFloat(b.toAmount), commission_percent: parseFloat(b.commissionPercent) })),
    });
  } catch (err) { next(err); }
});

// ── Summary ───────────────────────────────────────────────────────────────────
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

// ── Employees ─────────────────────────────────────────────────────────────────
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
      leave_balance: computeBalances(e, types, leaves, overrideMap),
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

// ── Holidays ────────────────────────────────────────────────────────────────────
// A holiday is a date range, optionally scoped to one location. It is the
// company calendar; a shift's weekly off days are a separate concept.
const ymd = (d) => d.toISOString().slice(0, 10);

// Parse a YYYY-MM-DD that is also a REAL day — the shape alone lets 2026-13-40
// through, and an Invalid Date reaches Prisma as a 500.
function parseDay(v) {
  const str = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) || ymd(d) !== str ? null : d;
}

function serializeHoliday(h) {
  return {
    id: h.id, name: h.name,
    start_date: ymd(h.startDate), end_date: ymd(h.endDate),
    location_id: h.locationId, location_name: h.location?.name || 'All locations',
    note: h.note || '',
  };
}

// Every date covered by a holiday in [from, to], for a location. A holiday with
// no location applies everywhere. Returns a Set of YYYY-MM-DD.
async function holidayDays(businessId, from, to, locationId) {
  const rows = await prisma.holiday.findMany({
    where: {
      businessId,
      startDate: { lte: to }, endDate: { gte: from },
      ...(locationId !== undefined && { OR: [{ locationId: null }, { locationId }] }),
    },
    select: { startDate: true, endDate: true },
  });
  const days = new Set();
  for (const h of rows) {
    // Clamp to the window so a long holiday does not expand it.
    const start = h.startDate < from ? from : h.startDate;
    const end = h.endDate > to ? to : h.endDate;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) days.add(ymd(d));
  }
  return days;
}

// Which locations are off on `date`. Returns { all, locations } where `all` is
// true when a company-wide holiday covers the day, and `locations` holds the
// ids of branches with their own holiday that day.
async function holidayScopeOn(businessId, date) {
  const rows = await prisma.holiday.findMany({
    where: { businessId, startDate: { lte: date }, endDate: { gte: date } },
    select: { locationId: true },
  });
  return {
    all: rows.some(r => r.locationId === null),
    locations: new Set(rows.filter(r => r.locationId).map(r => r.locationId)),
  };
}

router.get('/holiday', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const q = req.query;
    if (q.location_id && !PL_UUID.test(String(q.location_id))) {
      return res.status(400).json({ title: 'location_id must be a UUID.', status: 400 });
    }
    const from = q.from ? parseDay(q.from) : null;
    const to = q.to ? parseDay(q.to) : null;
    for (const [k, v, p] of [['from', q.from, from], ['to', q.to, to]]) {
      if (v && !p) return res.status(400).json({ title: `${k} must be a real YYYY-MM-DD date.`, status: 400 });
    }
    const rows = await prisma.holiday.findMany({
      where: {
        businessId,
        // A location filter still includes the company-wide holidays.
        ...(q.location_id && { OR: [{ locationId: null }, { locationId: String(q.location_id) }] }),
        ...(to && { startDate: { lte: to } }),
        ...(from && { endDate: { gte: from } }),
      },
      include: { location: { select: { name: true } } },
      orderBy: { startDate: 'desc' },
      take: 1000,
    });
    res.json(rows.map(serializeHoliday));
  } catch (err) { next(err); }
});

router.post('/holiday', auth, requireRole('owner', 'manager'), validate(HolidaySchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    if (b.location_id) {
      const loc = await prisma.location.findFirst({ where: { id: b.location_id, businessId }, select: { id: true } });
      if (!loc) return res.status(404).json({ title: 'Location not found', status: 404 });
    }
    const created = await prisma.holiday.create({
      data: {
        businessId, name: b.name,
        startDate: new Date(b.start_date), endDate: new Date(b.end_date),
        locationId: b.location_id || null, note: b.note || null,
      },
      include: { location: { select: { name: true } } },
    });
    res.status(201).json(serializeHoliday(created));
  } catch (err) { next(err); }
});

router.put('/holiday/:id', auth, requireRole('owner', 'manager'), validate(HolidaySchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const existing = await prisma.holiday.findFirst({ where: { id: req.params.id, businessId }, select: { id: true } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    if (b.location_id) {
      const loc = await prisma.location.findFirst({ where: { id: b.location_id, businessId }, select: { id: true } });
      if (!loc) return res.status(404).json({ title: 'Location not found', status: 404 });
    }
    const updated = await prisma.holiday.update({
      where: { id: req.params.id },
      data: {
        name: b.name, startDate: new Date(b.start_date), endDate: new Date(b.end_date),
        locationId: b.location_id || null, note: b.note || null,
      },
      include: { location: { select: { name: true } } },
    });
    res.json(serializeHoliday(updated));
  } catch (err) { next(err); }
});

router.delete('/holiday/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const h = await prisma.holiday.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true } });
    if (!h) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.holiday.delete({ where: { id: req.params.id } });
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
    work_start: s.workStart, grace_minutes: s.graceMinutes, timezone: s.timezone,
    standard_hours: parseFloat(s.standardHours), half_day_hours: parseFloat(s.halfDayHours),
    overtime_rate: parseFloat(s.overtimeRate), working_days: s.workingDays,
    late_deduction: parseFloat(s.lateDeduction), absent_deduction: s.absentDeduction,
    // ── The reference's Settings tab, grouped as it presents them ──
    leave_ref_prefix: s.leaveRefPrefix || '', leave_instructions: s.leaveInstructions || '',
    payroll_ref_prefix: s.payrollRefPrefix || '', payroll_word_format: s.payrollWordFormat,
    location_required: s.locationRequired,
    grace_before_checkin: s.graceBeforeCheckin, grace_after_checkin: s.graceMinutes,
    grace_before_checkout: s.graceBeforeCheckout, grace_after_checkout: s.graceAfterCheckout,
    commission_excludes_tax: s.commissionExcludesTax,
    todos_id_prefix: s.todosIdPrefix || '',
    emp_shift: empShift,
    payslip: {
      show_attendance: s.showAttendance, show_overtime: s.showOvertime, show_leave: s.showLeave,
      show_advance: s.showAdvance, show_bonus: s.showBonus, show_incentive: s.showIncentive,
      show_deduction_breakdown: s.showDeductionBreakdown,
    },
  };
}
// employeeId -> the shift they work. An employee can hold more than one
// assignment; the first by name wins for the purposes of "their shift".
async function empShiftMap(businessId) {
  const rows = await prisma.shiftAssignment.findMany({
    where: { businessId },
    include: { shift: true },
    orderBy: { shift: { name: 'asc' } },
  });
  const map = {};
  for (const a of rows) {
    if (map[a.employeeId]) continue;
    map[a.employeeId] = {
      shift_id: a.shiftId, name: a.shift.name, type: a.shift.type,
      start: a.shift.startTime, end: a.shift.endTime,
      weekly_off_days: a.shift.weeklyOffDays, auto_clock_out: a.shift.autoClockOut,
    };
  }
  return map;
}

async function shiftForEmployee(businessId, employeeId) {
  const a = await prisma.shiftAssignment.findFirst({
    where: { businessId, employeeId }, include: { shift: true }, orderBy: { shift: { name: 'asc' } },
  });
  return a?.shift || null;
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
    const b = req.body;
    const s = await prisma.hrmSettings.update({
      where: { businessId: req.user.business_id },
      data: {
        ...(b.work_start       !== undefined && { workStart: b.work_start }),
        ...(b.grace_minutes    !== undefined && { graceMinutes: b.grace_minutes }),
        ...(b.timezone         !== undefined && { timezone: b.timezone }),
        ...(b.standard_hours   !== undefined && { standardHours: b.standard_hours }),
        ...(b.half_day_hours   !== undefined && { halfDayHours: b.half_day_hours }),
        ...(b.overtime_rate    !== undefined && { overtimeRate: b.overtime_rate }),
        ...(b.working_days     !== undefined && { workingDays: b.working_days }),
        ...(b.late_deduction   !== undefined && { lateDeduction: b.late_deduction }),
        ...(b.absent_deduction !== undefined && { absentDeduction: b.absent_deduction }),
        ...(b.leave_ref_prefix   !== undefined && { leaveRefPrefix: b.leave_ref_prefix || null }),
        ...(b.leave_instructions !== undefined && { leaveInstructions: b.leave_instructions || null }),
        ...(b.payroll_ref_prefix !== undefined && { payrollRefPrefix: b.payroll_ref_prefix || null }),
        ...(b.payroll_word_format !== undefined && { payrollWordFormat: b.payroll_word_format }),
        ...(b.location_required  !== undefined && { locationRequired: b.location_required }),
        // "grace after checkin" is the existing graceMinutes.
        ...(b.grace_after_checkin  !== undefined && { graceMinutes: b.grace_after_checkin }),
        ...(b.grace_before_checkin !== undefined && { graceBeforeCheckin: b.grace_before_checkin }),
        ...(b.grace_before_checkout !== undefined && { graceBeforeCheckout: b.grace_before_checkout }),
        ...(b.grace_after_checkout !== undefined && { graceAfterCheckout: b.grace_after_checkout }),
        ...(b.commission_excludes_tax !== undefined && { commissionExcludesTax: b.commission_excludes_tax }),
        ...(b.todos_id_prefix    !== undefined && { todosIdPrefix: b.todos_id_prefix || null }),
      },
    });
    res.json(serializeSettings(s, await empShiftMap(req.user.business_id)));
  } catch (err) { next(err); }
});

// ── Shift templates ─────────────────────────────────────────────────────────
// Named, reusable shifts that employees are assigned to. Distinct from the
// per-date RosterShift, which schedules a specific person on a specific day.
function serializeShiftTemplate(t) {
  return {
    id: t.id, name: t.name, type: t.type,
    start_time: t.startTime, end_time: t.endTime,
    weekly_off_days: t.weeklyOffDays || [],
    auto_clock_out: t.autoClockOut,
    employee_ids: (t.assignments || []).map(a => a.employeeId),
    employees: (t.assignments || []).map(a => ({ id: a.employeeId, name: a.employee?.name || '' })),
    employee_count: (t.assignments || []).length,
  };
}
const templateInclude = { assignments: { include: { employee: { select: { name: true } } } } };

// A flexible shift keeps no times, so switching to it must clear them rather
// than leave stale values behind.
const shiftData = (b) => ({
  name: b.name, type: b.type,
  startTime: b.type === 'flexible' ? null : b.start_time,
  endTime: b.type === 'flexible' ? null : b.end_time,
  weeklyOffDays: b.weekly_off_days || [],
  autoClockOut: !!b.auto_clock_out,
});

router.get('/shift-template', auth, async (req, res, next) => {
  try {
    const rows = await prisma.shiftTemplate.findMany({
      where: { businessId: req.user.business_id },
      include: templateInclude, orderBy: { name: 'asc' },
    });
    res.json(rows.map(serializeShiftTemplate));
  } catch (err) { next(err); }
});

router.post('/shift-template', auth, requireRole('owner', 'manager'), validate(ShiftTemplateSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const clash = await prisma.shiftTemplate.findUnique({
      where: { businessId_name: { businessId, name: req.body.name } }, select: { id: true },
    });
    if (clash) {
      return res.status(409).json({
        title: `A shift called "${req.body.name}" already exists.`,
        status: 409, code: 'SHIFT_EXISTS', shift_id: clash.id,
      });
    }
    const created = await prisma.shiftTemplate.create({
      data: { businessId, ...shiftData(req.body) }, include: templateInclude,
    });
    res.status(201).json(serializeShiftTemplate(created));
  } catch (err) { next(err); }
});

router.put('/shift-template/:id', auth, requireRole('owner', 'manager'), validate(ShiftTemplateSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const existing = await prisma.shiftTemplate.findFirst({ where: { id: req.params.id, businessId }, select: { id: true } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const clash = await prisma.shiftTemplate.findUnique({
      where: { businessId_name: { businessId, name: req.body.name } }, select: { id: true },
    });
    if (clash && clash.id !== req.params.id) {
      return res.status(409).json({ title: `A shift called "${req.body.name}" already exists.`, status: 409, code: 'SHIFT_EXISTS' });
    }
    const updated = await prisma.shiftTemplate.update({
      where: { id: req.params.id }, data: shiftData(req.body), include: templateInclude,
    });
    res.json(serializeShiftTemplate(updated));
  } catch (err) { next(err); }
});

router.delete('/shift-template/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const t = await prisma.shiftTemplate.findFirst({ where: { id: req.params.id, businessId }, select: { id: true } });
    if (!t) return res.status(404).json({ title: 'Not found', status: 404 });
    const assigned = await prisma.shiftAssignment.count({ where: { shiftId: req.params.id } });
    if (assigned > 0) {
      return res.status(422).json({
        title: `In use by ${assigned} employee(s). Unassign them first.`,
        status: 422, code: 'SHIFT_IN_USE', assigned,
      });
    }
    // Attendance keeps its shift_id as a historical record; ON DELETE SET NULL.
    await prisma.shiftTemplate.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// Assign Users — the whole roster for this shift, replacing what was there.
router.put('/shift-template/:id/assign', auth, requireRole('owner', 'manager'), validate(ShiftAssignSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const t = await prisma.shiftTemplate.findFirst({ where: { id: req.params.id, businessId }, select: { id: true } });
    if (!t) return res.status(404).json({ title: 'Not found', status: 404 });
    const ids = [...new Set(req.body.employee_ids)];
    if (ids.length) {
      const valid = await prisma.employee.count({ where: { businessId, id: { in: ids } } });
      if (valid !== ids.length) return res.status(404).json({ title: 'One or more employees were not found.', status: 404 });
    }
    await prisma.$transaction([
      prisma.shiftAssignment.deleteMany({ where: { shiftId: req.params.id } }),
      ...(ids.length ? [prisma.shiftAssignment.createMany({
        data: ids.map(employeeId => ({ businessId, shiftId: req.params.id, employeeId })),
        skipDuplicates: true,
      })] : []),
    ]);
    const fresh = await prisma.shiftTemplate.findUnique({ where: { id: req.params.id }, include: templateInclude });
    res.json(serializeShiftTemplate(fresh));
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

// `nowHM` must be the wall clock in the BUSINESS timezone — the same clock the
// clock-in was written with. There is deliberately no default: falling back to
// the container clock (UTC) against an EAT clock-in makes the span negative,
// wrap past midnight and report ~21h on every open row.
function decorateAtt(rec, empName, nowHM) {
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

async function clockStatusFor(businessId, employeeId, at, settings, shift) {
  const sh = shift !== undefined ? shift : await shiftForEmployee(businessId, employeeId);
  if (sh && sh.type === 'flexible') return 'present';
  const s = settings || await loadSettings(businessId);
  // The shift's own start wins over the business default — it used to be read
  // and then ignored, so everyone was measured against one company-wide time.
  const start = sh?.startTime || s.workStart;
  return hm2min(at) > hm2min(start) + s.graceMinutes ? 'late' : 'present';
}

router.get('/attendance', auth, async (req, res, next) => {
  try {
    const settings = await loadSettings(req.user.business_id);
    const nowHM = tzParts(settings.timezone).hm;
    const rows = await prisma.attendance.findMany({
      where: { businessId: req.user.business_id },
      include: { employee: { select: { name: true } } },
      orderBy: { date: 'desc' }, take: 300,
    });
    res.json(rows.map(r => decorateAtt(r, r.employee?.name || '—', nowHM)));
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
    const shift = await shiftForEmployee(businessId, emp.id);
    let rec;
    if (!existing || (!existing.clockIn)) {
      const status = await clockStatusFor(businessId, emp.id, at, settings, shift);
      // shiftId is recorded so a later reassignment cannot reinterpret history.
      const data = { clockIn: at, status, shiftId: shift?.id || null, ipAddress: req.ip || null,
        ...(req.body.note && { clockInNote: req.body.note }) };
      rec = existing
        ? await prisma.attendance.update({ where: { id: existing.id }, data })
        : await prisma.attendance.create({ data: { businessId, employeeId: emp.id, date, ...data } });
    } else if (!existing.clockOut) {
      rec = await prisma.attendance.update({ where: { id: existing.id }, data: { clockOut: at, ...(req.body.note && { clockOutNote: req.body.note }) } });
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

// Close forgotten clock-ins. A shift with auto_clock_out set says "this person
// will not remember to clock out", so the open row is closed at the shift end
// rather than left running — which, before this, meant the hours climbed all
// night and fed straight into payroll overtime.
router.post('/attendance/auto-clock-out', auth, requireRole('owner', 'manager'),
  validate(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().nullable(),
  })), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const settings = await loadSettings(businessId);
    const date = new Date(req.body.date || tzParts(settings.timezone).date);
    // Only shifts that opted in, and only rows still open.
    const assignments = await prisma.shiftAssignment.findMany({
      where: { businessId, shift: { autoClockOut: true, type: 'fixed', endTime: { not: null } } },
      include: { shift: { select: { id: true, endTime: true } } },
    });
    if (!assignments.length) return res.json({ closed: 0 });
    const endFor = new Map(assignments.map(a => [a.employeeId, a.shift.endTime]));
    const open = await prisma.attendance.findMany({
      where: { businessId, date, clockIn: { not: null }, clockOut: null, employeeId: { in: [...endFor.keys()] } },
      select: { id: true, employeeId: true },
    });
    let closed = 0;
    for (const rec of open) {
      await prisma.attendance.update({
        where: { id: rec.id },
        data: { clockOut: endFor.get(rec.employeeId), clockOutNote: 'Auto clocked out at shift end' },
      });
      closed++;
    }
    res.json({ closed });
  } catch (err) { next(err); }
});

router.post('/attendance/auto-absent', auth, requireRole('owner', 'manager'),
  validate(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().nullable(),
  })), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const settings = await loadSettings(businessId);
    const date = new Date(req.body.date || tzParts(settings.timezone).date);
    const [emps, present, shifts, onLeave, holiday] = await Promise.all([
      prisma.employee.findMany({ where: { businessId, status: 'active' }, select: { id: true, locationId: true } }),
      prisma.attendance.findMany({ where: { businessId, date }, select: { employeeId: true } }),
      prisma.shiftAssignment.findMany({ where: { businessId }, include: { shift: { select: { type: true, weeklyOffDays: true } } } }),
      // Someone on approved leave is not absent — we already know why they are out.
      onLeaveOn(businessId, date),
      // Nor is anyone absent on a company holiday, or on their branch's.
      holidayScopeOn(businessId, date),
    ]);
    if (holiday.all) {
      return res.json({ added: 0, skipped_on_leave: 0, skipped_holiday: emps.length, holiday: true });
    }
    const has = new Set(present.map(p => p.employeeId));
    const flexible = new Set(shifts.filter(a => a.shift.type === 'flexible').map(a => a.employeeId));
    // The shift's weekly day off — a Sunday is not an absence. 0 = Sunday.
    const dow = date.getUTCDay();
    const weeklyOff = new Set(shifts.filter(a => (a.shift.weeklyOffDays || []).includes(dow)).map(a => a.employeeId));
    const onHoliday = (e) => e.locationId && holiday.locations.has(e.locationId);
    const toAdd = emps.filter(e => !has.has(e.id) && !flexible.has(e.id) && !weeklyOff.has(e.id) && !onLeave.has(e.id) && !onHoliday(e));
    if (toAdd.length) {
      await prisma.attendance.createMany({ data: toAdd.map(e => ({ businessId, employeeId: e.id, date, status: 'absent' })), skipDuplicates: true });
    }
    res.json({
      added: toAdd.length,
      skipped_on_leave: emps.filter(e => onLeave.has(e.id) && !has.has(e.id)).length,
      skipped_holiday: emps.filter(e => onHoliday(e) && !has.has(e.id)).length,
      skipped_weekly_off: emps.filter(e => weeklyOff.has(e.id) && !has.has(e.id)).length,
    });
  } catch (err) { next(err); }
});

// ── Attendance summary (monthly metrics + pay derivation) ──
async function buildSummary(emp, records, settings, holidayCount = 0) {
  const present = records.filter(r => r.status === 'present').length;
  const late = records.filter(r => r.status === 'late').length;
  const absent = records.filter(r => r.status === 'absent' || !r.clockIn).length;
  const daysWorked = records.filter(r => r.clockIn).length;
  const nowHM = tzParts(settings.timezone).hm;
  const totalHours = records.reduce((s, r) => s + decorateAtt(r, '', nowHM).hours, 0);
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
    present, late, absent, days_worked: daysWorked, holidays: holidayCount,
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
      prisma.employee.findMany({ where: { businessId }, select: { id: true, name: true, salary: true, locationId: true } }),
      prisma.attendance.findMany({ where: { businessId, date: { gte: start, lt: end } } }),
    ]);
    const byEmp = {};
    records.forEach(r => { (byEmp[r.employeeId] ||= []).push(r); });
    // One query for the month, then a per-location count — a branch holiday
    // only applies to staff at that branch.
    const lastDay = new Date(end); lastDay.setUTCDate(lastDay.getUTCDate() - 1);
    const holCache = new Map();
    const holsFor = async (locId) => {
      const key = locId || 'all';
      if (!holCache.has(key)) holCache.set(key, (await holidayDays(businessId, start, lastDay, locId ?? null)).size);
      return holCache.get(key);
    };
    const out = [];
    for (const e of emps) out.push(await buildSummary(e, byEmp[e.id] || [], settings, await holsFor(e.locationId)));
    res.json(out);
  } catch (err) { next(err); }
});

router.get('/attendance-summary/:empId', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const { m, start, end } = monthRange(req.query.month);
    const emp = await prisma.employee.findFirst({ where: { id: req.params.empId, businessId }, select: { id: true, name: true, salary: true, locationId: true } });
    if (!emp) return res.status(404).json({ title: 'Not found', status: 404 });
    const settings = await loadSettings(businessId); settings._month = m;
    const records = await prisma.attendance.findMany({ where: { businessId, employeeId: emp.id, date: { gte: start, lt: end } } });
    const lastDay = new Date(end); lastDay.setUTCDate(lastDay.getUTCDate() - 1);
    const hols = await holidayDays(businessId, start, lastDay, emp.locationId ?? null);
    res.json(await buildSummary(emp, records, settings, hols.size));
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
    // `balance` is what the user may still apply for, so pending requests count
    // against it — the admission test below uses exactly this figure. Showing
    // `entitled - taken` here meant the modal could read "12 available" and the
    // save then 422 with "Only 0 available".
    return { type: t.name, paid: t.paid, entitled, taken, pending, balance: entitled - taken - pending };
  });
}
function serializeLeave(l, empName) {
  return {
    id: l.id, reference_no: l.referenceNo || null, employee_id: l.employeeId, employee_name: empName,
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
      data: { businessId, name: req.body.name, defaultDays: req.body.default_days, accrues: req.body.accrues, paid: req.body.paid },
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
    const bal = computeBalances(emp, types, leaves, overrideMap).find(b => b.type === req.body.type);
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
    const [emps, types, leaves, overrides] = await Promise.all([
      prisma.employee.findMany({ where: { businessId }, select: { id: true, name: true, joinedAt: true } }),
      prisma.leaveType.findMany({ where: { businessId } }),
      // Only the statuses that move a balance — rejected rows are dead weight.
      prisma.leave.findMany({ where: { businessId, status: { in: ['approved', 'pending'] } } }),
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

// ── Todos ────────────────────────────────────────────────────────────────────────
function serializeTodo(t) {
  return {
    id: t.id, reference_no: t.referenceNo || null, title: t.title, assigned_to: t.assignedTo, assigned_name: t.assignee?.name || '—',
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
    const b = req.body, businessId = req.user.business_id;
    const tset = await loadSettings(businessId);
    const todo = await prisma.hrTodo.create({
      data: { businessId, title: b.title, referenceNo: await nextRef(prisma.hrTodo, businessId, tset.todosIdPrefix), assignedTo: b.assigned_to || null, priority: b.priority || 'medium', dueDate: b.due ? new Date(b.due) : null },
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
// Gross = the freeform earning buckets plus every earning component the run
// applied. Defined once: the serializer and the group's pay step both use it,
// and when they each derived it the pay step forgot the component lines and
// posted an unbalanced journal.
function grossOf(p) {
  const n = (v) => parseFloat(v || 0);
  return +(n(p.basic) + n(p.allowance) + n(p.overtime) + n(p.bonus) + n(p.incentive)
    + (p.lines || []).filter(l => l.type === 'earning').reduce((s, l) => s + n(l.amount), 0)).toFixed(2);
}

function serializePayroll(p) {
  return {
    id: p.id, employee_id: p.employeeId, employee_name: p.employee?.name || '—', month: p.month,
    basic: parseFloat(p.basic || 0), allowance: parseFloat(p.allowance || 0), overtime: parseFloat(p.overtime || 0),
    bonus: parseFloat(p.bonus || 0), incentive: parseFloat(p.incentive || 0), deduction: parseFloat(p.deduction || 0),
    advance_recovered: parseFloat(p.advanceRecovered || 0),
    statutory_country: p.statutoryCountry || null,
    paye: parseFloat(p.paye || 0), nssf: parseFloat(p.nssf || 0), shif: parseFloat(p.shif || 0),
    housing_levy: parseFloat(p.housingLevy || 0), statutory_total: parseFloat(p.statutoryTotal || 0),
    lines: (p.lines || []).map(l => ({ description: l.description, type: l.type, amount: parseFloat(l.amount || 0) })),
    gross: grossOf(p),
    net: parseFloat(p.net || 0), status: p.status,
    reference_no: p.referenceNo || null,
    location_id: p.locationId, location_name: p.location?.name || '',
    department: p.employee?.department || '', designation: p.employee?.designation || '',
    added_by: p.createdBy?.name || '', group_id: p.groupId,
    payment_status: p.status === 'paid' ? 'paid' : 'unpaid',
    paid_at: p.paidAt ? p.paidAt.toISOString() : null,
    created_at: p.createdAt ? p.createdAt.toISOString() : null,
  };
}

// prefix + zero-padded sequence, per business. Allocated inside the caller's
// transaction where there is one; the unique index is the real guard.
async function nextRef(model, businessId, prefix) {
  const p = prefix || '';
  const last = await model.findFirst({
    where: { businessId, referenceNo: { startsWith: p } },
    orderBy: { referenceNo: 'desc' }, select: { referenceNo: true },
  });
  const n = last ? (parseInt(String(last.referenceNo).slice(p.length), 10) || 0) + 1 : 1;
  return `${p}${String(n).padStart(4, '0')}`;
}

// YYYY/NNNN per business per year. Allocated inside the caller's transaction,
// and the unique index on (business_id, reference_no) is the real guard.
async function nextPayrollRef(tx, businessId, month, prefix) {
  const head = `${prefix || ''}${String(month).slice(0, 4)}/`;
  const last = await tx.payroll.findFirst({
    where: { businessId, referenceNo: { startsWith: head } },
    orderBy: { referenceNo: 'desc' }, select: { referenceNo: true },
  });
  const n = last ? (parseInt(String(last.referenceNo).slice(head.length), 10) || 0) + 1 : 1;
  return `${head}${String(n).padStart(4, '0')}`;
}

// ── Pay components ──────────────────────────────────────────────────────────
function serializeComponent(c) {
  return {
    id: c.id, description: c.description, type: c.type,
    amount_type: c.amountType, amount: parseFloat(c.amount || 0),
    applicable_date: c.applicableDate ? c.applicableDate.toISOString().slice(0, 10) : null,
    employee_id: c.employeeId, employee_name: c.employee?.name || 'All employees',
  };
}

// The components that apply to one employee for one month: theirs plus the
// business-wide ones, effective on or before the month end.
async function componentsFor(businessId, employeeId, month) {
  const { end } = monthRange(month);
  const monthEnd = new Date(end); monthEnd.setUTCDate(monthEnd.getUTCDate() - 1);
  return prisma.payComponent.findMany({
    where: {
      businessId,
      OR: [{ employeeId: null }, { employeeId }],
      AND: [{ OR: [{ applicableDate: null }, { applicableDate: { lte: monthEnd } }] }],
    },
    orderBy: { description: 'asc' },
  });
}

// Resolve them into money against a basic. A percentage is of basic.
function applyComponents(components, basic) {
  const lines = components.map(c => ({
    description: c.description,
    type: c.type,
    amount: +(c.amountType === 'percentage'
      ? basic * parseFloat(c.amount || 0) / 100
      : parseFloat(c.amount || 0)).toFixed(2),
  })).filter(l => l.amount > 0);
  return {
    lines,
    earnings: +lines.filter(l => l.type === 'earning').reduce((s, l) => s + l.amount, 0).toFixed(2),
    deductions: +lines.filter(l => l.type === 'deduction').reduce((s, l) => s + l.amount, 0).toFixed(2),
  };
}

router.get('/pay-component', auth, async (req, res, next) => {
  try {
    const rows = await prisma.payComponent.findMany({
      where: { businessId: req.user.business_id },
      include: { employee: { select: { name: true } } },
      orderBy: [{ type: 'asc' }, { description: 'asc' }],
    });
    res.json(rows.map(serializeComponent));
  } catch (err) { next(err); }
});

router.post('/pay-component', auth, requireRole('owner', 'manager'), validate(PayComponentSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    if (b.employee_id) {
      const emp = await prisma.employee.findFirst({ where: { id: b.employee_id, businessId }, select: { id: true } });
      if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    }
    const created = await prisma.payComponent.create({
      data: {
        businessId, description: b.description, type: b.type,
        amountType: b.amount_type, amount: b.amount,
        applicableDate: b.applicable_date ? new Date(b.applicable_date) : null,
        employeeId: b.employee_id || null,
      },
      include: { employee: { select: { name: true } } },
    });
    res.status(201).json(serializeComponent(created));
  } catch (err) { next(err); }
});

router.put('/pay-component/:id', auth, requireRole('owner', 'manager'), validate(PayComponentSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const existing = await prisma.payComponent.findFirst({ where: { id: req.params.id, businessId }, select: { id: true } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    if (b.employee_id) {
      const emp = await prisma.employee.findFirst({ where: { id: b.employee_id, businessId }, select: { id: true } });
      if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    }
    const updated = await prisma.payComponent.update({
      where: { id: req.params.id },
      data: {
        description: b.description, type: b.type, amountType: b.amount_type, amount: b.amount,
        applicableDate: b.applicable_date ? new Date(b.applicable_date) : null,
        employeeId: b.employee_id || null,
      },
      include: { employee: { select: { name: true } } },
    });
    res.json(serializeComponent(updated));
  } catch (err) { next(err); }
});

router.delete('/pay-component/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const c = await prisma.payComponent.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true } });
    if (!c) return res.status(404).json({ title: 'Not found', status: 404 });
    // Runs that already applied it keep their own PayrollLine rows, so history
    // survives the definition being retired.
    await prisma.payComponent.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.get('/payroll', auth, async (req, res, next) => {
  try {
    const q = req.query;
    const rows = await prisma.payroll.findMany({
      where: {
        businessId: req.user.business_id,
        ...(q.month && { month: String(q.month) }),
        ...(q.employee_id && PL_UUID.test(String(q.employee_id)) && { employeeId: String(q.employee_id) }),
        ...(q.location_id && PL_UUID.test(String(q.location_id)) && { locationId: String(q.location_id) }),
        ...(q.department && { employee: { department: String(q.department) } }),
        ...(q.designation && { employee: { designation: String(q.designation) } }),
      },
      include: { employee: { select: { name: true, department: true, designation: true } }, lines: true, location: { select: { name: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }, take: 1000,
    });
    res.json(rows.map(serializePayroll));
  } catch (err) { next(err); }
});

router.post('/payroll', auth, requireRole('owner', 'manager'), validate(PayrollSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const emp = await prisma.employee.findFirst({ where: { id: b.employee_id, businessId }, select: { id: true, name: true, joinedAt: true, locationId: true } });
    if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });

    // Paying a month twice also posts the GL journal twice, so refuse it up
    // front for a readable error. The unique index is the real guard.
    const already = await prisma.payroll.findFirst({
      where: { businessId, employeeId: emp.id, month: b.month }, select: { id: true },
    });
    if (already) {
      return res.status(409).json({
        title: `${emp.name} has already been paid for ${b.month}.`,
        status: 409, code: 'PAYROLL_EXISTS', payroll_id: already.id,
      });
    }

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
    // Named components resolved for this employee and month, on top of the
    // freeform amounts typed on the run itself.
    const comps = applyComponents(await componentsFor(businessId, emp.id, b.month), basic);
    const gross = +(basic + b.allowance + b.overtime + b.bonus + b.incentive + comps.earnings).toFixed(2);
    const freeformDeduction = +(b.deduction + comps.deductions).toFixed(2);
    // Statutory deductions (PAYE/NSSF/SHIF/Housing) computed from gross, on top of
    // the freeform deduction (advances etc.). No country → no statutory (launch markets).
    const stat = b.statutory_country && b.statutory_country !== 'none'
      ? statutory.compute(b.statutory_country, gross)
      : null;
    const statutoryTotal = stat ? stat.total_statutory : 0;
    const pset = await loadSettings(businessId);

    const payroll = await prisma.$transaction(async (tx) => {
      // Recover outstanding advances (oldest first) up to what was asked for.
      // This is deliberately NOT taken out of `deduction`: those are two
      // different instructions, and conflating them meant a tax deduction
      // silently settled the employee's loan instead.
      let remaining = b.advance_recovery, recovered = 0;
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
      recovered = +recovered.toFixed(2);
      // Net is reduced by what was ACTUALLY recovered — asking to recover more
      // than is outstanding must not over-deduct the employee.
      const net = +(gross - freeformDeduction - recovered - statutoryTotal).toFixed(2);
      const created = await tx.payroll.create({
        data: {
          businessId, employeeId: emp.id, month: b.month, basic, allowance: b.allowance,
          overtime: b.overtime, bonus: b.bonus, incentive: b.incentive, deduction: freeformDeduction,
          advanceRecovered: recovered,
          ...(comps.lines.length && { lines: { create: comps.lines } }),
          statutoryCountry: stat ? stat.country : null,
          paye: stat ? stat.paye : 0, nssf: stat ? stat.nssf : 0, shif: stat ? stat.shif : 0,
          housingLevy: stat ? stat.housing_levy : 0, statutoryTotal,
          net,
          // A single run is committed immediately, as before. A group builds
          // drafts and commits them together — see POST /payroll-group.
          status: b.status || 'paid',
          paidAt: (b.status || 'paid') === 'paid' ? new Date() : null,
          referenceNo: await nextPayrollRef(tx, businessId, b.month, pset.payrollRefPrefix),
          locationId: emp.locationId || null,
          createdById: req.user.id,
          groupId: b.group_id || null,
        },
        include: { employee: { select: { name: true } }, lines: true },
      });
      // GL: gross wages expensed, net paid in cash, freeform + statutory withheld as payables.
      // postPayroll's contract is `deduction = advanceRecovered + withholding`,
      // so hand it the combined figure to keep the journal balanced.
      // A draft commits no money, so it posts nothing until it is paid.
      if (created.status === 'paid') {
        await accounting.postPayroll(tx, { businessId, gross, net, deduction: +(freeformDeduction + recovered).toFixed(2), advanceRecovered: recovered, statutory: statutoryTotal, sourceId: created.id, createdById: req.user.id });
      }
      return created;
    });
    res.status(201).json({ ...serializePayroll(payroll), ...(proration && { proration }) });
  } catch (err) { next(err); }
});

// ── Payroll groups ──────────────────────────────────────────────────────────
// A named batch: build drafts for several employees in one step, review the
// total, then commit. Nothing hits the GL until the group is paid.
function serializeGroup(g) {
  const rows = g.payrolls || [];
  return {
    id: g.id, name: g.name, month: g.month,
    status: g.status, payment_status: g.paymentStatus,
    total_gross: +rows.reduce((s, p) => s + grossOf(p), 0).toFixed(2),
    total_net: +rows.reduce((s, p) => s + parseFloat(p.net || 0), 0).toFixed(2),
    employees: rows.length,
    added_by: g.createdBy?.name || '',
    location_id: g.locationId, location_name: g.location?.name || 'All locations',
    created_at: g.createdAt ? g.createdAt.toISOString() : null,
    paid_at: g.paidAt ? g.paidAt.toISOString() : null,
  };
}
const groupInclude = {
  payrolls: { include: { lines: true } }, createdBy: { select: { name: true } }, location: { select: { name: true } },
};

router.get('/payroll-group', auth, async (req, res, next) => {
  try {
    const rows = await prisma.payrollGroup.findMany({
      where: { businessId: req.user.business_id },
      include: groupInclude, orderBy: { createdAt: 'desc' }, take: 500,
    });
    res.json(rows.map(serializeGroup));
  } catch (err) { next(err); }
});

router.post('/payroll-group', auth, requireRole('owner', 'manager'), validate(PayrollGroupSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const ids = [...new Set(b.employee_ids)];
    const emps = await prisma.employee.findMany({
      where: { businessId, id: { in: ids } },
      select: { id: true, name: true, salary: true, locationId: true, joinedAt: true },
    });
    if (emps.length !== ids.length) return res.status(404).json({ title: 'One or more employees were not found.', status: 404 });

    // Anyone already paid for this month would violate the one-per-month rule.
    const clash = await prisma.payroll.findMany({
      where: { businessId, month: b.month, employeeId: { in: ids } },
      include: { employee: { select: { name: true } } },
    });
    if (clash.length) {
      return res.status(409).json({
        title: `Already has a payroll for ${b.month}: ${clash.map(c => c.employee?.name).join(', ')}.`,
        status: 409, code: 'PAYROLL_EXISTS',
      });
    }

    const gSettings = await loadSettings(businessId);
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.payrollGroup.create({
        data: {
          businessId, name: b.name, month: b.month,
          locationId: b.location_id || null, createdById: req.user.id,
        },
      });
      for (const emp of emps) {
        const basic = parseFloat(emp.salary || 0);
        const comps = applyComponents(await componentsFor(businessId, emp.id, b.month), basic);
        const gross = +(basic + comps.earnings).toFixed(2);
        const net = +(gross - comps.deductions).toFixed(2);
        await tx.payroll.create({
          data: {
            businessId, employeeId: emp.id, month: b.month, basic,
            deduction: comps.deductions, net,
            status: 'draft', groupId: g.id,
            referenceNo: await nextPayrollRef(tx, businessId, b.month, gSettings.payrollRefPrefix),
            locationId: emp.locationId || null, createdById: req.user.id,
            ...(comps.lines.length && { lines: { create: comps.lines } }),
          },
        });
      }
      return g;
    });
    const full = await prisma.payrollGroup.findUnique({ where: { id: group.id }, include: groupInclude });
    res.status(201).json(serializeGroup(full));
  } catch (err) { next(err); }
});

// Commit the batch: every draft becomes paid and posts its journal here, so a
// group can be assembled and reviewed before any money moves.
router.put('/payroll-group/:id/pay', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const g = await prisma.payrollGroup.findFirst({
      where: { id: req.params.id, businessId }, include: { payrolls: { include: { lines: true } } },
    });
    if (!g) return res.status(404).json({ title: 'Not found', status: 404 });
    if (g.paymentStatus === 'paid') return res.status(409).json({ title: 'This group has already been paid.', status: 409, code: 'ALREADY_PAID' });

    const drafts = g.payrolls.filter(p => p.status === 'draft');
    if (!drafts.length) return res.status(400).json({ title: 'Nothing left to pay in this group.', status: 400 });

    const paidAt = new Date();
    await prisma.$transaction(async (tx) => {
      for (const p of drafts) {
        const gross = grossOf(p);
        await tx.payroll.update({ where: { id: p.id }, data: { status: 'paid', paidAt } });
        await accounting.postPayroll(tx, {
          businessId, gross, net: parseFloat(p.net),
          deduction: +(parseFloat(p.deduction) + parseFloat(p.advanceRecovered)).toFixed(2),
          advanceRecovered: parseFloat(p.advanceRecovered),
          statutory: parseFloat(p.statutoryTotal),
          sourceId: p.id, createdById: req.user.id,
        });
      }
      await tx.payrollGroup.update({
        where: { id: g.id }, data: { status: 'paid', paymentStatus: 'paid', paidAt },
      });
    });
    const full = await prisma.payrollGroup.findUnique({ where: { id: g.id }, include: groupInclude });
    res.json(serializeGroup(full));
  } catch (err) { next(err); }
});

// Only an unpaid group can be discarded — a paid one has journal entries.
router.delete('/payroll-group/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const g = await prisma.payrollGroup.findFirst({ where: { id: req.params.id, businessId }, select: { id: true, paymentStatus: true } });
    if (!g) return res.status(404).json({ title: 'Not found', status: 404 });
    if (g.paymentStatus === 'paid') {
      return res.status(422).json({ title: 'A paid group cannot be deleted — it has posted journal entries.', status: 422, code: 'GROUP_PAID' });
    }
    await prisma.$transaction([
      prisma.payroll.deleteMany({ where: { businessId, groupId: g.id, status: 'draft' } }),
      prisma.payrollGroup.delete({ where: { id: g.id } }),
    ]);
    res.json({ deleted: true });
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
      include: { employee: { include: { location: { select: { name: true } } } }, lines: true },
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
      deductions: {
        total: parseFloat(p.deduction), late: att.late_deduction, absent: att.absent_deduction,
        advance_recovered: parseFloat(p.advanceRecovered),
        items: p.lines.filter(l => l.type === 'deduction').map(l => ({ description: l.description, amount: parseFloat(l.amount) })),
      },
      earning_items: p.lines.filter(l => l.type === 'earning').map(l => ({ description: l.description, amount: parseFloat(l.amount) })),
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
