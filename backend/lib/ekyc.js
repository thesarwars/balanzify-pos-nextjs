/**
 * eKYC provider abstraction — document + liveness identity verification.
 *
 * Deployable with no external service: a deterministic STUB verifies the captured
 * identity (used to wire and test the automated KYC gate end to end). Set
 * EKYC_API_URL + EKYC_API_KEY to flip to a live provider (Smile ID, Onfido,
 * Veriff…) without changing the lending flow. The verification result drives the
 * existing FinancingKyc status, replacing the manual owner decision when a
 * provider is configured.
 */
const { logger } = require('./logger');

const MODE = process.env.EKYC_API_URL ? 'live' : 'stub';

async function verify({ idType, idNumber, documentUrls = [], selfieUrl = null, businessId } = {}) {
  if (MODE === 'live') {
    try {
      const axios = require('axios').default;
      const { data } = await axios.post(`${process.env.EKYC_API_URL}/verify`, {
        id_type: idType, id_number: idNumber, document_urls: documentUrls, selfie_url: selfieUrl, reference: businessId,
      }, { headers: { Authorization: `Bearer ${process.env.EKYC_API_KEY}` }, timeout: 30000 });
      return {
        provider: 'live', mode: 'live',
        verified: data.status === 'verified' || data.verified === true,
        score: typeof data.score === 'number' ? data.score : null,
        reason: data.reason || data.status || null,
      };
    } catch (err) {
      logger.error('ekyc_live_error', { message: err.message });
      // Don't auto-pass on provider failure — leave it for manual review.
      return { provider: 'live', mode: 'live', verified: false, score: null, reason: 'provider_unavailable' };
    }
  }

  // ── Stub: deterministic, for wiring + tests ──────────────────────────────────
  // An id is rejected if it's missing or explicitly flagged; otherwise verified.
  const flagged = !idNumber || /FAIL|FRAUD|TEST-?REJECT/i.test(idNumber);
  return {
    provider: 'stub', mode: 'stub',
    verified: !flagged,
    score: flagged ? 0.1 : 0.95,
    reason: flagged ? 'flagged_or_missing_id' : 'document_match',
  };
}

module.exports = { verify, MODE };
