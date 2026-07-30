/**
 * HRM shared helpers — the serializers, resolvers and small utilities the route
 * modules in this directory build on, split out of a single 2,100-line
 * routes/hrm.js the way reports.js and hotel.js were.
 *
 * Everything a module needs is re-exported from here, so each one has a single
 * destructure at the top instead of a dozen relative requires.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const accounting = require('../../lib/accounting');
const statutory = require('../../lib/statutory');
const commission = require('../../lib/commission');
const wa = require('../../lib/whatsapp');
const { auth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { getBusinessSettings } = require('../../lib/businessSettings');
const {
  EmployeeSchema, EmployeeUpdateSchema, OrgUnitSchema, OrgUnitUpdateSchema, HrmSettingsSchema,
  HolidaySchema, ShiftTemplateSchema, ShiftAssignSchema, AttendanceClockSchema,
  AttendanceEntrySchema, AttendanceImportSchema,
  LeaveTypeSchema, LeaveTypeUpdateSchema, LeaveSchema, LeaveStatusSchema, LeaveOverrideSchema,
  RosterShiftSchema, RosterSwapSchema, HrAdvanceSchema, HrTodoSchema, StatusSchema,
  PayrollSchema, PayrollGroupSchema, PayComponentSchema, SalesTargetSchema, PayslipSettingsSchema,
} = require('../../validation/schemas');

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
    shift_id: rec.shiftId || null, shift_name: rec.shift?.name || '',
    ip_address: rec.ipAddress || '', clock_in_note: rec.clockInNote || '', clock_out_note: rec.clockOutNote || '',
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

// Bulk attendance import. Rows are keyed by the user's email, as the reference
// template is. One row failing (unknown email, unparseable time) is reported
// and the rest still import.
const IMPORT_TS = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/;

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

// The window a type's Max Leave Count is counted over, as [start, end).
// 'none' means never reset, which is the old cumulative-for-life behaviour and
// is now opt-in rather than the only option.
function intervalWindow(interval, fyStartMonth = 1, now = new Date()) {
  if (interval === 'none') return null;
  const y = now.getUTCFullYear();
  if (interval === 'month') {
    return [new Date(Date.UTC(y, now.getUTCMonth(), 1)), new Date(Date.UTC(y, now.getUTCMonth() + 1, 1))];
  }
  // Financial year: starts on the business's fy_start_month. If today is before
  // that month, we are still inside the year that began last calendar year.
  const startMonth = Math.min(12, Math.max(1, Number(fyStartMonth) || 1)) - 1;
  const startYear = now.getUTCMonth() >= startMonth ? y : y - 1;
  return [new Date(Date.UTC(startYear, startMonth, 1)), new Date(Date.UTC(startYear + 1, startMonth, 1))];
}

// Balances for one employee given the type catalog, their leaves, and overrides.
// `fyStart` is the business's financial-year start month (1-12).
function computeBalances(emp, types, leaves, overrideMap, fyStart = 1) {
  const mw = monthsWorked(emp.joinedAt);
  return types.map(t => {
    const base = overrideMap[t.name] != null ? overrideMap[t.name] : t.defaultDays;
    const entitled = t.accrues ? Math.min(base, Math.round((base / 12) * mw)) : base;
    // Only the leaves inside this type's counting window consume entitlement.
    const win = intervalWindow(t.countInterval, fyStart);
    const inWindow = (l) => !win || (l.fromDate >= win[0] && l.fromDate < win[1]);
    const mine = leaves.filter(l => l.type === t.name && inWindow(l));
    const taken = mine.filter(l => l.status === 'approved').reduce((s, l) => s + l.days, 0);
    const pending = mine.filter(l => l.status === 'pending').reduce((s, l) => s + l.days, 0);
    // `balance` is what the user may still apply for, so pending requests count
    // against it — the admission test below uses exactly this figure. Showing
    // `entitled - taken` here meant the modal could read "12 available" and the
    // save then 422 with "Only 0 available".
    return {
      type: t.name, paid: t.paid, entitled, taken, pending,
      balance: entitled - taken - pending,
      count_interval: t.countInterval,
      period_from: win ? win[0].toISOString().slice(0, 10) : null,
      period_to: win ? new Date(win[1].getTime() - 86400000).toISOString().slice(0, 10) : null,
    };
  });
}

function serializeLeave(l, empName) {
  return {
    id: l.id, reference_no: l.referenceNo || null, employee_id: l.employeeId, employee_name: empName,
    type: l.type, from: l.fromDate.toISOString().slice(0, 10), to: l.toDate.toISOString().slice(0, 10),
    days: l.days, reason: l.reason || '', status: l.status, approved_by: l.approvedBy || null,
  };
}

function serializeShift(s) {
  return {
    id: s.id, employee_id: s.employeeId, employee_name: s.employee?.name || '—',
    location_id: s.locationId, location_name: s.location?.name || '—',
    date: s.date.toISOString().slice(0, 10), start: s.start, end: s.end, role: s.role || '',
  };
}

const shiftInclude = { employee: { select: { name: true } }, location: { select: { name: true } } };

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

function serializeAdvance(a) {
  return {
    id: a.id, employee_id: a.employeeId, employee_name: a.employee?.name || '—',
    amount: parseFloat(a.amount || 0), date: a.advanceDate.toISOString().slice(0, 10),
    account_id: a.accountId, account_name: a.account?.name || '—',
    note: a.note || '', outstanding: parseFloat(a.outstanding || 0), status: a.status,
  };
}

const advanceInclude = { employee: { select: { name: true } }, account: { select: { name: true } } };

function serializeTodo(t) {
  return {
    id: t.id, reference_no: t.referenceNo || null, title: t.title, assigned_to: t.assignedTo, assigned_name: t.assignee?.name || '—',
    priority: t.priority, status: t.status, due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : '',
  };
}

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

module.exports = {
  DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_LEAVE_TYPES, IMPORT_TS, PL_UUID,
  advanceInclude, applyComponents, buildSummary, clockStatusFor, componentsFor,
  computeBalances, decorateAtt, empShiftMap, employeeSales, ensureLeaveTypeDefaults,
  ensureOrgDefaults, grossOf, groupInclude, hm2min, holidayDays, holidayScopeOn, hoursLabel,
  intervalWindow, loadSettings, monthRange, monthsWorked, nextPayrollRef, nextRef, onLeaveOn,
  pad2, parseDay, serializeAdvance, serializeComponent, serializeEmployee, serializeGroup,
  serializeHoliday, serializeLeave, serializePayroll, serializeSettings, serializeShift,
  serializeShiftTemplate, serializeSwap, serializeTodo, serverDate, serverNowHM, shiftData,
  shiftForEmployee, shiftInclude, swapInclude, templateInclude, tzParts, ymd,
  // Re-exported so a module needs only this one require.
  express, z, prisma, accounting, statutory, commission, wa, auth, requireRole, validate,
  getBusinessSettings, EmployeeSchema, EmployeeUpdateSchema, OrgUnitSchema,
  OrgUnitUpdateSchema, HrmSettingsSchema, HolidaySchema, ShiftTemplateSchema,
  ShiftAssignSchema, AttendanceClockSchema, AttendanceEntrySchema, AttendanceImportSchema,
  LeaveTypeSchema, LeaveTypeUpdateSchema, LeaveSchema, LeaveStatusSchema, LeaveOverrideSchema,
  RosterShiftSchema, RosterSwapSchema, HrAdvanceSchema, HrTodoSchema, StatusSchema,
  PayrollSchema, PayrollGroupSchema, PayComponentSchema, SalesTargetSchema,
  PayslipSettingsSchema,
};
