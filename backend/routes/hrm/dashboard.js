/**
 * HRM — the dashboard.
 *
 * One call for the whole screen. The reference's nine widgets each want a
 * different slice of the same few tables, and fetching them separately would
 * mean nine round trips and nine chances for the panels to disagree about what
 * "today" is.
 *
 * Everything is resolved against the business's wall clock, not the container's.
 */
const {
  auth, commission, express, getBusinessSettings, isManager, loadSettings,
  myEmployee, prisma, serializeLeave, tzParts,
} = require('./_shared');

const router = express.Router();

const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

/** Month bounds [start, next) around a date, in UTC. */
function monthBounds(d, offset = 0) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
  return [start, new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))];
}

/**
 * Anniversary buckets for a set of {date, ...} entries: what falls on `today`,
 * and what falls in the next `days`. Compared month/day only, so a birthday in
 * 1990 still lands this year, and the window wraps across the year end.
 */
function anniversaries(items, today, days = 30) {
  const md = (d) => (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const todayMd = md(today);
  const window = new Set();
  for (let i = 1; i <= days; i++) window.add(md(addDays(today, i)));
  const out = { today: [], upcoming: [] };
  for (const it of items) {
    if (!it.date) continue;
    const m = md(new Date(it.date));
    if (m === todayMd) out.today.push(it);
    else if (window.has(m)) out.upcoming.push(it);
  }
  return out;
}

router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const settings = await loadSettings(businessId);
    const today = new Date(tzParts(settings.timezone).date);
    const soon = addDays(today, 30);
    const [thisStart, thisEnd] = monthBounds(today);
    const [lastStart, lastEnd] = monthBounds(today, -1);
    const manager = isManager(req);

    const [me, employees, todaysLeave, upcomingLeave, holidays, attendance, users, bands] = await Promise.all([
      myEmployee(req),
      prisma.employee.findMany({
        where: { businessId, status: 'active' },
        select: { id: true, name: true, joinedAt: true, dateOfBirth: true },
        orderBy: { name: 'asc' },
      }),
      prisma.leave.findMany({
        where: { businessId, status: 'approved', fromDate: { lte: today }, toDate: { gte: today } },
        include: { employee: { select: { name: true } } }, take: 50,
      }),
      prisma.leave.findMany({
        where: { businessId, status: 'approved', fromDate: { gt: today, lte: soon } },
        include: { employee: { select: { name: true } } }, orderBy: { fromDate: 'asc' }, take: 50,
      }),
      prisma.holiday.findMany({
        where: { businessId, endDate: { gte: today }, startDate: { lte: soon } },
        orderBy: { startDate: 'asc' }, take: 50,
      }),
      prisma.attendance.findMany({
        where: { businessId, date: today },
        include: { employee: { select: { name: true } } }, orderBy: { clockIn: 'asc' }, take: 200,
      }),
      // Sales targets are per USER, since commission is priced on who rang the sale.
      manager ? prisma.user.findMany({ where: { businessId, isActive: true }, select: { id: true, name: true, commissionPercent: true } }) : [],
      commission.loadBands(businessId),
    ]);

    // Sales per user for this month and last, in one pass each.
    const salesFor = async (from, to) => {
      const rows = await prisma.sale.groupBy({
        by: ['cashierId'],
        where: { businessId, status: 'completed', createdAt: { gte: from, lt: to } },
        _sum: { totalAmount: true },
      });
      return new Map(rows.map(r => [r.cashierId, parseFloat(r._sum.totalAmount || 0)]));
    };
    const [thisMonth, lastMonth] = await Promise.all([
      salesFor(thisStart, thisEnd), salesFor(lastStart, lastEnd),
    ]);

    const targetRow = (u) => {
      const t = thisMonth.get(u.id) || 0, l = lastMonth.get(u.id) || 0;
      return {
        user_id: u.id, name: u.name,
        achieved_this_month: +t.toFixed(2), achieved_last_month: +l.toFixed(2),
        commission_this_month: commission.commissionFor(bands.get(u.id), t, u.commissionPercent).commission,
        bands: (bands.get(u.id) || []).map(b => ({ from_amount: b.from, to_amount: b.to, commission_percent: b.percent })),
      };
    };

    const myLeaves = me
      ? await prisma.leave.findMany({ where: { businessId, employeeId: me.id }, orderBy: { createdAt: 'desc' }, take: 10 })
      : [];

    res.json({
      date: ymd(today),
      is_manager: manager,
      // "My leaves" and "My sales targets" — null when the login is not linked
      // to an employee, so the panel can say so rather than render empty.
      me: me ? { id: me.id, name: me.name } : null,
      my_leaves: myLeaves.map(l => serializeLeave(l, me.name)),
      my_target: req.user.id ? targetRow({ id: req.user.id, name: req.user.name || '', commissionPercent: 0 }) : null,
      birthdays: anniversaries(employees.map(e => ({ id: e.id, name: e.name, date: e.dateOfBirth })), today),
      // The reference's "Users" widget is joining anniversaries.
      users: anniversaries(employees.map(e => ({ id: e.id, name: e.name, date: e.joinedAt })), today),
      leaves: {
        today: todaysLeave.map(l => serializeLeave(l, l.employee?.name || '')),
        upcoming: upcomingLeave.map(l => serializeLeave(l, l.employee?.name || '')),
      },
      holidays: {
        today: holidays.filter(h => h.startDate <= today && h.endDate >= today)
          .map(h => ({ id: h.id, name: h.name, start_date: ymd(h.startDate), end_date: ymd(h.endDate) })),
        upcoming: holidays.filter(h => h.startDate > today)
          .map(h => ({ id: h.id, name: h.name, start_date: ymd(h.startDate), end_date: ymd(h.endDate) })),
      },
      todays_attendance: attendance.map(a => ({
        employee_id: a.employeeId, employee: a.employee?.name || '',
        clock_in: a.clockIn || '', clock_out: a.clockOut || '',
      })),
      // The whole-team table is management information.
      sales_targets: manager ? users.map(targetRow) : [],
    });
  } catch (err) { next(err); }
});

module.exports = router;
