// ═══════════════════════════════════════════════════════════════════
//  i18n core — the localization foundation for the launch markets.
//
//  English is the source/fallback; Somali and Arabic are first-class
//  (Arabic drives right-to-left layout). Pure and type-safe: every
//  message key is checked at compile time via MessageKey, and the
//  dictionary is `satisfies`-validated so a missing locale is a type
//  error, never a silent blank string at runtime.
// ═══════════════════════════════════════════════════════════════════

export type Locale = 'en' | 'so' | 'ar';

export const LOCALES: { code: Locale; name: string; native: string; rtl: boolean }[] = [
  { code: 'en', name: 'English', native: 'English',   rtl: false },
  { code: 'so', name: 'Somali',  native: 'Soomaali',  rtl: false },
  { code: 'ar', name: 'Arabic',  native: 'العربية',    rtl: true  },
];

export const DEFAULT_LOCALE: Locale = 'en';

export const isRtl = (l: Locale): boolean => l === 'ar';

// Message catalogue. Every entry must provide all three locales (enforced by the
// `satisfies` below), so adding a key without translating it fails the build.
const MESSAGES = {
  // Common actions
  'common.save':    { en: 'Save',    so: 'Kaydi',  ar: 'حفظ' },
  'common.cancel':  { en: 'Cancel',  so: 'Jooji',  ar: 'إلغاء' },
  'common.search':  { en: 'Search',  so: 'Raadi',  ar: 'بحث' },
  'common.add':     { en: 'Add',     so: 'Ku dar', ar: 'إضافة' },
  'common.total':   { en: 'Total',   so: 'Wadarta', ar: 'المجموع' },
  'common.print':   { en: 'Print',   so: 'Daabac', ar: 'طباعة' },

  // Navigation
  'nav.dashboard':  { en: 'Dashboard', so: 'Shaxda guud', ar: 'لوحة التحكم' },
  'nav.pos':        { en: 'Point of Sale', so: 'Iibka', ar: 'نقطة البيع' },
  'nav.products':   { en: 'Products', so: 'Alaabta', ar: 'المنتجات' },
  'nav.sales':      { en: 'Sales', so: 'Iibinta', ar: 'المبيعات' },
  'nav.customers':  { en: 'Customers', so: 'Macaamiisha', ar: 'العملاء' },
  'nav.reports':    { en: 'Reports', so: 'Warbixinno', ar: 'التقارير' },
  'nav.settings':   { en: 'Settings', so: 'Dejinta', ar: 'الإعدادات' },

  // POS
  'pos.checkout':   { en: 'Checkout', so: 'Bixi', ar: 'الدفع' },
  'pos.cart':       { en: 'Cart', so: 'Dambiisha', ar: 'السلة' },
  'pos.payment':    { en: 'Payment', so: 'Lacag bixinta', ar: 'الدفع' },
  'pos.change':     { en: 'Change', so: 'Baaqiga', ar: 'الباقي' },

  // Zakat (ledger-derived)
  'zakat.title':    { en: 'Zakat', so: 'Sakada', ar: 'الزكاة' },
  'zakat.due':      { en: 'Zakat Due', so: 'Sakada la bixinayo', ar: 'الزكاة المستحقة' },
  'zakat.base':     { en: 'Zakatable Wealth', so: 'Hantida la xisaabinayo', ar: 'الثروة الخاضعة للزكاة' },
  'zakat.nisab':    { en: 'Nisab', so: 'Nisaab', ar: 'النصاب' },

  // Fiscalization
  'fiscal.receipt': { en: 'Fiscal Receipt', so: 'Rasiidh canshuureed', ar: 'إيصال ضريبي' },
  'fiscal.verify':  { en: 'Verify', so: 'Xaqiiji', ar: 'تحقق' },

  // Hijri calendar
  'hijri.today':    { en: 'Today (Hijri)', so: 'Maanta (Hijri)', ar: 'اليوم (هجري)' },
  'hijri.ramadan':  { en: 'Ramadan', so: 'Soon', ar: 'رمضان' },

  // Pharmacy clinical safety
  'rx.interaction_warning': { en: 'Drug interaction warning', so: 'Digniin isdhexgalka daawada', ar: 'تحذير تفاعل دوائي' },
  'rx.contraindicated':     { en: 'Contraindicated', so: 'Mamnuuc', ar: 'مضاد استطباب' },

  // Language picker
  'language.label': { en: 'Language', so: 'Luqadda', ar: 'اللغة' },
} satisfies Record<string, Record<Locale, string>>;

export type MessageKey = keyof typeof MESSAGES;

/**
 * Translate a key for a locale, falling back to English, then the key itself.
 * Supports `{name}`-style interpolation.
 */
export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const entry = MESSAGES[key] as Record<Locale, string> | undefined;
  let s = (entry && (entry[locale] ?? entry.en)) ?? String(key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return s;
}
