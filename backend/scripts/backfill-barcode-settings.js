// Backfill the default barcode sticker sheets for every existing business.
//
// Idempotent: seedBarcodeSettings only creates sheets whose name is missing, and
// never demotes a default the business already chose. Safe to re-run.
//
//   node scripts/backfill-barcode-settings.js          # apply
//   node scripts/backfill-barcode-settings.js --dry    # report only
const prisma = require('../lib/prisma');
const { seedBarcodeSettings, DEFAULT_BARCODE_SETTINGS } = require('../lib/barcodeSettingDefaults');

const DRY = process.argv.includes('--dry');

(async () => {
  const businesses = await prisma.business.findMany({ select: { id: true, name: true } });
  console.log(`${businesses.length} business(es); ${DEFAULT_BARCODE_SETTINGS.length} stock sheets each\n`);

  let totalCreated = 0;
  let touched = 0;
  for (const b of businesses) {
    const before = await prisma.barcodeSetting.count({ where: { businessId: b.id } });
    if (DRY) {
      const existing = await prisma.barcodeSetting.findMany({ where: { businessId: b.id }, select: { name: true } });
      const have = new Set(existing.map((s) => s.name));
      const missing = DEFAULT_BARCODE_SETTINGS.filter((s) => !have.has(s.name)).length;
      if (missing) { touched++; totalCreated += missing; }
      console.log(`  ${missing ? '+' : '='} ${b.name}: has ${before}, would create ${missing}`);
      continue;
    }
    const created = await seedBarcodeSettings(prisma, b.id, null);
    if (created) touched++;
    totalCreated += created;
    console.log(`  ${created ? '+' : '='} ${b.name}: had ${before}, created ${created}`);
  }

  // Every business must end up with exactly one default.
  const bad = [];
  for (const b of businesses) {
    const defaults = await prisma.barcodeSetting.count({ where: { businessId: b.id, isDefault: true } });
    if (defaults !== 1) bad.push(`${b.name}: ${defaults} defaults`);
  }

  console.log(`\n${DRY ? '[dry run] would create' : 'created'} ${totalCreated} sheet(s) across ${touched} business(es)`);
  console.log(bad.length ? `⚠ businesses without exactly one default:\n  ${bad.join('\n  ')}` : '✓ every business has exactly one default sheet');

  await prisma.$disconnect();
  process.exit(bad.length && !DRY ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
