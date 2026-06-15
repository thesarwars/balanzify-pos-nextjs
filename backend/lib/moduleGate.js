/**
 * requireModule — gate a route group behind a licensed module.
 *
 * Usage: app.use('/api/v1/hotel', apiLimiter, requireModule('hotel'), hotelRouter)
 *
 * Resolution: Business.enabledModules (empty array = full suite / legacy).
 * Dependencies expand automatically (enabling 'pharmacy' enables pos+inventory).
 * Result is cached per business for 60s to avoid a DB hit on every request.
 */
const prisma = require('./prisma');
const { resolveEnabled } = require('./modules');

const cache = new Map(); // businessId -> { set, expires }
const TTL = 60 * 1000;

async function enabledFor(businessId) {
  const hit = cache.get(businessId);
  if (hit && hit.expires > Date.now()) return hit.set;
  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    select: { enabledModules: true },
  });
  const set = resolveEnabled(biz?.enabledModules);
  cache.set(businessId, { set, expires: Date.now() + TTL });
  return set;
}

const requireModule = (moduleKey) => async (req, res, next) => {
  try {
    if (!req.user?.business_id) return next(); // auth middleware will 401 first
    const enabled = await enabledFor(req.user.business_id);
    if (enabled.has(moduleKey)) return next();
    return res.status(403).json({
      type: 'https://balanzify.com/errors/module-not-enabled',
      title: 'Module not enabled',
      status: 403,
      module: moduleKey,
      detail: `The ${moduleKey} module is not part of your plan. Contact your Balanzify representative to enable it.`,
    });
  } catch (err) { next(err); }
};

// Allow settings updates to invalidate the cache immediately
requireModule.invalidate = (businessId) => cache.delete(businessId);

module.exports = { requireModule };
