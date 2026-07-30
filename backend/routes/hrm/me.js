/**
 * HRM — employee self-service.
 *
 * There was previously no way to resolve "the employee for the logged-in user"
 * anywhere in the module, so nobody could see their own payslip, leave or pay
 * components — every route was scoped to the business and gated on a manager
 * role. Employee.userId already linked the two; these routes use it.
 */
const {
  auth, computeBalances, decorateAtt, empShiftMap, ensureLeaveTypeDefaults, express,
  getBusinessSettings, isManager, loadSettings, myEmployee, prisma, serializeComponent,
  serializeLeave, serializePayroll, tzParts,
} = require('./_shared');

const router = express.Router();

// 404 rather than 403: not being linked to an employee record is a
// configuration gap, not a permission failure.
const NOT_LINKED = {
  title: 'Your login is not linked to an employee record. Ask an administrator to link it.',
  status: 404, code: 'NO_EMPLOYEE_RECORD',
};

router.get('/me', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const emp = await myEmployee(req);
    if (!emp) return res.status(404).json(NOT_LINKED);
    const settings = await loadSettings(businessId);
    const nowHM = tzParts(settings.timezone).hm;
    const fyStart = (await getBusinessSettings(businessId)).fy_start_month;
    await ensureLeaveTypeDefaults(businessId);
    const [attendance, leaves, types, overrides, shifts] = await Promise.all([
      prisma.attendance.findMany({ where: { businessId, employeeId: emp.id }, orderBy: { date: 'desc' }, take: 30, include: { shift: { select: { name: true } } } }),
      prisma.leave.findMany({ where: { businessId, employeeId: emp.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.leaveType.findMany({ where: { businessId } }),
      prisma.employeeLeaveOverride.findMany({ where: { employeeId: emp.id } }),
      empShiftMap(businessId),
    ]);
    const overrideMap = Object.fromEntries(overrides.map(o => [o.type, o.days]));
    res.json({
      id: emp.id, name: emp.name, email: emp.email || '',
      department: emp.department || '', designation: emp.designation || '',
      location_name: emp.location?.name || '',
      joined: emp.joinedAt ? emp.joinedAt.toISOString().slice(0, 10) : '',
      // Deliberately no salary or commission here: this is the employee's own
      // view, and the figures a manager sees are a separate, gated route.
      shift: shifts[emp.id] || null,
      is_manager: isManager(req),
      attendance: attendance.map(a => decorateAtt(a, emp.name, nowHM)),
      leaves: leaves.map(l => serializeLeave(l, emp.name)),
      leave_balance: computeBalances(emp, types, leaves, overrideMap, fyStart),
    });
  } catch (err) { next(err); }
});

// My Payrolls — the reference's "All Payrolls" tab, scoped to the caller.
router.get('/me/payroll', auth, async (req, res, next) => {
  try {
    const emp = await myEmployee(req);
    if (!emp) return res.status(404).json(NOT_LINKED);
    const rows = await prisma.payroll.findMany({
      where: { businessId: req.user.business_id, employeeId: emp.id },
      include: { employee: { select: { name: true, department: true, designation: true } }, lines: true, location: { select: { name: true } }, createdBy: { select: { name: true } } },
      orderBy: { month: 'desc' }, take: 200,
    });
    res.json(rows.map(serializePayroll));
  } catch (err) { next(err); }
});

// My Pay Components — the ones that apply to me, business-wide plus my own.
router.get('/me/pay-components', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const emp = await myEmployee(req);
    if (!emp) return res.status(404).json(NOT_LINKED);
    const rows = await prisma.payComponent.findMany({
      where: { businessId, OR: [{ employeeId: null }, { employeeId: emp.id }] },
      include: { employee: { select: { name: true } } },
      orderBy: [{ type: 'asc' }, { description: 'asc' }],
    });
    res.json(rows.map(serializeComponent));
  } catch (err) { next(err); }
});

module.exports = router;
