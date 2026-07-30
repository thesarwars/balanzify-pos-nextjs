/**
 * HRM — departments and designations (one OrgUnit table, discriminated by kind).
 */
const {
  OrgUnitSchema, OrgUnitUpdateSchema, auth, ensureOrgDefaults, express, prisma, requireRole,
  validate,
} = require('./_shared');

const router = express.Router();

router.get('/org', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    await ensureOrgDefaults(businessId);
    const [units, emps] = await Promise.all([
      prisma.orgUnit.findMany({ where: { businessId }, orderBy: { name: 'asc' } }),
      prisma.employee.findMany({ where: { businessId }, select: { department: true, designation: true } }),
    ]);
    const count = (kind, name) => emps.filter(e => (kind === 'department' ? e.department : e.designation) === name).length;
    const ser = (kind) => units.filter(u => u.kind === kind).map(u => ({
      id: u.id, name: u.name, code: u.code || '', description: u.description || '',
      count: count(kind, u.name),
    }));
    res.json({ departments: ser('department'), designations: ser('designation') });
  } catch (err) { next(err); }
});

router.post('/org', auth, requireRole('owner', 'manager'), validate(OrgUnitSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const u = await prisma.orgUnit.upsert({
      where: { businessId_kind_name: { businessId, kind: b.kind, name: b.name } },
      create: { businessId, kind: b.kind, name: b.name, code: b.code || null, description: b.description || null },
      update: { code: b.code || null, description: b.description || null },
    });
    res.status(201).json({ id: u.id, name: u.name, code: u.code || '', description: u.description || '', count: 0 });
  } catch (err) { next(err); }
});

// Renaming has to carry the employees with it: Employee.department and
// .designation are denormalised VarChar(100) strings with no FK, so a rename
// that only touched the org unit would orphan everyone assigned to it.
router.put('/org/:id', auth, requireRole('owner', 'manager'), validate(OrgUnitUpdateSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const unit = await prisma.orgUnit.findFirst({ where: { id: req.params.id, businessId } });
    if (!unit) return res.status(404).json({ title: 'Not found', status: 404 });
    const newName = b.name === undefined ? unit.name : b.name;
    if (newName !== unit.name) {
      const clash = await prisma.orgUnit.findUnique({
        where: { businessId_kind_name: { businessId, kind: unit.kind, name: newName } }, select: { id: true },
      });
      if (clash) return res.status(409).json({ title: `A ${unit.kind} called "${newName}" already exists.`, status: 409, code: 'ORG_UNIT_EXISTS' });
    }
    const field = unit.kind === 'designation' ? 'designation' : 'department';
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.orgUnit.update({
        where: { id: unit.id },
        data: {
          name: newName,
          ...(b.code !== undefined && { code: b.code || null }),
          ...(b.description !== undefined && { description: b.description || null }),
        },
      });
      if (newName !== unit.name) {
        await tx.employee.updateMany({ where: { businessId, [field]: unit.name }, data: { [field]: newName } });
      }
      return u;
    });
    const count = await prisma.employee.count({ where: { businessId, [field]: updated.name } });
    res.json({ id: updated.id, name: updated.name, code: updated.code || '', description: updated.description || '', count });
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

module.exports = router;
