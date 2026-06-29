'use client';
// components/state-view.tsx — the one place the app renders loading / empty /
// error. Replaces ad-hoc "{err}" strings (which leaked raw "HTTP 404" at the
// user) with a calm, branded, accessible state surface. Every data screen
// should route its non-happy paths through here so the experience is uniform.
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn } from '@/components/kit';

type StateKind = 'loading' | 'empty' | 'error';

const COPY: Record<StateKind, { icon: string; title: string; body: string }> = {
  loading: { icon: '◔', title: 'Loading…', body: 'Fetching the latest figures.' },
  empty:   { icon: '∅', title: 'Nothing here yet', body: 'Once there’s activity, it’ll show up here.' },
  error:   { icon: '⚠', title: 'Couldn’t load this', body: 'Something went wrong fetching this data.' },
};

// Turn a raw thrown error into a human sentence. Never surface "HTTP 404" etc.
export function humanizeError(e: any): string {
  const status = e?.status;
  if (status === 0) return 'Can’t reach the server. Check your connection and try again.';
  if (status === 401 || status === 403) return 'Your session has expired. Please sign in again.';
  if (status === 404) return 'This isn’t available yet on your plan or this device.';
  if (status === 422) return e?.message && !/^HTTP/.test(e.message) ? e.message : 'Some details need fixing before we can continue.';
  if (typeof status === 'number' && status >= 500) return 'The server hit a problem. Please try again in a moment.';
  const m = e?.message;
  if (m && !/^HTTP\s*\d/.test(m)) return m;          // a real message, not the bare "HTTP 500"
  return COPY.error.body;
}

export function StateView({ T, kind, title, message, onRetry, retryLabel = 'Try again', compact }:
  { T: Theme; kind: StateKind; title?: string; message?: string; onRetry?: () => void; retryLabel?: string; compact?: boolean }) {
  const c = COPY[kind];
  const isError = kind === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-busy={kind === 'loading'}
      aria-live={isError ? 'assertive' : 'polite'}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', gap: 6, padding: compact ? '28px 20px' : '52px 24px',
        background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, boxShadow: T.sh1,
      }}
    >
      <div aria-hidden style={{
        fontSize: 30, lineHeight: 1, marginBottom: 4,
        color: isError ? T.redText : T.inkMute,
        ...(kind === 'loading' ? { animation: 'bzspin 1s linear infinite' } : {}),
      }}>{c.icon}</div>
      <div style={{ fontFamily: T.fDisplay, fontSize: 17, fontWeight: T.dispWeight, color: T.ink }}>
        {title || c.title}
      </div>
      <div style={{ fontSize: 13, color: T.inkSub, maxWidth: 360 }}>{message || c.body}</div>
      {onRetry && kind !== 'loading' && (
        <div style={{ marginTop: 12 }}>
          <Btn T={T} kind="accent" onClick={onRetry}>{retryLabel}</Btn>
        </div>
      )}
    </div>
  );
}

// A simple shimmer row block for skeleton loading states.
export function Skeleton({ T, rows = 3, height = 16, style }:
  { T: Theme; rows?: number; height?: number; style?: React.CSSProperties }) {
  return (
    <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          height, borderRadius: 6, width: `${100 - (i % 3) * 12}%`,
          background: `linear-gradient(90deg, ${T.paperSink} 25%, ${T.paperAlt} 37%, ${T.paperSink} 63%)`,
          backgroundSize: '400% 100%', animation: 'bzshimmer 1.4s ease infinite',
        }} />
      ))}
    </div>
  );
}
