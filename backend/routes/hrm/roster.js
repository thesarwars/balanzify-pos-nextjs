/**
 * HRM — per-date roster slots and the shift-swap workflow.
 */
const {
  RosterShiftSchema, RosterSwapSchema, StatusSchema, auth, express, prisma, requireRole,
  serializeShift, serializeSwap, serverDate, shiftInclude, swapInclude, validate,
} = require('./_shared');

const router = express.Router();

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

module.exports = router;
