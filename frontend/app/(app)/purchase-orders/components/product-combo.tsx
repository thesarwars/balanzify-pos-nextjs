'use client';
import React from 'react';

const { useState: useStatePu } = React;

// ── Searchable product picker — filters by name / SKU / barcode ──────
// Uses a fixed-position dropdown so it escapes the line table's overflow clip.
export function ProductCombo({ T, products, value, onPick }: { T: any; products: any[]; value: any; onPick: (pid: any) => void }) {
  const selected = products.find((p: any) => p.id === value);
  const [q, setQ] = useStatePu('');
  const [open, setOpen] = useStatePu(false);
  const [hi, setHi] = useStatePu(0);
  const [rect, setRect] = useStatePu<any>(null);
  const inRef = React.useRef<any>(null);
  const ql = q.trim().toLowerCase();
  const matches = (open ? products.filter((p: any) => {
    if (!ql) return true;
    return String(p.name || '').toLowerCase().includes(ql) || String(p.sku || '').toLowerCase().includes(ql) || String(p.barcode || '').toLowerCase().includes(ql);
  }) : []).slice(0, 60);
  const shown = open ? q : (selected ? selected.name : '');

  const place = () => { const el = inRef.current; if (el) { const r = el.getBoundingClientRect(); setRect({ left: r.left, top: r.bottom + 4, width: r.width }); } };
  const choose = (p: any) => { onPick(p.id); setQ(''); setOpen(false); };

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inRef}
        value={shown}
        onChange={(e: any) => { setQ(e.target.value); setHi(0); if (!open) { setOpen(true); place(); } }}
        onFocus={() => { setOpen(true); setQ(''); setHi(0); place(); }}
        onBlur={() => setTimeout(() => setOpen(false), 140)}
        onKeyDown={(e: any) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h: any) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h: any) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && matches[hi]) { e.preventDefault(); choose(matches[hi]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        placeholder={selected ? selected.name : 'Search product / SKU…'}
        style={{ width: '100%', padding: '7px 8px', fontSize: 12, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${selected ? T.line : T.line}`, borderRadius: 7, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties}
      />
      {open && rect && matches.length > 0 && (
        <div style={{ position: 'fixed', left: rect.left, top: rect.top, width: Math.max(rect.width, 240), maxHeight: 260, overflowY: 'auto', background: T.paper, border: `1px solid ${T.line}`, borderRadius: 8, boxShadow: T.sh2 || '0 8px 24px rgba(0,0,0,.14)', zIndex: 9999 }}>
          {matches.map((p: any, i: number) => (
            <div key={p.id} onMouseDown={(e: any) => { e.preventDefault(); choose(p); }} onMouseEnter={() => setHi(i)}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 11px', cursor: 'pointer', background: i === hi ? T.paperAlt : 'transparent', borderBottom: i < matches.length - 1 ? `1px solid ${T.line}` : 'none' }}>
              <span style={{ fontSize: 12.5, color: T.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              {(p.sku || p.barcode) && <span style={{ fontSize: 11, fontFamily: T.fMono, color: T.inkSub, flexShrink: 0 }}>{p.sku || p.barcode}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
