const prisma = require('./prisma');

// ── Business Settings preference bag ─────────────────────────────────────────
// Business.settings is a nullable JSONB bag written by the Business Settings
// screen. Routes that need to honour a preference read it through here.
//
// Short-lived cache: these values change rarely but are read on hot paths
// (every sale refund, purchase edit, report). A per-process TTL keeps it to one
// query per business per minute without needing invalidation.
const TTL_MS = 60_000;
const cache = new Map(); // businessId -> { at, bag }

const DEFAULTS = {
  transaction_edit_days: 0,   // 0 = never lock
  start_date: null,
  currency_precision: 2,
  quantity_precision: 0,
  tax1_name: null,
  tax2_name: null,
  tax2_number: null,
};

async function getBusinessSettings(businessId) {
  if (!businessId) return { ...DEFAULTS };
  const hit = cache.get(businessId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.bag;

  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { settings: true } });
  const bag = { ...DEFAULTS, ...((biz && biz.settings) || {}) };
  cache.set(businessId, { at: Date.now(), bag });
  return bag;
}

/** Drop the cached bag (call after a settings write). */
function invalidateBusinessSettings(businessId) { cache.delete(businessId); }

/**
 * Throw a 403 when `date` is older than the business's transaction_edit_days.
 * A value of 0 (the default) means editing is never locked.
 */
async function assertWithinEditWindow(businessId, date, what = 'This record') {
  const { transaction_edit_days: days } = await getBusinessSettings(businessId);
  if (!days || days <= 0 || !date) return;
  const ageDays = (Date.now() - new Date(date).getTime()) / 86_400_000;
  if (ageDays > days) {
    throw Object.assign(
      new Error(`${what} is older than ${days} day${days === 1 ? '' : 's'} and can no longer be edited. Change "Transaction edit days" in Business Settings to allow it.`),
      { statusCode: 403 }
    );
  }
}

module.exports = { getBusinessSettings, invalidateBusinessSettings, assertWithinEditWindow };
