// ── Stock barcode sticker sheets ─────────────────────────────────────────────
// Every business starts with these so Print Labels has something to print to.
// All lengths are inches, and each row satisfies the same constraint the API
// validates: left_margin + n*sticker_width + (n-1)*col_distance <= paper_width.
//
// The three sheet layouts mirror the common US letter label stock; the roll
// covers thermal/continuous printers, which have no sheet at all.
const DEFAULT_BARCODE_SETTINGS = [
  {
    name: '20 per sheet (4" × 1")',
    description: 'US Letter, 2 across × 10 down',
    isContinuous: false,
    topMargin: 0.5, leftMargin: 0.15625,
    stickerWidth: 4, stickerHeight: 1,
    paperWidth: 8.5, paperHeight: 11,
    stickersInOneRow: 2, rowDistance: 0, colDistance: 0.1875,
    stickersPerSheet: 20,
    isDefault: true,
  },
  {
    name: '30 per sheet (2.625" × 1")',
    description: 'US Letter, 3 across × 10 down',
    isContinuous: false,
    topMargin: 0.5, leftMargin: 0.1875,
    stickerWidth: 2.625, stickerHeight: 1,
    paperWidth: 8.5, paperHeight: 11,
    stickersInOneRow: 3, rowDistance: 0, colDistance: 0.125,
    stickersPerSheet: 30,
    isDefault: false,
  },
  {
    name: '40 per sheet (2" × 1")',
    description: 'US Letter, 4 across × 10 down',
    isContinuous: false,
    topMargin: 0.5, leftMargin: 0.15,
    stickerWidth: 2, stickerHeight: 1,
    paperWidth: 8.5, paperHeight: 11,
    stickersInOneRow: 4, rowDistance: 0, colDistance: 0.1,
    stickersPerSheet: 40,
    isDefault: false,
  },
  {
    name: 'Continuous roll (2" × 1")',
    description: 'Thermal roll — one label per feed, no sheet',
    isContinuous: true,
    topMargin: 0, leftMargin: 0,
    stickerWidth: 2, stickerHeight: 1,
    paperWidth: null, paperHeight: null,
    stickersInOneRow: 1, rowDistance: 0, colDistance: 0,
    stickersPerSheet: 0,
    isDefault: false,
  },
];

/**
 * Seed the stock sheets for a business.
 *
 * Idempotent by name, so it is safe to call on an existing business (backfill,
 * or "restore defaults"): only missing sheets are created. If the business
 * already has a default, the seeded ones never steal it.
 *
 * @param {import('@prisma/client').PrismaClient} db - client or transaction
 * @returns {Promise<number>} how many sheets were created
 */
async function seedBarcodeSettings(db, businessId, createdById = null) {
  const existing = await db.barcodeSetting.findMany({
    where: { businessId },
    select: { name: true, isDefault: true },
  });
  const have = new Set(existing.map((s) => s.name));
  const hasDefault = existing.some((s) => s.isDefault);

  const missing = DEFAULT_BARCODE_SETTINGS.filter((s) => !have.has(s.name));
  if (!missing.length) return 0;

  await db.barcodeSetting.createMany({
    data: missing.map((s) => ({
      ...s,
      businessId,
      createdById,
      // Don't demote a default the business already chose.
      isDefault: hasDefault ? false : s.isDefault,
    })),
  });
  return missing.length;
}

module.exports = { DEFAULT_BARCODE_SETTINGS, seedBarcodeSettings };
