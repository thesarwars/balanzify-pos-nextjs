// The reference's standard "Filter by date" presets, shared by the report
// screens. Financial years follow the business's configured start month
// (Business Settings → fy_start_month).
import { toLocalYmd } from '@/lib/business-settings';

export const DATE_PRESETS: [string, string][] = [
  ['today', 'Today'], ['yesterday', 'Yesterday'],
  ['last7', 'Last 7 Days'], ['last30', 'Last 30 Days'],
  ['this_month', 'This Month'], ['last_month', 'Last Month'],
  ['this_month_ly', 'This month last year'],
  ['this_year', 'This Year'], ['last_year', 'Last Year'],
  ['fy', 'Current financial year'], ['last_fy', 'Last financial year'],
  ['custom', 'Custom Range'],
];

export function presetRange(key: string, fyStart: number): [string, string] | null {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = (yy: number, mm: number) => toLocalYmd(new Date(yy, mm, 1));
  const last = (yy: number, mm: number) => toLocalYmd(new Date(yy, mm + 1, 0));
  const shift = (days: number) => toLocalYmd(new Date(y, m, now.getDate() + days));
  switch (key) {
    case 'today': return [toLocalYmd(now), toLocalYmd(now)];
    case 'yesterday': return [shift(-1), shift(-1)];
    case 'last7': return [shift(-6), toLocalYmd(now)];
    case 'last30': return [shift(-29), toLocalYmd(now)];
    case 'this_month': return [first(y, m), last(y, m)];
    case 'last_month': return [first(y, m - 1), last(y, m - 1)];
    case 'this_month_ly': return [first(y - 1, m), last(y - 1, m)];
    case 'this_year': return [first(y, 0), last(y, 11)];
    case 'last_year': return [first(y - 1, 0), last(y - 1, 11)];
    case 'fy': case 'last_fy': {
      const s = Math.min(12, Math.max(1, fyStart)) - 1;
      const startY = (m >= s ? y : y - 1) - (key === 'last_fy' ? 1 : 0);
      return [first(startY, s), last(startY + 1, s - 1)];
    }
  }
  return null;
}
