'use client';
// ═══════════════════════════════════════════════════════════════════
//  Locale provider + hooks. Persists the choice to localStorage and
//  drives <html lang> / <html dir> so Arabic flips the whole app to RTL.
//  SSR-safe: renders the default locale on the server, then hydrates the
//  saved preference on the client (no markup mismatch since dir/lang are
//  set via effect, not during render).
// ═══════════════════════════════════════════════════════════════════
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Locale, MessageKey, t as translate, isRtl, LOCALES, DEFAULT_LOCALE } from './i18n';
import { hydrateCurrency } from './theme';

const STORAGE_KEY = 'bz_locale';

type LocaleCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  rtl: boolean;
};

const Ctx = createContext<LocaleCtx | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Hydrate the saved choice on mount.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (saved && LOCALES.some(l => l.code === saved)) setLocaleState(saved);
    } catch { /* localStorage unavailable — keep default */ }
    hydrateCurrency(); // pick up the business's currency setting for money formatting
  }, []);

  // Reflect language + direction onto the document.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  return <Ctx.Provider value={{ locale, setLocale, t, rtl: isRtl(locale) }}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}

/** Convenience hook for components that only need the translate function. */
export function useT() {
  return useLocale().t;
}
