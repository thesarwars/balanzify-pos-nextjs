/**
 * Lending routes — embedded working-capital finance.
 *
 * GET /api/v1/lending/assessment — credit-scoring assessment + recommended
 *   working-capital limit, underwritten from the business's own general ledger.
 */
const express = require('express');
const { auth } = require('../middleware/auth');
const underwriting = require('../lib/underwriting');
const router = express.Router();

router.get('/assessment', auth, async (req, res, next) => {
  try {
    const assessment = await underwriting.assess(req.user.business_id);
    res.json(assessment);
  } catch (err) { next(err); }
});

module.exports = router;
