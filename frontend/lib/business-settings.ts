'use client';
// ─────────────────────────────────────────────────────────────────
// The Business Settings preference bag (Business.settings), loaded once
// by AppShell and readable synchronously from anywhere.
//
// Deliberately dependency-free apart from React: `theme.ts` formats money
// from these values and must not import the API layer, so AppShell pushes
// the bag in here (and into theme) the same way currency is hydrated.
// ─────────────────────────────────────────────────────────────────
import React from 'react';

export type BusinessSettings = Record<string, any>;

const KEY = 'bz.business-settings';

let _settings: BusinessSettings = {};
const subscribers = new Set<() => void>();

/** Replace the bag and notify subscribers. Persisted so a reload paints correctly. */
export function setBusinessSettings(s: BusinessSettings | null | undefined) {
  _settings = s && typeof s === 'object' ? s : {};
  try { window.localStorage.setItem(KEY, JSON.stringify(_settings)); } catch { /* ignore */ }
  subscribers.forEach((f) => f());
}

/** Restore from storage before the network call lands (client-only, idempotent). */
export function hydrateBusinessSettings() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) _settings = JSON.parse(raw) || {};
  } catch { /* keep defaults */ }
}

export function getBusinessSettings(): BusinessSettings { return _settings; }

/** Synchronous read with a fallback. `null` in the bag means "cleared" → fallback. */
export function getSetting<T>(key: string, fallback: T): T {
  const v = _settings[key];
  return v === undefined || v === null ? fallback : (v as T);
}

/** Re-renders the caller whenever the bag changes. */
export function useBusinessSettings(): BusinessSettings {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    subscribers.add(bump);
    return () => { subscribers.delete(bump); };
  }, []);
  return _settings;
}

/** Convenience: one setting, reactive. */
export function useSetting<T>(key: string, fallback: T): T {
  useBusinessSettings();
  return getSetting(key, fallback);
}

// ── Date / time display ──────────────────────────────────────────────────────
// Apply `date_format`, `time_format` and `timezone` at the DISPLAY layer only.
// The API adapters normalise timestamps to machine 'YYYY-MM-DD', and those same
// strings feed <input type="date">, so they must never be reformatted upstream.

/**
 * A Date as machine 'YYYY-MM-DD' in the LOCAL calendar day, for date inputs.
 * `d.toISOString().slice(0, 10)` is the UTC day instead, which is already
 * tomorrow for anyone west of Greenwich in the evening — and already yesterday
 * for a locally-constructed midnight like `new Date(y, 0, 1)` east of it.
 */
export function toLocalYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today as machine 'YYYY-MM-DD' in the user's local day. */
export function todayLocal(): string {
  return toLocalYmd(new Date());
}

/** Format a 'YYYY-MM-DD' (or ISO) value per `date_format`. Falls back to the input. */
export function formatDate(value?: string | null): string {
  if (!value) return '';
  const iso = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return String(value);
  const [, y, mo, d] = m;
  switch (getSetting<string>('date_format', 'yyyy-mm-dd')) {
    case 'mm/dd/yyyy': return `${mo}/${d}/${y}`;
    case 'dd/mm/yyyy': return `${d}/${mo}/${y}`;
    case 'dd-mm-yyyy': return `${d}-${mo}-${y}`;
    case 'mm-dd-yyyy': return `${mo}-${d}-${y}`;
    default: return `${y}-${mo}-${d}`;
  }
}

/** Format the clock part of an ISO timestamp per `time_format` + `timezone`. */
export function formatTime(value?: string | null): string {
  if (!value) return '';
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return '';
  const tz = getSetting<string>('timezone', '');
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit', minute: '2-digit',
    hour12: getSetting<string>('time_format', '24') === '12',
    ...(tz ? { timeZone: tz } : {}),
  };
  try { return dt.toLocaleTimeString(undefined, opts); }
  catch { return dt.toLocaleTimeString(undefined, { ...opts, timeZone: undefined }); }
}

/** 'date time' for an ISO timestamp, honouring all three keys. */
export function formatDateTime(value?: string | null): string {
  if (!value) return '';
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return String(value);
  const tz = getSetting<string>('timezone', '');
  // Resolve the calendar day in the business timezone before formatting it.
  let ymd: string;
  try {
    ymd = tz
      ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt)
      : new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
  } catch { ymd = dt.toISOString().slice(0, 10); }
  return `${formatDate(ymd)} ${formatTime(value)}`.trim();
}
