'use client';
// ─────────────────────────────────────────────────────────────────
// Searchable select — a text input that filters a long option list.
// Used for the IANA time-zone picker, which is far too long for a
// plain <select>. The dropdown is fixed-positioned so it escapes any
// scrolling/overflow ancestor.
// ─────────────────────────────────────────────────────────────────
import React from 'react';

const { useState, useRef } = React;

export function SearchSelect({ T, value, options, onChange, placeholder = 'Search…', emptyLabel = 'None' }: {
  T: any; value: string; options: string[]; onChange: (v: string) => void; placeholder?: string; emptyLabel?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<any>(null);
  const inRef = useRef<any>(null);

  const ql = q.trim().toLowerCase();
  const matches = open
    ? ['', ...options].filter((o) => !ql || o.toLowerCase().includes(ql)).slice(0, 300)
    : [];
  const shown = open ? q : (value || '');

  const place = () => { const el = inRef.current; if (el) { const r = el.getBoundingClientRect(); setRect({ left: r.left, top: r.bottom + 4, width: r.width }); } };
  const choose = (o: string) => { onChange(o); setQ(''); setOpen(false); };

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inRef}
        value={shown}
        onChange={(e: any) => { setQ(e.target.value); setHi(0); if (!open) { setOpen(true); place(); } }}
        onFocus={() => { setOpen(true); setQ(''); setHi(0); place(); }}
        onBlur={() => setTimeout(() => setOpen(false), 140)}
        onKeyDown={(e: any) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h: number) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h: number) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && matches[hi] !== undefined) { e.preventDefault(); choose(matches[hi]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        placeholder={value || placeholder}
        style={{ width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties}
      />
      {open && rect && matches.length > 0 && (
        <div style={{ position: 'fixed', left: rect.left, top: rect.top, width: Math.max(rect.width, 240), maxHeight: 260, overflowY: 'auto', background: T.paper, border: `1px solid ${T.line}`, borderRadius: 8, boxShadow: T.sh2 || '0 8px 24px rgba(0,0,0,.14)', zIndex: 9999 } as React.CSSProperties}>
          {matches.map((o, i) => (
            <div key={o || '__none'} onMouseDown={(e: any) => { e.preventDefault(); choose(o); }} onMouseEnter={() => setHi(i)}
              style={{ padding: '8px 11px', cursor: 'pointer', fontSize: 12.75, background: i === hi ? T.paperAlt : 'transparent', color: o ? T.ink : T.inkSub, borderBottom: i < matches.length - 1 ? `1px solid ${T.line}` : 'none' }}>
              {o || emptyLabel}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
