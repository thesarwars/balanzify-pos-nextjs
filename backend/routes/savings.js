/**
 * Savings Groups — hagbad / ayuuto / chama (rotating savings circles).
 *
 * The corridor's most trusted savings instrument, digitized. Members contribute a
 * fixed amount each cycle; the whole pot rotates to one member per cycle in a set
 * order. It is deliberately FREE — ROSCAs win on zero fees + trust, so the value
 * to the platform is the relationship + the contribution history (which feeds
 * underwriting), not a membership charge.
 *
 * Money is auditable: contributions are held as a liability (Savings Group
 * Payable, 2400) and released on payout, so a full cycle nets to zero on the GL.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const accounting = require('../lib/accounting');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
const uuid = z.string().uuid();

const serializeGroup = (g, extra = {}) => ({
  id: g.id, name: g.name, contribution_amount: parseFloat(g.contributionAmount),
  frequency: g.frequency, currency: g.currency, current_cycle: g.currentCycle,
  status: g.status, members: g.members?.length, created_at: g.createdAt, ...extra,
});

// Create a circle with its members; payout order = the order members are listed.
router.post('/groups', auth, requireRole('owner', 'manager'), validate(z.object({
  name: z.string().trim().min(1).max(150),
  contribution_amount: z.coerce.number().positive(),
  frequency: z.enum(['weekly', 'monthly']).default('monthly'),
  currency: z.string().length(3).default('USD'),
  members: z.array(z.object({ name: z.string().trim().min(1).max(150), phone: z.string().max(50).optional() })).min(2),
})), async (req, res, next) => {
  try {
    const group = await prisma.savingsGroup.create({
      data: {
        businessId: req.user.business_id, name: req.body.name,
        contributionAmount: req.body.contribution_amount, frequency: req.body.frequency,
        currency: req.body.currency, createdById: req.user.id,
        members: { create: req.body.members.map((m, i) => ({ name: m.name, phone: m.phone || null, payoutPosition: i + 1 })) },
      },
      include: { members: true },
    });
    res.status(201).json(serializeGroup(group, { member_list: group.members }));
  } catch (err) { next(err); }
});

router.get('/groups', auth, async (req, res, next) => {
  try {
    const groups = await prisma.savingsGroup.findMany({
      where: { businessId: req.user.business_id, ...(req.query.status && { status: String(req.query.status) }) },
      include: { members: true }, orderBy: { createdAt: 'desc' }, take: 100,
    });
    res.json({ groups: groups.map(g => serializeGroup(g, { pot: +(parseFloat(g.contributionAmount) * g.members.length).toFixed(2) })) });
  } catch (err) { next(err); }
});

// Detail: the rotation schedule, who's collected this cycle, who's next to receive.
router.get('/groups/:id', auth, async (req, res, next) => {
  try {
    const group = await prisma.savingsGroup.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: { members: { orderBy: { payoutPosition: 'asc' } } },
    });
    if (!group) return res.status(404).json({ title: 'Group not found', status: 404 });
    const paidThisCycle = await prisma.savingsContribution.findMany({ where: { groupId: group.id, cycle: group.currentCycle }, select: { memberId: true, amount: true } });
    const paidIds = new Set(paidThisCycle.map(c => c.memberId));
    const recipient = group.members.find(m => m.payoutPosition === group.currentCycle) || null;
    res.json(serializeGroup(group, {
      pot: +(parseFloat(group.contributionAmount) * group.members.length).toFixed(2),
      collected_this_cycle: +paidThisCycle.reduce((s, c) => s + parseFloat(c.amount), 0).toFixed(2),
      next_recipient: recipient ? { id: recipient.id, name: recipient.name, position: recipient.payoutPosition } : null,
      schedule: group.members.map(m => ({
        id: m.id, name: m.name, position: m.payoutPosition, paid_out: m.paidOut,
        contributed_this_cycle: paidIds.has(m.id),
      })),
    }));
  } catch (err) { next(err); }
});

// Add a member to the end of the rotation.
router.post('/groups/:id/members', auth, requireRole('owner', 'manager'), validate(z.object({
  name: z.string().trim().min(1).max(150), phone: z.string().max(50).optional(),
})), async (req, res, next) => {
  try {
    const group = await prisma.savingsGroup.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, include: { _count: { select: { members: true } } } });
    if (!group) return res.status(404).json({ title: 'Group not found', status: 404 });
    const member = await prisma.savingsGroupMember.create({
      data: { groupId: group.id, name: req.body.name, phone: req.body.phone || null, payoutPosition: group._count.members + 1 },
    });
    res.status(201).json(member);
  } catch (err) { next(err); }
});

// Record a member's contribution for the current cycle. Held in 2400 (a liability).
router.post('/groups/:id/contribute', auth, validate(z.object({
  member_id: uuid,
  amount: z.coerce.number().positive().optional(),
  method: z.string().max(30).default('cash'),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const group = await prisma.savingsGroup.findFirst({ where: { id: req.params.id, businessId }, include: { members: true } });
    if (!group) return res.status(404).json({ title: 'Group not found', status: 404 });
    if (group.status !== 'active') return res.status(400).json({ title: 'Group is completed', status: 400 });
    const member = group.members.find(m => m.id === req.body.member_id);
    if (!member) return res.status(400).json({ title: 'Member not in this group', status: 400 });
    // One contribution per member per cycle.
    const existing = await prisma.savingsContribution.findFirst({ where: { groupId: group.id, memberId: member.id, cycle: group.currentCycle } });
    if (existing) return res.status(400).json({ title: 'Member already contributed this cycle', status: 400 });

    const amount = +(req.body.amount || parseFloat(group.contributionAmount)).toFixed(2);
    const contribution = await prisma.$transaction(async (tx) => {
      const c = await tx.savingsContribution.create({ data: { groupId: group.id, memberId: member.id, cycle: group.currentCycle, amount, method: req.body.method } });
      // GL: money comes in and is held in trust for the circle.
      await accounting.postJournal(tx, {
        businessId, description: `Savings contribution — ${group.name} (${member.name})`,
        sourceType: 'savings_contribution', sourceId: c.id, createdById: req.user.id,
        lines: [
          { code: accounting.tenderAccountCode(req.body.method), debit: amount, credit: 0, description: 'Contribution received' },
          { code: '2400', debit: 0, credit: amount, description: 'Held for savings group' },
        ],
      });
      return c;
    });
    res.status(201).json(contribution);
  } catch (err) { next(err); }
});

// Pay out this cycle's pot to the member whose turn it is, then advance the cycle.
router.post('/groups/:id/payout', auth, requireRole('owner', 'manager'), validate(z.object({
  method: z.string().max(30).default('cash'),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const result = await prisma.$transaction(async (tx) => {
      const group = await tx.savingsGroup.findFirst({ where: { id: req.params.id, businessId }, include: { members: { orderBy: { payoutPosition: 'asc' } } } });
      if (!group) return { code: 404, error: 'Group not found' };
      if (group.status !== 'active') return { code: 400, error: 'Group is completed' };
      const recipient = group.members.find(m => m.payoutPosition === group.currentCycle && !m.paidOut);
      if (!recipient) return { code: 400, error: 'No member is due a payout this cycle' };

      // The pot = what was actually collected this cycle.
      const collected = await tx.savingsContribution.aggregate({ where: { groupId: group.id, cycle: group.currentCycle }, _sum: { amount: true } });
      const pot = +(parseFloat(collected._sum.amount || 0)).toFixed(2);
      if (pot <= 0) return { code: 400, error: 'Nothing collected this cycle yet' };

      const payout = await tx.savingsPayout.create({ data: { groupId: group.id, memberId: recipient.id, cycle: group.currentCycle, amount: pot, method: req.body.method } });
      // GL: release the held funds to the recipient.
      await accounting.postJournal(tx, {
        businessId, description: `Savings payout — ${group.name} (${recipient.name})`,
        sourceType: 'savings_payout', sourceId: payout.id, createdById: req.user.id,
        lines: [
          { code: '2400', debit: pot, credit: 0, description: 'Savings group released' },
          { code: accounting.tenderAccountCode(req.body.method), debit: 0, credit: pot, description: 'Paid to recipient' },
        ],
      });
      await tx.savingsGroupMember.update({ where: { id: recipient.id }, data: { paidOut: true } });
      // Advance the rotation; the circle completes when everyone has received.
      const nextCycle = group.currentCycle + 1;
      const done = nextCycle > group.members.length;
      await tx.savingsGroup.update({ where: { id: group.id }, data: { currentCycle: nextCycle, ...(done && { status: 'completed' }) } });
      return { payout, recipient: recipient.name, pot, group_status: done ? 'completed' : 'active' };
    });
    if (result.error) return res.status(result.code).json({ title: result.error, status: result.code });
    res.status(201).json({ message: `Paid ${result.pot} to ${result.recipient}.`, ...result });
  } catch (err) { next(err); }
});

module.exports = router;
