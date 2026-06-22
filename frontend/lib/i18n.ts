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
  'common.loading': { en: 'Loading…', so: 'Soo dejinaya…', ar: 'جار التحميل…' },
  'common.refresh': { en: 'Refresh', so: 'Cusboonaysii', ar: 'تحديث' },

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
  'zakat.assets':   { en: 'Zakatable Assets', so: 'Hantida la xisaabinayo', ar: 'الأصول الخاضعة للزكاة' },
  'zakat.liabilities': { en: 'Liabilities', so: 'Deymaha', ar: 'الالتزامات' },
  'zakat.payable':  { en: 'Zakat Payable (2.5%)', so: 'Sakada (2.5%)', ar: 'الزكاة المستحقة (2.5%)' },
  'zakat.rate':     { en: 'Rate', so: 'Qiimaha', ar: 'النسبة' },
  'zakat.due_now':  { en: 'Due now', so: 'Hadda waa la bixinayaa', ar: 'مستحقة الآن' },
  'zakat.not_due':  { en: 'Below nisab — not due', so: 'Nisaabka ka hooseeya', ar: 'دون النصاب — غير مستحقة' },
  'zakat.subtitle': { en: 'Calculated from your live ledger', so: 'Laga xisaabiyay diiwaankaaga', ar: 'محسوبة من دفترك' },
  'zakat.live_required': { en: 'Connect the live backend to compute Zakat from the ledger.', so: 'Ku xidh server-ka si aad u xisaabiso Sakada.', ar: 'اتصل بالخادم لحساب الزكاة من الدفتر.' },

  // Embedded financing (Sharia-compliant)
  'lending.title':       { en: 'Financing', so: 'Maalgelin', ar: 'التمويل' },
  'lending.score':       { en: 'Credit Score', so: 'Buundada deynta', ar: 'درجة الائتمان' },
  'lending.limit':       { en: 'Recommended Limit', so: 'Xadka la talinayo', ar: 'الحد الموصى به' },
  'lending.eligible':    { en: 'Pre-qualified', so: 'Waa loo qalmaa', ar: 'مؤهل مسبقًا' },
  'lending.not_eligible':{ en: 'Not yet eligible', so: 'Weli looma qalmo', ar: 'غير مؤهل بعد' },
  'lending.subtitle':    { en: 'Underwritten from your sales — fixed fee, no interest', so: 'Laga go\'aamiyay iibkaaga — khidmad go\'an, ribo la\'aan', ar: 'مبني على مبيعاتك — رسوم ثابتة بدون فائدة' },
  'lending.avg_revenue': { en: 'Avg Monthly Sales', so: 'Celcelis iib bishii', ar: 'متوسط المبيعات الشهرية' },
  'lending.margin':      { en: 'Net Margin', so: 'Faa\'iido saafi', ar: 'هامش الربح' },
  'lending.cash':        { en: 'Cash on Hand', so: 'Lacagta gacanta', ar: 'النقد المتوفر' },
  'lending.advances':    { en: 'Advances', so: 'Sulufyada', ar: 'السلف' },
  'lending.principal':   { en: 'Principal', so: 'Maalka', ar: 'الأصل' },
  'lending.fee':         { en: 'Fee', so: 'Khidmada', ar: 'الرسوم' },
  'lending.repayable':   { en: 'Total Repayable', so: 'Wadarta la celinayo', ar: 'إجمالي السداد' },
  'lending.outstanding': { en: 'Outstanding', so: 'Hadhay', ar: 'المتبقي' },
  'lending.no_advances': { en: 'No advances yet.', so: 'Wali suluf ma jiro.', ar: 'لا توجد سلف بعد.' },
  'lending.live_required':{ en: 'Connect the live backend to view financing.', so: 'Ku xidh server-ka si aad u aragto maalgelinta.', ar: 'اتصل بالخادم لعرض التمويل.' },

  // Fiscalization
  'fiscal.receipt': { en: 'Fiscal Receipt', so: 'Rasiidh canshuureed', ar: 'إيصال ضريبي' },
  'fiscal.verify':  { en: 'Verify', so: 'Xaqiiji', ar: 'تحقق' },
  'fiscal.title':   { en: 'Fiscalization', so: 'Canshuuraynta', ar: 'الفوترة الضريبية' },
  'fiscal.subtitle':{ en: 'Tax-authority compliance', so: 'U hoggaansanaanta canshuurta', ar: 'الامتثال الضريبي' },
  'fiscal.authority':{ en: 'Authority', so: 'Maamulka', ar: 'الهيئة' },
  'fiscal.device':  { en: 'Device', so: 'Aaladda', ar: 'الجهاز' },
  'fiscal.enabled': { en: 'Enabled', so: 'Shaqaynaya', ar: 'مُفعّل' },
  'fiscal.disabled':{ en: 'Disabled', so: 'La damiyay', ar: 'معطّل' },
  'fiscal.last_number': { en: 'Last Invoice #', so: 'Tirada ugu dambeysay', ar: 'آخر رقم فاتورة' },
  'fiscal.pending': { en: 'Pending Transmission', so: 'Sugaya gudbinta', ar: 'بانتظار الإرسال' },
  'fiscal.transmit':{ en: 'Transmit', so: 'Gudbi', ar: 'إرسال' },
  'fiscal.none_pending': { en: 'All receipts transmitted.', so: 'Dhammaan waa la gudbiyay.', ar: 'تم إرسال كل الإيصالات.' },
  'fiscal.verify_title': { en: 'Verify a Receipt', so: 'Hubi rasiidh', ar: 'تحقق من إيصال' },
  'fiscal.code':    { en: 'Verification code', so: 'Koodhka xaqiijinta', ar: 'رمز التحقق' },
  'fiscal.valid':   { en: 'Authentic', so: 'Sax', ar: 'أصلي' },
  'fiscal.invalid': { en: 'Invalid', so: 'Khaldan', ar: 'غير صالح' },
  'fiscal.live_required': { en: 'Connect the live backend for fiscalization.', so: 'Ku xidh server-ka.', ar: 'اتصل بالخادم.' },

  // Hijri calendar
  'hijri.today':    { en: 'Today (Hijri)', so: 'Maanta (Hijri)', ar: 'اليوم (هجري)' },
  'hijri.ramadan':  { en: 'Ramadan', so: 'Soon', ar: 'رمضان' },

  // Pharmacy clinical safety
  'rx.interaction_warning': { en: 'Drug interaction warning', so: 'Digniin isdhexgalka daawada', ar: 'تحذير تفاعل دوائي' },
  'rx.title':       { en: 'Drug Interactions', so: 'Isdhexgalka daawada', ar: 'تفاعلات الأدوية' },
  'rx.subtitle':    { en: 'Clinical safety check', so: 'Hubinta badbaadada caafimaad', ar: 'فحص السلامة السريرية' },
  'rx.check':       { en: 'Check', so: 'Hubi', ar: 'فحص' },
  'rx.add_drug':    { en: 'Add a drug name…', so: 'Ku dar magaca daawada…', ar: 'أضف اسم دواء…' },
  'rx.no_interactions': { en: 'No interactions found.', so: 'Wax isdhexgal ah lama helin.', ar: 'لا توجد تفاعلات.' },
  'rx.kb_title':    { en: 'Known Interactions', so: 'Isdhexgallada la yaqaan', ar: 'التفاعلات المعروفة' },
  'rx.live_required': { en: 'Connect the live backend to check interactions.', so: 'Ku xidh server-ka.', ar: 'اتصل بالخادم.' },
  'rx.sev.minor':   { en: 'Minor', so: 'Yar', ar: 'طفيف' },
  'rx.sev.moderate':{ en: 'Moderate', so: 'Dhexdhexaad', ar: 'متوسط' },
  'rx.sev.major':   { en: 'Major', so: 'Weyn', ar: 'كبير' },
  'rx.sev.contraindicated': { en: 'Contraindicated', so: 'Mamnuuc', ar: 'مضاد استطباب' },
  'rx.contraindicated':     { en: 'Contraindicated', so: 'Mamnuuc', ar: 'مضاد استطباب' },

  // Offline sync
  'sync.title':     { en: 'Offline Sync', so: 'Isku-xidhka offline', ar: 'المزامنة دون اتصال' },
  'sync.subtitle':  { en: 'Tills that sell offline and reconcile when back online', so: 'Tijaabooyinka iibiya offline-ka oo dib u heshiiya', ar: 'نقاط البيع التي تعمل دون اتصال وتتزامن لاحقًا' },
  'sync.devices':   { en: 'Devices', so: 'Aaladaha', ar: 'الأجهزة' },
  'sync.total_synced': { en: 'Operations Synced', so: 'Hawlaha la xidhay', ar: 'العمليات المتزامنة' },
  'sync.last_push': { en: 'Last push', so: 'Dirista ugu dambeysay', ar: 'آخر إرسال' },
  'sync.last_pull': { en: 'Last pull', so: 'Soo-dejinta ugu dambeysay', ar: 'آخر سحب' },
  'sync.pushed_ops':{ en: 'pushed', so: 'la diray', ar: 'تم الإرسال' },
  'sync.no_devices':{ en: 'No devices have synced yet.', so: 'Wali aalad lama xidhin.', ar: 'لم تتزامن أي أجهزة بعد.' },
  'sync.live_required': { en: 'Connect the live backend to view sync status.', so: 'Ku xidh server-ka.', ar: 'اتصل بالخادم.' },

  // Delivery / dispatch
  'delivery.title':    { en: 'Delivery', so: 'Gaarsiinta', ar: 'التوصيل' },
  'delivery.subtitle': { en: 'Consumer orders + driver dispatch', so: 'Dalabaadka + dirista darawalada', ar: 'طلبات العملاء وإرسال السائقين' },
  'delivery.drivers':  { en: 'Drivers', so: 'Darawalada', ar: 'السائقون' },
  'delivery.orders':   { en: 'Orders', so: 'Dalabaadka', ar: 'الطلبات' },
  'delivery.available': { en: 'Available', so: 'Diyaar', ar: 'متاح' },
  'delivery.busy':     { en: 'On a run', so: 'Shaqo ku jira', ar: 'في مهمة' },
  'delivery.offline':  { en: 'Off', so: 'Bakhtiyaaray', ar: 'غير متصل' },
  'delivery.assign':   { en: 'Assign', so: 'U qoondee', ar: 'تعيين' },
  'delivery.picked_up':{ en: 'Picked up', so: 'La qaaday', ar: 'تم الاستلام' },
  'delivery.deliver':  { en: 'Mark delivered', so: 'Calaamadee la gaarsiiyay', ar: 'تم التوصيل' },
  'delivery.fee':      { en: 'Fee', so: 'Khidmada', ar: 'الرسوم' },
  'delivery.no_orders':{ en: 'No delivery orders yet.', so: 'Wali dalab gaarsiin ah ma jiro.', ar: 'لا توجد طلبات بعد.' },
  'delivery.add_driver':{ en: 'Add driver', so: 'Ku dar darawal', ar: 'أضف سائقًا' },
  'delivery.live_required': { en: 'Connect the live backend for delivery.', so: 'Ku xidh server-ka.', ar: 'اتصل بالخادم.' },

  // Offline / connectivity
  'offline.offline':  { en: 'Offline', so: 'Offline', ar: 'دون اتصال' },
  'offline.syncing':  { en: 'Syncing…', so: 'Isku xidhaya…', ar: 'جارٍ المزامنة…' },
  'offline.queued':   { en: 'queued', so: 'safan', ar: 'في الانتظار' },
  'offline.sync_now': { en: 'Sync now', so: 'Hadda isku xidh', ar: 'زامن الآن' },

  // Language picker
  'language.label': { en: 'Language', so: 'Luqadda', ar: 'اللغة' },
} satisfies Record<string, Record<Locale, string>>;

export type MessageKey = keyof typeof MESSAGES;

// ── Navigation labels ──────────────────────────────────────────────
// Keyed by nav id / section name, this is a SEPARATE, partial map: items we have
// a confident Somali/Arabic term for are translated, the long tail falls back to
// the English label. Partial translation with graceful fallback is a normal i18n
// adoption state — better than shipping a shaky guess for every technical term.
const NAV_LABELS: Record<string, Partial<Record<Locale, string>>> = {
  // sections
  'Inventory':   { so: 'Alaabta', ar: 'المخزون' },
  'Sales':       { so: 'Iibinta', ar: 'المبيعات' },
  'Verticals':   { so: 'Qaybaha', ar: 'القطاعات' },
  'Finance':     { so: 'Maaliyadda', ar: 'المالية' },
  'Team':        { so: 'Kooxda', ar: 'الفريق' },
  'Insights':    { so: 'Fahamka', ar: 'التحليلات' },
  'Admin':       { so: 'Maamulka', ar: 'الإدارة' },
  // items
  'dashboard':       { so: 'Shaxda guud', ar: 'لوحة التحكم' },
  'pos':             { so: 'Iibka', ar: 'نقطة البيع' },
  'locations':       { so: 'Goobaha', ar: 'المواقع' },
  'categories':      { so: 'Qaybaha', ar: 'الفئات' },
  'products':        { so: 'Alaabta', ar: 'المنتجات' },
  'stock':           { so: 'Bakhaarka', ar: 'المخزون' },
  'suppliers':       { so: 'Alaab-qeybiyeyaasha', ar: 'الموردون' },
  'sales':           { so: 'Taariikhda iibka', ar: 'سجل المبيعات' },
  'customers':       { so: 'Macaamiisha', ar: 'العملاء' },
  'loyalty':         { so: 'Daacadnimada', ar: 'الولاء' },
  'discounts':       { so: 'Qiimo-dhimista', ar: 'الخصومات' },
  'hotel':           { so: 'Hudheelka', ar: 'الفندق' },
  'restaurant':      { so: 'Maqaaxida', ar: 'المطعم' },
  'pharmacy':        { so: 'Farmashiyaha', ar: 'الصيدلية' },
  'interactions':    { so: 'Isdhexgalka daawada', ar: 'تفاعلات الأدوية' },
  'wholesale':       { so: 'Jumlada', ar: 'الجملة' },
  'construction':    { so: 'Dhismaha', ar: 'الإنشاءات' },
  'expenses':        { so: 'Kharashaadka', ar: 'المصروفات' },
  'zakat':           { so: 'Sakada', ar: 'الزكاة' },
  'lending':         { so: 'Maalgelin', ar: 'التمويل' },
  'fiscal':          { so: 'Canshuuraynta', ar: 'الفوترة الضريبية' },
  'reports':         { so: 'Warbixinno', ar: 'التقارير' },
  'sync':            { so: 'Isku-xidhka offline', ar: 'المزامنة دون اتصال' },
  'delivery':        { so: 'Gaarsiinta', ar: 'التوصيل' },
  'users':           { so: 'Isticmaalayaasha', ar: 'المستخدمون' },
  'settings':        { so: 'Dejinta', ar: 'الإعدادات' },
};

/** Localize a nav item/section label, falling back to the English label given. */
export function navLabel(locale: Locale, idOrSection: string, fallback: string): string {
  if (locale === 'en') return fallback;
  return NAV_LABELS[idOrSection]?.[locale] ?? fallback;
}

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
