/**
 * HRM — the company holiday calendar.
 */
const {
  HolidaySchema, PL_UUID, auth, express, parseDay, prisma, requireRole, serializeHoliday,
  validate,
} = require('./_shared');

const router = express.Router();

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

module.exports = router;
