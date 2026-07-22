// Reference-number prefixes (Business Settings → Prefixes), with sane defaults.
async function refPrefix(db, businessId, key, fallback) {
  try {
    const biz = await db.business.findUnique({ where: { id: businessId }, select: { settings: true } });
    const v = biz && biz.settings && biz.settings[key];
    return (typeof v === 'string' && v.trim()) ? v.trim() : fallback;
  } catch { return fallback; }
}
module.exports = { refPrefix };
