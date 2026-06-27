'use client';
// components/kit.tsx — shared primitives, ported & typed from kit.jsx
import React from 'react';
import type { Theme } from '@/lib/theme';

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'brass' | 'gray' | 'violet';

export function Badge({ T, tone = 'gray', children, style }:
  { T: Theme; tone?: Tone; children: React.ReactNode; style?: React.CSSProperties }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    green: { bg: T.greenSoft, fg: T.greenText }, amber: { bg: T.amberSoft, fg: T.amberText },
    red: { bg: T.redSoft, fg: T.redText }, blue: { bg: T.blueSoft, fg: T.blueText },
    violet: { bg: T.violetSoft, fg: T.violet }, brass: { bg: T.accent.soft, fg: T.accent.text },
    gray: { bg: T.paperSink, fg: T.inkSub },
  };
  const c = tones[tone] || tones.gray;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, fontFamily: T.fBody, whiteSpace: 'nowrap', background: c.bg, color: c.fg, ...style }}>{children}</span>;
}

type BtnKind = 'ghost' | 'primary' | 'accent' | 'soft' | 'danger';
export function Btn({ T, kind = 'ghost', children, onClick, style, title, disabled }:
  { T: Theme; kind?: BtnKind; children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties; title?: string; disabled?: boolean }) {
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 16px', borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: T.fBody, whiteSpace: 'nowrap', transition: 'all .15s', border: '1px solid transparent', opacity: disabled ? 0.5 : 1 };
  const kinds: Record<BtnKind, React.CSSProperties> = {
    ghost: { background: T.paper, color: T.inkMid, border: `1px solid ${T.line}` },
    primary: { background: T.navyLight, color: '#fff', boxShadow: '0 1px 3px rgba(27,58,107,0.35)' },
    accent: { background: T.accent.base, color: T.accent.on },
    soft: { background: T.paperAlt, color: T.inkMid },
    danger: { background: T.red, color: '#fff' },
  };
  return <button title={title} onClick={onClick} disabled={disabled} style={{ ...base, ...kinds[kind], ...style }}>{children}</button>;
}

export function Panel({ T, title, action, children, pad = true, style }:
  { T: Theme; title?: string; action?: React.ReactNode; children: React.ReactNode; pad?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, boxShadow: T.sh1, overflow: 'hidden', ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.7 }}>{title}</span>{action}
        </div>
      )}
      <div style={pad ? { padding: '16px 20px' } : { overflowX: 'auto' }}>{children}</div>
    </div>
  );
}

export function StatCard({ T, label, value, sub, trend, accent, big }:
  { T: Theme; label: string; value: React.ReactNode; sub?: string; trend?: number; accent?: string; big?: boolean }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: big ? '22px 24px' : '18px 20px', boxShadow: T.sh1, position: 'relative', overflow: 'hidden' }}>
      {accent && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent }} />}
      <div style={{ fontSize: 11, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: T.fMono, fontWeight: 500, color: T.ink, marginTop: 9, fontSize: big ? 38 : 28, letterSpacing: '-1px', lineHeight: 1 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        {trend != null && <Trend T={T} value={trend} />}
        {sub && <span style={{ fontSize: 11.5, color: T.inkSub }}>{sub}</span>}
      </div>
    </div>
  );
}

export function Modal({ T, title, subtitle, onClose, onSave, saveLabel = 'Save', width = 580, children, footer }:
  { T: Theme; title: string; subtitle?: string; onClose: () => void; onSave?: () => void; saveLabel?: string; width?: number | string; children: React.ReactNode; footer?: React.ReactNode | null }) {
  const titleId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  // Accessibility: trap focus inside the dialog, close on Escape, and restore
  // focus to whatever was focused before it opened — the baseline contract a
  // screen reader / keyboard user expects from a modal.
  React.useEffect(() => {
    const prevFocused = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    const node = dialogRef.current;
    const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
    // Move focus into the dialog on open.
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first || node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !node) return;
      const els = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (!els.length) return;
      const firstEl = els[0], lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); prevFocused?.focus?.(); };
  }, [onClose]);
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,15,5,0.5)', backdropFilter: 'blur(3px)', padding: 20 }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={{ width: `min(${typeof width === 'number' ? width + 'px' : width}, 96vw)`, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: T.paper, borderRadius: T.rXl, boxShadow: T.shModal, overflow: 'hidden', animation: 'sheetUp .22s cubic-bezier(.2,.7,.3,1)', outline: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${T.line}` }}>
          <div>
            <div id={titleId} style={{ fontFamily: T.fDisplay, fontSize: 19, fontWeight: T.dispWeight, color: T.ink, letterSpacing: T.dispTrack }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: T.inkSub, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close dialog" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.line}`, background: T.paper, color: T.inkSub, cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>{children}</div>
        {footer !== undefined ? (footer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 24px', borderTop: `1px solid ${T.line}`, background: T.paperAlt }}>{footer}</div>
        ) : null) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: `1px solid ${T.line}`, background: T.paperAlt }}>
            <Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn>
            {onSave && <Btn T={T} kind="accent" onClick={onSave}>{saveLabel}</Btn>}
          </div>
        )}
      </div>
    </div>
  );
}

export function TextField({ T, value, onChange, type = 'text', placeholder, style, ...rest }:
  { T: Theme; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; style?: React.CSSProperties; [k: string]: any }) {
  return <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} {...rest}
    style={{ width: '100%', padding: '10px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', ...style }} />;
}

export function Field({ T, label, hint, full, children }:
  { T: Theme; label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  const id = React.useId();
  const hintId = hint ? id + '-hint' : undefined;
  // Associate the visible label (and any hint) with the control so screen
  // readers announce them. Inject id/aria-describedby into a single child input
  // when the caller didn't set their own.
  let control = children;
  if (React.isValidElement(children)) {
    const childProps: any = children.props || {};
    control = React.cloneElement(children as React.ReactElement<any>, {
      id: childProps.id ?? id,
      'aria-describedby': childProps['aria-describedby'] ?? hintId,
    });
  }
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</label>
      {control}
      {hint && <div id={hintId} style={{ fontSize: 11, color: T.inkMute, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

// Trend chip (↑/↓ %)
export function Trend({ T, value }: { T: Theme; value: number }) {
  const up = value >= 0;
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, fontFamily: T.fMono, background: up ? T.greenSoft : T.redSoft, color: up ? T.greenText : T.redText }}>{up ? '↑' : '↓'} {Math.abs(value)}%</span>;
}

export function FormGrid({ children, cols = 2, style }: { children: React.ReactNode; cols?: number; style?: React.CSSProperties }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${cols >= 3 ? 150 : 210}px), 1fr))`, gap: 16, ...style }}>{children}</div>;
}

export function SelectField({ T, value, onChange, options, render, ...rest }:
  { T: Theme; value: any; onChange: (v: string) => void; options: any[]; render?: (o: any) => React.ReactNode; [k: string]: any }) {
  return <select value={value ?? ''} onChange={e => onChange(e.target.value)} {...rest} style={{ width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
    {options.map(o => <option key={o} value={o}>{render ? render(o) : o}</option>)}
  </select>;
}

export function methodTone(id: string): Tone {
  return (({ cash: 'green', zaad: 'blue', evc: 'blue', card: 'brass' } as Record<string, Tone>)[id]) || 'gray';
}

// Product swatch/photo background — uses the attached photo if present, else the tile colour.
export function swatchBg(p: any) {
  const c = (p && p.sw) || '#ccc';
  return p && p.img ? `center/cover no-repeat url("${p.img}")` : `linear-gradient(135deg, ${c}, ${c}cc)`;
}

// viewport hook — drives the responsive (mobile drawer / sheet) behaviour
export function useViewport() {
  const [w, setW] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  React.useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return { w, isMobile: w < 860, isTablet: w >= 860 && w < 1180 };
}

// lightweight toast — returns [show, node]
export function useToast(): [(m: string) => void, React.ReactNode] {
  const [msg, setMsg] = React.useState<string | null>(null);
  const show = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2400); };
  const node = msg ? (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 400, background: '#0E9F6E', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, boxShadow: '0 10px 30px rgba(14,159,110,0.4)', display: 'flex', alignItems: 'center', gap: 9, animation: 'sheetUp .2s ease', fontFamily: '"DM Sans", sans-serif' }}>✓ {msg}</div>
  ) : null;
  return [show, node];
}
