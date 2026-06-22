/**
 * Lending routes — embedded working-capital finance.
 *
 * GET /api/v1/lending/assessment — credit-scoring assessment + recommended
 *   working-capital limit, underwritten from the business's own general ledger.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const underwriting = require('../lib/underwriting');
const financing = require('../lib/financing');
const router = express.Router();

router.get('/assessment', auth, async (req, res, next) => {
  try {
    const assessment = await underwriting.assess(req.user.business_id);
    res.json(assessment);
  } catch (err) { next(err); }
});

// Create a financing offer (Sharia-compliant fixed fee), gated by underwriting.
router.post('/offer', auth, requireRole('owner'), validate(z.object({
  principal:       z.coerce.number().positive(),
  term_days:       z.coerce.number().int().positive().max(365).default(30),
  collection_rate: z.coerce.number().min(0).max(1).default(0.10),
})), async (req, res, next) => {
  try {
    const advance = await financing.createOffer({
      businessId: req.user.business_id, principal: req.body.principal,
      termDays: req.body.term_days, collectionRate: req.body.collection_rate, createdById: req.user.id,
    });
    res.status(201).json(advance);
  } catch (err) { next(err); }
});

router.post('/advances/:id/disburse', auth, requireRole('owner'), async (req, res, next) => {
  try {
    const advance = await financing.disburse({ businessId: req.user.business_id, advanceId: req.params.id, createdById: req.user.id });
    res.json(advance);
  } catch (err) { next(err); }
});

router.post('/advances/:id/repay', auth, requireRole('owner', 'manager'), validate(z.object({
  amount: z.coerce.number().positive(),
})), async (req, res, next) => {
  try {
    const result = await prisma.$transaction((tx) => financing.repay(tx, {
      businessId: req.user.business_id, advanceId: req.params.id, amount: req.body.amount, source: 'manual', createdById: req.user.id,
    }));
    res.json({ message: result.settled ? 'Advance settled.' : 'Repayment recorded.', ...result });
  } catch (err) { next(err); }
});

router.get('/advances/:id/health', auth, async (req, res, next) => {
  try {
    const h = await financing.health(req.user.business_id, req.params.id);
    if (!h) return res.status(404).json({ error: 'Advance not found.' });
    res.json(h);
  } catch (err) { next(err); }
});

router.get('/advances', auth, async (req, res, next) => {
  try {
    const advances = await prisma.financingAdvance.findMany({
      where: { businessId: req.user.business_id, ...(req.query.status && { status: req.query.status }) },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    res.json({ advances: advances.map(a => ({ ...a, outstanding: parseFloat((parseFloat(a.totalRepayable) - parseFloat(a.amountRepaid)).toFixed(2)) })) });
  } catch (err) { next(err); }
});

// ── KYC / identity capture (required before disbursement) ───────────
// Capture or update the applicant's identity. Re-capturing resets to 'pending'.
router.put('/kyc', auth, requireRole('owner'), validate(z.object({
  legal_name:      z.string().min(1).max(200),
  id_type:         z.enum(['national_id', 'passport', 'driver_license']),
  id_number:       z.string().min(3).max(60),
  date_of_birth:   z.string().optional(),
  phone:           z.string().max(40).optional(),
  address:         z.string().max(300).optional(),
  business_reg_no: z.string().max(80).optional(),
  document_urls:   z.array(z.string().url()).max(10).optional(),
})), async (req, res, next) => {
  try {
    const b = req.body;
    const data = {
      legalName: b.legal_name, idType: b.id_type, idNumber: b.id_number,
      dateOfBirth: b.date_of_birth ? new Date(b.date_of_birth) : null,
      phone: b.phone, address: b.address, businessRegNo: b.business_reg_no,
      documentUrls: b.document_urls || [], status: 'pending', rejectionReason: null,
      verifiedAt: null, verifiedById: null,
    };
    const kyc = await prisma.financingKyc.upsert({
      where: { businessId: req.user.business_id },
      create: { businessId: req.user.business_id, ...data },
      update: data,
    });
    res.json(kyc);
  } catch (err) { next(err); }
});

router.get('/kyc', auth, async (req, res, next) => {
  try {
    const kyc = await prisma.financingKyc.findUnique({ where: { businessId: req.user.business_id } });
    if (!kyc) return res.status(404).json({ title: 'No KYC on file', status: 404 });
    res.json(kyc);
  } catch (err) { next(err); }
});

// Verify / reject KYC. Stands in for the lending partner's compliance decision.
router.post('/kyc/decision', auth, requireRole('owner'), validate(z.object({
  decision: z.enum(['verified', 'rejected']),
  reason:   z.string().max(300).optional(),
})), async (req, res, next) => {
  try {
    const kyc = await prisma.financingKyc.findUnique({ where: { businessId: req.user.business_id } });
    if (!kyc) return res.status(404).json({ title: 'No KYC on file', status: 404 });
    const updated = await prisma.financingKyc.update({
      where: { businessId: req.user.business_id },
      data: {
        status: req.body.decision,
        rejectionReason: req.body.decision === 'rejected' ? (req.body.reason || 'Not specified') : null,
        verifiedAt: req.body.decision === 'verified' ? new Date() : null,
        verifiedById: req.user.id,
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ── Denylist (checked at disbursement against the KYC id number) ─────
router.post('/blacklist', auth, requireRole('owner'), validate(z.object({
  id_number: z.string().min(3).max(60),
  reason:    z.string().min(1).max(300),
})), async (req, res, next) => {
  try {
    const entry = await prisma.financingBlacklist.create({
      data: { idNumber: req.body.id_number, reason: req.body.reason, createdById: req.user.id },
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

router.get('/blacklist', auth, requireRole('owner'), async (req, res, next) => {
  try {
    res.json({ entries: await prisma.financingBlacklist.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }) });
  } catch (err) { next(err); }
});

// ── Sharia-compliant late & default handling ────────────────────────
// Reschedule without growing the debt (the riba-free response to a late borrower).
router.post('/advances/:id/restructure', auth, requireRole('owner'), validate(z.object({
  term_days:       z.coerce.number().int().positive().max(365).optional(),
  collection_rate: z.coerce.number().min(0).max(1).optional(),
})), async (req, res, next) => {
  try {
    const adv = await financing.restructure({
      businessId: req.user.business_id, advanceId: req.params.id,
      termDays: req.body.term_days, collectionRate: req.body.collection_rate, createdById: req.user.id,
    });
    res.json(adv);
  } catch (err) { next(err); }
});

// Charity late charge — booked to charity, never to lender income (riba-free).
router.post('/advances/:id/charity-fee', auth, requireRole('owner', 'manager'), validate(z.object({
  amount: z.coerce.number().positive(),
})), async (req, res, next) => {
  try {
    const adv = await financing.chargeCharityFee({
      businessId: req.user.business_id, advanceId: req.params.id, amount: req.body.amount, createdById: req.user.id,
    });
    res.json(adv);
  } catch (err) { next(err); }
});

// Mark an uncollectible advance as defaulted (debt stays on the books).
router.post('/advances/:id/default', auth, requireRole('owner'), async (req, res, next) => {
  try {
    const adv = await financing.markDefault({ businessId: req.user.business_id, advanceId: req.params.id, createdById: req.user.id });
    res.json(adv);
  } catch (err) { next(err); }
});

module.exports = router;
