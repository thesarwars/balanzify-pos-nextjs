// Grant every module to one business — the platform-operator override, for
// demo/QA accounts that need the whole product family switched on.
//
// Two things are written, and both are needed:
//
//   1. Business.enabledModules — the licence list the module gate reads.
//   2. An active ModuleSubscription per paid add-on.
//
// (2) matters because PUT /api/v1/modules refuses to let an owner self-grant a
// paid add-on: it answers 402 unless the module is already enabled or actively
// subscribed (routes/modules.js). Without the subscription rows the account
// would work until someone toggled a module OFF in the Modules screen, and then
// be unable to turn it back on. With them, everything toggles freely.
//
// `superadmin` is included deliberately — that endpoint rejects it outright
// (403) for tenants, so a platform-operator path like this one is the only way
// to grant it.
//
// Idempotent: re-running changes nothing. Safe to re-run.
//
//   node scripts/enable-all-modules.js --dry                  # report only
//   node scripts/enable-all-modules.js                        # admin@balanzify.com
//   node scripts/enable-all-modules.js someone@example.com    # another account
const prisma = require('../lib/prisma');
const { MODULES, modulePrice } = require('../lib/modules');

const DRY = process.argv.includes('--dry');
const EMAIL = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'admin@balanzify.com';

// Mirrors the shape routes/superadmin.js persists: the base plan always stays,
// plus every opt-in add-on. Together that is the full catalog.
const BASE = Object.keys(MODULES).filter((k) => MODULES[k].default !== false);
const ADDONS = Object.keys(MODULES).filter((k) => MODULES[k].default === false);
const ALL = [...new Set([...BASE, ...ADDONS])];

(async () => {
  const user = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
    select: { id: true, email: true, name: true, role: true, businessId: true, isActive: true },
  });

  if (!user) {
    console.error(`FAILED: no user with email ${EMAIL}`);
    process.exit(1);
  }

  const biz = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: { id: true, name: true, market: true, enabledModules: true, email: true, country: true },
  });

  if (!biz) {
    console.error(`FAILED: user ${EMAIL} has no business (business_id ${user.businessId})`);
    process.exit(1);
  }

  const before = biz.enabledModules || [];
  const beforeSet = new Set(before);
  const missing = ALL.filter((k) => !beforeSet.has(k));

  const subs = await prisma.moduleSubscription.findMany({
    where: { businessId: biz.id },
    select: { module: true, status: true },
  });
  const activeSubs = new Set(subs.filter((s) => s.status === 'active').map((s) => s.module));
  const subsMissing = ADDONS.filter((k) => !activeSubs.has(k));

  console.log(`account   ${user.email}  (${user.name || 'no name'}, role=${user.role}, active=${user.isActive})`);
  console.log(`business  ${biz.name} <${biz.email}>  [${biz.id}]  market=${biz.market}  country=${biz.country}`);
  console.log(`catalog   ${ALL.length} modules — ${BASE.length} base plan, ${ADDONS.length} add-ons\n`);

  console.log(`enabledModules: ${before.length} enabled, ${missing.length} to add`);
  if (missing.length) console.log(`  + ${missing.join(', ')}`);
  console.log(`subscriptions:  ${activeSubs.size} active, ${subsMissing.length} to add`);
  if (subsMissing.length) console.log(`  + ${subsMissing.join(', ')}`);

  if (DRY) {
    console.log('\n[dry run] nothing written');
    await prisma.$disconnect();
    process.exit(0);
  }

  if (!missing.length && !subsMissing.length) {
    console.log('\n= already fully enabled; nothing to do');
    await prisma.$disconnect();
    process.exit(0);
  }

  await prisma.business.update({
    where: { id: biz.id },
    data: { enabledModules: ALL },
  });

  // priceMonthly is recorded for reporting only — no Stripe subscription is
  // created here, so this grants access without billing anything.
  for (const key of ADDONS) {
    await prisma.moduleSubscription.upsert({
      where: { businessId_module: { businessId: biz.id, module: key } },
      update: { status: 'active' },
      create: {
        businessId: biz.id,
        module: key,
        status: 'active',
        priceMonthly: modulePrice(key),
      },
    });
  }

  const after = await prisma.business.findUnique({
    where: { id: biz.id },
    select: { enabledModules: true },
  });
  const activeAfter = await prisma.moduleSubscription.count({
    where: { businessId: biz.id, status: 'active' },
  });

  const stillMissing = ALL.filter((k) => !after.enabledModules.includes(k));
  console.log(`\nenabledModules now: ${after.enabledModules.length}/${ALL.length}`);
  console.log(`active subscriptions now: ${activeAfter}/${ADDONS.length}`);

  if (stillMissing.length) {
    console.log(`FAILED: still missing ${stillMissing.join(', ')}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('OK — every module enabled');
  // The API caches the resolved module set per business for 60s
  // (lib/moduleGate.js), so this takes effect within a minute without a restart.
  console.log('Note: the module gate caches for 60s — allow up to a minute, then reload the app.');

  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
