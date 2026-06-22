/**
 * Drug-drug interaction checking — clinical safety for the pharmacy vertical.
 *
 * Dispensing software that can't warn a pharmacist about a dangerous combination
 * isn't operator-grade. We check a set of drugs (a basket, or a patient's active
 * medications plus the one being dispensed) against a knowledge base: the shipped
 * clinical KB (business_id NULL) plus any interactions a business has added.
 *
 * Matching is by generic name, normalized to lowercase. A drug "matches" a KB
 * token when its name equals or contains that token, so "Aspirin 100mg" matches
 * "aspirin". KB tokens are clean generics to keep that one-directional match from
 * firing falsely.
 */
const prisma = require('./prisma');

const SEVERITY_RANK = { minor: 1, moderate: 2, major: 3, contraindicated: 4 };
const norm = (s) => String(s || '').trim().toLowerCase();
const matches = (drugName, token) => {
  const n = norm(drugName), t = norm(token);
  return !!n && !!t && (n === t || n.includes(t));
};

/**
 * Check a list of drug names for pairwise interactions.
 *   check(businessId, ['warfarin', 'Aspirin 100mg']) → [{ drug_a, drug_b, severity, description }]
 * Results are sorted most-severe first.
 */
async function check(businessId, drugNames = []) {
  const names = [...new Set((drugNames || []).map(norm).filter(Boolean))];
  if (names.length < 2) return [];

  const kb = await prisma.drugInteraction.findMany({
    where: { OR: [{ businessId: null }, { businessId }] },
  });

  const found = [];
  const seen = new Set();
  for (const inter of kb) {
    // Need one drug matching drugA and a DIFFERENT drug matching drugB.
    const a = names.find(n => matches(n, inter.drugA));
    const b = names.find(n => n !== a && matches(n, inter.drugB));
    if (!a || !b) continue;
    const key = [a, b].sort().join('|') + '|' + inter.severity;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ drug_a: a, drug_b: b, severity: inter.severity, description: inter.description });
  }
  return found.sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity]);
}

/** True if any interaction is an absolute contraindication (dispense should block). */
const hasContraindication = (interactions) => interactions.some(i => i.severity === 'contraindicated');

module.exports = { check, hasContraindication, SEVERITY_RANK, norm };
