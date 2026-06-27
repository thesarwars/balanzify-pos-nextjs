// lib/theme.ts — Balanzify design tokens, ported & typed from the prototype's theme.jsx
export type Accent = { base: string; bright: string; soft: string; text: string; on: string };

export const ACCENTS: Record<string, Accent> = {
  brass:   { base: '#A16207', bright: '#C8881A', soft: '#F4EAD6', text: '#7A4A06', on: '#FFFFFF' },
  emerald: { base: '#0F766E', bright: '#14938A', soft: '#D7F0EC', text: '#0B5750', on: '#FFFFFF' },
  indigo:  { base: '#4338CA', bright: '#5B50E0', soft: '#E4E2FB', text: '#322B9E', on: '#FFFFFF' },
};

export const TYPE_PRESETS = {
  ledger:    { display: '"Fraunces", Georgia, serif', body: '"DM Sans", system-ui, sans-serif', mono: '"DM Mono", monospace', dispWeight: 600, dispTrack: '-0.5px' },
  grotesk:   { display: '"Space Grotesk", system-ui, sans-serif', body: '"DM Sans", system-ui, sans-serif', mono: '"DM Mono", monospace', dispWeight: 600, dispTrack: '-1px' },
  editorial: { display: '"Fraunces", Georgia, serif', body: '"Newsreader", Georgia, serif', mono: '"DM Mono", monospace', dispWeight: 500, dispTrack: '-0.4px' },
} as const;

type SidebarBase = { mode: 'light' | 'dark'; bg: string; label: string };
const SIDEBAR_BASES: Record<string, SidebarBase> = {
  linen:    { mode: 'light', bg: '#FBF9F4', label: 'Linen' },
  sand:     { mode: 'light', bg: '#F0E7D5', label: 'Sand' },
  mist:     { mode: 'light', bg: '#EEF1ED', label: 'Mist' },
  espresso: { mode: 'dark',  bg: '#211910', label: 'Espresso' },
  navy:     { mode: 'dark',  bg: '#0B1730', label: 'Navy' },
};

function sideTokens(base: SidebarBase, a: Accent) {
  if (base.mode === 'light') {
    return {
      bg: base.bg, isDark: false, line: 'rgba(40,30,16,0.10)',
      brand: '#1A1611', brandSub: 'rgba(26,22,17,0.46)', section: 'rgba(26,22,17,0.40)',
      itemText: 'rgba(26,22,17,0.66)', activeText: '#1A1611', activeBg: a.soft, activeRail: a.base,
      hover: 'rgba(40,30,16,0.055)', highlight: a.soft, avatarBg: a.base, avatarText: '#fff',
      footerText: '#1A1611', footerSub: 'rgba(26,22,17,0.45)', iconBg: 'rgba(40,30,16,0.06)',
      iconText: 'rgba(26,22,17,0.5)', chev: 'rgba(26,22,17,0.28)', markShadow: '0 2px 8px rgba(40,30,16,0.18)',
    };
  }
  return {
    bg: base.bg, isDark: true, line: 'rgba(255,255,255,0.07)',
    brand: '#fff', brandSub: 'rgba(255,255,255,0.42)', section: 'rgba(255,255,255,0.30)',
    itemText: 'rgba(255,255,255,0.62)', activeText: '#fff', activeBg: 'rgba(255,255,255,0.10)', activeRail: a.bright,
    hover: 'rgba(255,255,255,0.06)', highlight: base.bg === '#0B1730' ? 'rgba(27,58,107,0.45)' : 'rgba(150,110,50,0.24)',
    avatarBg: 'rgba(255,255,255,0.1)', avatarText: '#fff', footerText: 'rgba(255,255,255,0.9)',
    footerSub: 'rgba(255,255,255,0.4)', iconBg: 'rgba(255,255,255,0.07)', iconText: 'rgba(255,255,255,0.5)',
    chev: 'rgba(255,255,255,0.22)', markShadow: '0 2px 8px rgba(0,0,0,0.3)',
  };
}

export function makeTheme({ accent = 'brass', type = 'ledger', sidebar = 'linen' }:
  { accent?: keyof typeof ACCENTS; type?: keyof typeof TYPE_PRESETS; sidebar?: keyof typeof SIDEBAR_BASES } = {}) {
  const a = ACCENTS[accent] || ACCENTS.brass;
  const tp = TYPE_PRESETS[type] || TYPE_PRESETS.ledger;
  const base = SIDEBAR_BASES[sidebar] || SIDEBAR_BASES.linen;
  return {
    accent: a, side: sideTokens(base, a),
    navy: '#0B1730', navyMid: '#13294D', navyLight: '#1B3A6B', navyGlow: 'rgba(27,58,107,0.4)',
    paper: '#FFFDF9', paperAlt: '#F6F3EE', paperSink: '#EFEAE0', card: '#FFFDF9',
    ink: '#1A1611', inkMid: '#3E3729', inkSub: '#7A7264', inkMute: '#A89F8E',
    line: '#EAE3D6', lineMid: '#D9CFBC',
    green: '#0E9F6E', greenSoft: '#D8F3E6', greenText: '#066043',
    amber: '#D97706', amberSoft: '#FCEFD3', amberText: '#8A4B08',
    red: '#DC2626', redSoft: '#FBE3E1', redText: '#961717',
    blue: '#2563EB', blueSoft: '#DEE9FD', blueText: '#1A45B0',
    violet: '#7C3AED', violetSoft: '#ECE3FE',
    r: 10, rLg: 14, rXl: 18, rFull: 999,
    sh1: '0 1px 2px rgba(60,45,20,0.05), 0 1px 3px rgba(60,45,20,0.04)',
    sh2: '0 2px 4px rgba(60,45,20,0.05), 0 6px 16px rgba(60,45,20,0.06)',
    sh3: '0 8px 18px rgba(40,30,12,0.08), 0 18px 40px rgba(40,30,12,0.10)',
    shModal: '0 28px 70px rgba(20,15,5,0.28)',
    fDisplay: tp.display, fBody: tp.body, fMono: tp.mono, dispWeight: tp.dispWeight, dispTrack: tp.dispTrack,
  };
}

export type Theme = ReturnType<typeof makeTheme>;

// ── Currency ────────────────────────────────────────────────────────────────
// The app used to hard-code '$' everywhere — wrong for a product whose pitch is
// local-money-native. Currency is now a business setting; the shared money()
// helpers read the active currency so every screen localizes at once. Default
// stays USD so nothing breaks before a business sets its own.
export type CurrencyCode = 'USD' | 'SOS' | 'SLSH' | 'KES' | 'ETB';
export const CURRENCIES: Record<CurrencyCode, { symbol: string; locale: string; dp: number; name: string }> = {
  USD:  { symbol: '$',    locale: 'en-US', dp: 2, name: 'US Dollar' },
  SOS:  { symbol: 'Sh',   locale: 'en-US', dp: 2, name: 'Somali Shilling' },
  SLSH: { symbol: 'SlSh', locale: 'en-US', dp: 0, name: 'Somaliland Shilling' },
  KES:  { symbol: 'KSh',  locale: 'en-KE', dp: 2, name: 'Kenyan Shilling' },
  ETB:  { symbol: 'Br',   locale: 'en-ET', dp: 2, name: 'Ethiopian Birr' },
};
const CURRENCY_KEY = 'bz_currency';
let _activeCurrency: CurrencyCode = 'USD';
export function activeCurrency() { return CURRENCIES[_activeCurrency]; }
export function activeCurrencyCode(): CurrencyCode { return _activeCurrency; }
export function setCurrency(code: CurrencyCode) {
  if (!CURRENCIES[code]) return;
  _activeCurrency = code;
  try { window.localStorage.setItem(CURRENCY_KEY, code); } catch { /* ignore */ }
}
/** Hydrate the active currency from storage (client-only). Safe to call repeatedly. */
export function hydrateCurrency() {
  try {
    const s = window.localStorage.getItem(CURRENCY_KEY) as CurrencyCode | null;
    if (s && CURRENCIES[s]) _activeCurrency = s;
  } catch { /* keep default */ }
}
// Multi-character symbols (KSh, SlSh) read better with a thin gap before digits.
const gap = (sym: string) => (sym.length > 1 ? ' ' : '');

export const money = (n: number | string, opts: { symbol?: string; dp?: number } = {}) => {
  const cur = activeCurrency();
  const sym = opts.symbol ?? cur.symbol;
  const dp = opts.dp ?? cur.dp;
  return sym + gap(sym) + parseFloat(String(n || 0)).toLocaleString(cur.locale, { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
export const money0 = (n: number | string) => money(n, { dp: 0 });

// Split a money value into [symbol, whole, '.dd'] for typographic emphasis.
export function moneyParts(n: number | string, symbol?: string) {
  const cur = activeCurrency();
  const sym = symbol ?? cur.symbol;
  const num = parseFloat(String(n || 0));
  const s = num.toLocaleString(cur.locale, { minimumFractionDigits: cur.dp, maximumFractionDigits: cur.dp });
  const [whole, dec = ''] = s.split('.');
  return { symbol: sym, whole, dec: dec ? '.' + dec : '' };
}

export function timeAgo(min: number) {
  if (min < 1) return 'just now';
  if (min < 60) return `${Math.round(min)}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Bare sidebar swatch list (key → bg/label/mode) for the Tweaks control.
export const SIDEBARS: Record<string, { bg: string; label: string; mode: 'light' | 'dark' }> = {
  linen:    { bg: '#FBF9F4', label: 'Linen', mode: 'light' },
  sand:     { bg: '#F0E7D5', label: 'Sand', mode: 'light' },
  mist:     { bg: '#EEF1ED', label: 'Mist', mode: 'light' },
  espresso: { bg: '#211910', label: 'Espresso', mode: 'dark' },
  navy:     { bg: '#0B1730', label: 'Navy', mode: 'dark' },
};
