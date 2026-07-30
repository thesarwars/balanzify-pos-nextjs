/**
 * HRM — tiered commission bands per user.
 */
const {
  SalesTargetSchema, auth, express, prisma, requireRole, validate,
} = require('./_shared');

const router = express.Router();

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

module.exports = router;
