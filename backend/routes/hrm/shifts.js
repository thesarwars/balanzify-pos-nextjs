/**
 * HRM — named, reusable shift templates and their assignments.
 */
const {
  ShiftAssignSchema, ShiftTemplateSchema, auth, express, prisma, requireRole,
  serializeShiftTemplate, shiftData, templateInclude, validate,
} = require('./_shared');

const router = express.Router();

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

module.exports = router;
