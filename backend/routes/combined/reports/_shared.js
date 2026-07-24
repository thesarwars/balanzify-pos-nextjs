// Shared helpers for the reference-parity report endpoints: numeric coercion,
// rounding, and the location + date-range parsing every report uses. Kept
// dependency-free so any report module can require it.

const PL_POSTED = ['completed', 'refunded', 'partially_refunded'];
const PL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plNum = (v) => parseFloat(v || 0) || 0;
const plRound = (n) => Math.round((Number(n) || 0) * 100) / 100;

// A calendar-real YYYY-MM-DD string (typeof guards against ?from=a&from=b
// arriving as an array; the ISO round-trip rejects 2026-02-31 and friends).
function plParseDay(s) {
  if (typeof s !== 'string' || !PL_DATE_RE.test(s)) return null;
  const d = new Date(s);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

// from/to are YYYY-MM-DD (or absent). Returns { fromDate, toEnd } where toEnd
// is EXCLUSIVE (start of the day after `to`), plus 400s on malformed input.
function plRange(req, res, startDate) {
  const { from, to } = req.query;
  const fromParsed = plParseDay(from), toParsed = plParseDay(to);
  if ((from != null && !fromParsed) || (to != null && !toParsed)) {
    res.status(400).json({ title: 'Dates must be real YYYY-MM-DD dates.', status: 400 });
    return null;
  }
  const loc = req.query.location_id || null;
  if (loc && !(typeof loc === 'string' && PL_UUID_RE.test(loc))) {
    res.status(400).json({ title: 'location_id must be a UUID.', status: 400 });
    return null;
  }
  const fromDate = fromParsed || new Date(startDate || '2000-01-01');
  const toEnd = toParsed ? new Date(toParsed.getTime() + 86400000) : new Date('2099-12-31');
  return { fromDate, toEnd, loc };
}

module.exports = { PL_POSTED, PL_DATE_RE, PL_UUID_RE, plNum, plRound, plParseDay, plRange };
