'use client';
import React from 'react';
import { useLocale } from '@/lib/locale-context';
import { LOCALES, Locale } from '@/lib/i18n';

/**
 * Compact language picker. `compact` shows the language code (EN/SO/AR) to fit a
 * sidebar footer; otherwise it shows the native name. Switching is instant —
 * Arabic flips the whole shell to RTL via the LocaleProvider.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();
  return (
    <select
      aria-label="Language"
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      style={{
        height: 28,
        borderRadius: 7,
        border: 'none',
        background: 'rgba(255,255,255,0.08)',
        color: 'inherit',
        font: 'inherit',
        fontSize: 12,
        padding: compact ? '0 4px' : '0 8px',
        cursor: 'pointer',
      }}
    >
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code} style={{ color: '#111' }}>
          {compact ? l.code.toUpperCase() : l.native}
        </option>
      ))}
    </select>
  );
}
