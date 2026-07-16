'use client';
import React from 'react';

// ── Product list helpers (filters, table cells, row actions) ──────────
export function thStyle(T: any, align: 'l' | 'r' = 'l', width?: number): React.CSSProperties {
  return { textAlign: align === 'r' ? 'right' : 'left', padding: '10px 14px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap', ...(width ? { width } : {}) } as React.CSSProperties;
}
export function tdStyle(T: any): React.CSSProperties {
  return { padding: '10px 14px', borderBottom: `1px solid ${T.line}`, verticalAlign: 'middle' } as React.CSSProperties;
}
export function FilterSel({ T, label, value, onChange, options }: any) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '9px 11px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' } as React.CSSProperties}>
        {options.map(([v, l]: any) => <option key={String(v)} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
export function ActionsMenu({ T, open, onToggle, items }: any) {
  const btnRef = React.useRef<any>(null);
  const [pos, setPos] = React.useState<any>(null);
  const click = () => {
    if (!open && btnRef.current) { const r = btnRef.current.getBoundingClientRect(); setPos({ top: r.bottom + 4, left: r.left }); }
    onToggle();
  };
  return (
    <>
      <button ref={btnRef} onClick={click} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 7, border: `1px solid ${T.accent.base}`, background: T.accent.soft, color: T.accent.text, fontFamily: T.fBody, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' } as React.CSSProperties}>Actions ▾</button>
      {open && pos && (
        <>
          <div onClick={onToggle} style={{ position: 'fixed', inset: 0, zIndex: 300 } as React.CSSProperties} />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: 220, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 9, boxShadow: '0 10px 30px rgba(8,12,20,0.22)', zIndex: 301, padding: 5 } as React.CSSProperties}>
            {items.map((it: any, i: number) => it.sep
              ? <div key={i} style={{ height: 1, background: T.line, margin: '5px 4px' }} />
              : <button key={i} onClick={() => { onToggle(); it.on(); }} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 6, border: 'none', background: 'transparent', color: it.danger ? T.redText : T.inkMid, fontFamily: T.fBody, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' } as React.CSSProperties} onMouseEnter={e => (e.currentTarget.style.background = T.paperAlt)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {it.icon && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, flexShrink: 0, opacity: 0.85 } as React.CSSProperties}>{it.icon}</span>}
                  <span>{it.label}</span>
                </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ── View product — full read-only detail (reference "View" modal) ─────
