/**
 * HRM — clocking, corrections, rollups, import and the monthly summary.
 */
const {
  AttendanceClockSchema, AttendanceEntrySchema, AttendanceImportSchema, IMPORT_TS, PL_UUID,
  auth, buildSummary, clockStatusFor, decorateAtt, express, hm2min, holidayDays,
  holidayScopeOn, loadSettings, monthRange, onLeaveOn, parseDay, prisma, requireRole,
  shiftForEmployee, tzParts, validate, ymd, z,
} = require('./_shared');

const router = express.Router();

router.get('/attendance', auth, async (req, res, next) => {
  try {
    const settings = await loadSettings(req.user.business_id);
    const nowHM = tzParts(settings.timezone).hm;
    const q = req.query;
    const from = q.from ? parseDay(q.from) : null;
    const to = q.to ? parseDay(q.to) : null;
    for (const [k, v, p] of [['from', q.from, from], ['to', q.to, to]]) {
      if (v && !p) return res.status(400).json({ title: `${k} must be a real YYYY-MM-DD date.`, status: 400 });
    }
    if (q.employee_id && !PL_UUID.test(String(q.employee_id))) {
      return res.status(400).json({ title: 'employee_id must be a UUID.', status: 400 });
    }
    const rows = await prisma.attendance.findMany({
      where: {
        businessId: req.user.business_id,
        ...(q.employee_id && { employeeId: String(q.employee_id) }),
        ...((from || to) && { date: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
      },
      include: { employee: { select: { name: true } }, shift: { select: { name: true } } },
      orderBy: { date: 'desc' }, take: 1000,
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

// Admin-entered attendance — the reference's "Add latest attendance". Upserts
// on (employee, date), which is what the unique index already enforces.
router.put('/attendance/entry', auth, requireRole('owner', 'manager'), validate(AttendanceEntrySchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const emp = await prisma.employee.findFirst({ where: { id: b.employee_id, businessId }, select: { id: true, name: true } });
    if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    if (b.shift_id) {
      const sh = await prisma.shiftTemplate.findFirst({ where: { id: b.shift_id, businessId }, select: { id: true } });
      if (!sh) return res.status(404).json({ title: 'Shift not found', status: 404 });
    }
    if (b.clock_in && b.clock_out && hm2min(b.clock_out) === hm2min(b.clock_in)) {
      return res.status(422).json({ title: 'Clock out cannot equal clock in.', status: 422 });
    }
    const settings = await loadSettings(businessId);
    const date = new Date(b.date);
    const shift = b.shift_id ? await prisma.shiftTemplate.findUnique({ where: { id: b.shift_id } }) : await shiftForEmployee(businessId, emp.id);
    // Derive the verdict from the entered time unless one was stated outright.
    const status = b.status || (b.clock_in
      ? await clockStatusFor(businessId, emp.id, b.clock_in, settings, shift)
      : 'absent');
    const data = {
      clockIn: b.clock_in || null, clockOut: b.clock_out || null, status,
      shiftId: shift?.id || null, ipAddress: b.ip_address || null,
      clockInNote: b.clock_in_note || null, clockOutNote: b.clock_out_note || null,
    };
    const rec = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: emp.id, date } },
      create: { businessId, employeeId: emp.id, date, ...data },
      update: data,
      include: { shift: { select: { name: true } } },
    });
    res.json(decorateAtt(rec, emp.name, tzParts(settings.timezone).hm));
  } catch (err) { next(err); }
});

router.delete('/attendance/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const rec = await prisma.attendance.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true } });
    if (!rec) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.attendance.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.post('/attendance/import', auth, requireRole('owner', 'manager'), validate(AttendanceImportSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const settings = await loadSettings(businessId);

    // Employees are matched through the user they are linked to, then by their
    // own email — the template says "email id of the user" but a business may
    // only have set it on the employee record.
    const emails = [...new Set(req.body.rows.map(r => String(r.email).trim().toLowerCase()))];
    const [byUser, byEmp] = await Promise.all([
      prisma.employee.findMany({ where: { businessId, user: { email: { in: emails } } }, select: { id: true, name: true, user: { select: { email: true } } } }),
      prisma.employee.findMany({ where: { businessId, email: { in: emails } }, select: { id: true, name: true, email: true } }),
    ]);
    const lookup = new Map();
    for (const e of byEmp) if (e.email) lookup.set(e.email.toLowerCase(), e);
    for (const e of byUser) if (e.user?.email) lookup.set(e.user.email.toLowerCase(), e);

    const imported = [], errors = [];
    for (const [i, row] of req.body.rows.entries()) {
      const line = i + 1;
      const emp = lookup.get(String(row.email).trim().toLowerCase());
      if (!emp) { errors.push({ line, email: row.email, error: 'No employee with that email.' }); continue; }
      const mIn = IMPORT_TS.exec(String(row.clock_in_time).trim());
      if (!mIn) { errors.push({ line, email: row.email, error: 'Clock in time must be "Y-m-d H:i:s".' }); continue; }
      let clockOut = null;
      if (row.clock_out_time) {
        const mOut = IMPORT_TS.exec(String(row.clock_out_time).trim());
        if (!mOut) { errors.push({ line, email: row.email, error: 'Clock out time must be "Y-m-d H:i:s".' }); continue; }
        if (mOut[1] !== mIn[1]) { errors.push({ line, email: row.email, error: 'Clock out must fall on the same day as clock in.' }); continue; }
        clockOut = `${mOut[2]}:${mOut[3]}`;
      }
      const day = parseDay(mIn[1]);
      if (!day) { errors.push({ line, email: row.email, error: `${mIn[1]} is not a real date.` }); continue; }
      const clockIn = `${mIn[2]}:${mIn[3]}`;
      try {
        const shift = await shiftForEmployee(businessId, emp.id);
        const status = await clockStatusFor(businessId, emp.id, clockIn, settings, shift);
        const data = {
          clockIn, clockOut, status, shiftId: shift?.id || null,
          ipAddress: row.ip_address || null,
          clockInNote: row.clock_in_note || null, clockOutNote: row.clock_out_note || null,
        };
        await prisma.attendance.upsert({
          where: { employeeId_date: { employeeId: emp.id, date: day } },
          create: { businessId, employeeId: emp.id, date: day, ...data },
          update: data,
        });
        imported.push({ line, employee: emp.name, date: mIn[1] });
      } catch (e) {
        errors.push({ line, email: row.email, error: e.message || 'Could not import this row.' });
      }
    }
    res.json({ imported: imported.length, failed: errors.length, rows: imported, errors });
  } catch (err) { next(err); }
});

// Attendance by shift: for one day, how many of each shift's people turned up.
// Absent is derived from the roster rather than counted from rows, so someone
// who simply never clocked in is still counted.
router.get('/attendance/by-shift', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const settings = await loadSettings(businessId);
    const day = req.query.date ? parseDay(req.query.date) : new Date(tzParts(settings.timezone).date);
    if (!day) return res.status(400).json({ title: 'date must be a real YYYY-MM-DD date.', status: 400 });
    const [templates, assignments, records] = await Promise.all([
      prisma.shiftTemplate.findMany({ where: { businessId }, orderBy: { name: 'asc' } }),
      prisma.shiftAssignment.findMany({ where: { businessId }, select: { shiftId: true, employeeId: true } }),
      prisma.attendance.findMany({ where: { businessId, date: day, clockIn: { not: null } }, select: { employeeId: true } }),
    ]);
    const showed = new Set(records.map(r => r.employeeId));
    const rows = templates.map(t => {
      const roster = assignments.filter(a => a.shiftId === t.id).map(a => a.employeeId);
      const present = roster.filter(id => showed.has(id)).length;
      return { shift_id: t.id, shift: t.name, assigned: roster.length, present, absent: roster.length - present };
    });
    // Anyone on no shift at all still belongs somewhere the operator can see.
    const assigned = new Set(assignments.map(a => a.employeeId));
    const unassigned = await prisma.employee.count({ where: { businessId, status: 'active', id: { notIn: [...assigned] } } });
    if (unassigned > 0) {
      const present = [...showed].filter(id => !assigned.has(id)).length;
      rows.push({ shift_id: null, shift: 'No shift assigned', assigned: unassigned, present, absent: Math.max(0, unassigned - present) });
    }
    res.json({ date: ymd(day), rows });
  } catch (err) { next(err); }
});

// Attendance by date: present/absent headcount per day across a range.
router.get('/attendance/by-date', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const settings = await loadSettings(businessId);
    const today = new Date(tzParts(settings.timezone).date);
    const from = req.query.from ? parseDay(req.query.from) : new Date(today.getTime() - 6 * 86400000);
    const to = req.query.to ? parseDay(req.query.to) : today;
    if (!from || !to) return res.status(400).json({ title: 'from and to must be real YYYY-MM-DD dates.', status: 400 });
    if (to < from) return res.status(400).json({ title: 'to cannot be before from.', status: 400 });
    const span = Math.round((to - from) / 86400000) + 1;
    if (span > 366) return res.status(400).json({ title: 'Range cannot exceed 366 days.', status: 400 });

    const [headcount, records, holidays] = await Promise.all([
      prisma.employee.count({ where: { businessId, status: 'active' } }),
      prisma.attendance.findMany({ where: { businessId, date: { gte: from, lte: to }, clockIn: { not: null } }, select: { date: true, employeeId: true } }),
      holidayDays(businessId, from, to, null),
    ]);
    const byDay = new Map();
    for (const r of records) {
      const k = ymd(r.date);
      if (!byDay.has(k)) byDay.set(k, new Set());
      byDay.get(k).add(r.employeeId);
    }
    const rows = [];
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = ymd(d);
      const present = byDay.get(k)?.size || 0;
      const holiday = holidays.has(k);
      rows.push({ date: k, present, absent: holiday ? 0 : Math.max(0, headcount - present), holiday });
    }
    res.json({ from: ymd(from), to: ymd(to), headcount, rows: rows.reverse() });
  } catch (err) { next(err); }
});

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

module.exports = router;
