'use client';
import React from 'react';

export function marginOf(f: any) { const p = parseFloat(f.price || 0), c = parseFloat(f.cost || 0); return p ? Math.round(((p - c) / p) * 100) : 0; }
export function Toggle({ T, on, onChange, label, hint }: any) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' } as React.CSSProperties}>
      <span style={{ width: 40, height: 23, borderRadius: 99, background: on ? T.accent.base : T.lineMid, position: 'relative', flexShrink: 0, transition: 'background .18s' }}>
        <span style={{ position: 'absolute', top: 2.5, left: on ? 19 : 2.5, width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
      </span>
      <span><span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.inkMid }}>{label}</span><span style={{ display: 'block', fontSize: 10.5, color: T.inkSub }}>{hint}</span></span>
    </button>
  );
}
export function MiniInp({ T, style, type = 'number', ...p }: any) {
  return <input {...p} type={type} style={{ width: '100%', padding: '7px 9px', fontSize: 13, fontFamily: T.fMono, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none', boxSizing: 'border-box', ...style }} />;
}
