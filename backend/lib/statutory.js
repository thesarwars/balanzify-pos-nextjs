/**
 * Statutory payroll deductions by country.
 *
 * Each country returns the same shape so payroll, payslips and the filing
 * report can treat them uniformly:
 *   { country, gross, taxable, paye, nssf, shif, housing_levy, personal_relief,
 *     reliefs, total_statutory, net, breakdown: [...] }
 *
 * Rates are kept as named constants per country so they're easy to revise when
 * the law changes (and to add new markets). All figures are monthly.
 *
 * Kenya (KE): PAYE (graduated, with personal + insurance/housing reliefs),
 * NSSF (Tier I + II), SHIF (2.75%, replaced NHIF Oct 2024), Affordable Housing
 * Levy (1.5%). Somaliland/Somalia (SO/none): no statutory payroll tax regime yet.
 */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ── Kenya ────────────────────────────────────────────────────────────
const KE = {
  PAYE_BANDS: [          // [lower, upper, rate] — monthly, KES
    [0,       24000,    0.10],
    [24000,   32333,    0.25],
    [32333,   500000,   0.30],
    [500000,  800000,   0.325],
    [800000,  Infinity, 0.35],
  ],
  PERSONAL_RELIEF: 2400, // monthly
  RELIEF_RATE: 0.15,     // affordable-housing + insurance (SHIF) relief
  NSSF_LEL: 7000,        // lower earnings limit (Tier I ceiling)
  NSSF_UEL: 36000,       // upper earnings limit (Tier II ceiling)
  NSSF_RATE: 0.06,
  SHIF_RATE: 0.0275,
  SHIF_MIN: 300,
  HOUSING_RATE: 0.015,
};

function payeOnTaxable(taxable) {
  let tax = 0;
  for (const [lo, hi, rate] of KE.PAYE_BANDS) {
    if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate;
  }
  return round2(tax);
}

function computeKenya(grossInput) {
  const gross = round2(grossInput);
  const nssfTier1 = round2(KE.NSSF_RATE * Math.min(gross, KE.NSSF_LEL));
  const nssfTier2 = gross > KE.NSSF_LEL ? round2(KE.NSSF_RATE * (Math.min(gross, KE.NSSF_UEL) - KE.NSSF_LEL)) : 0;
  const nssf = round2(nssfTier1 + nssfTier2);
  const shif = round2(Math.max(KE.SHIF_RATE * gross, KE.SHIF_MIN));
  const housing = round2(KE.HOUSING_RATE * gross);

  // NSSF is deductible before tax; SHIF + housing give a 15% tax relief.
  const taxable = round2(gross - nssf);
  const grossTax = payeOnTaxable(taxable);
  const reliefs = round2(KE.PERSONAL_RELIEF + KE.RELIEF_RATE * (shif + housing));
  const paye = round2(Math.max(0, grossTax - reliefs));
  const total = round2(paye + nssf + shif + housing);

  return {
    country: 'KE', gross, taxable,
    paye, nssf, shif, housing_levy: housing,
    personal_relief: KE.PERSONAL_RELIEF, reliefs,
    total_statutory: total, net: round2(gross - total),
    breakdown: [
      { code: 'PAYE',    label: 'PAYE (income tax)',      amount: paye },
      { code: 'NSSF',    label: 'NSSF (Tier I + II)',     amount: nssf },
      { code: 'SHIF',    label: 'SHIF (health)',          amount: shif },
      { code: 'AHL',     label: 'Affordable Housing Levy', amount: housing },
    ],
  };
}

// No statutory regime (Somaliland/Somalia launch markets).
function computeNone(grossInput) {
  const gross = round2(grossInput);
  return {
    country: 'none', gross, taxable: gross,
    paye: 0, nssf: 0, shif: 0, housing_levy: 0,
    personal_relief: 0, reliefs: 0,
    total_statutory: 0, net: gross, breakdown: [],
  };
}

const REGISTRY = { KE: computeKenya, none: computeNone, SO: computeNone };

// Supported country codes for the API/UI.
const COUNTRIES = Object.keys(REGISTRY);

function compute(country, gross) {
  const fn = REGISTRY[country] || REGISTRY.none;
  return fn(gross);
}

module.exports = { compute, computeKenya, COUNTRIES, round2 };
