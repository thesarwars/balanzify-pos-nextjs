'use client';
import React from 'react';
import { Modal, Btn, Field, TextField, SelectField } from '@/components/kit';
import { useSession } from '@/components/shell';
import { API } from '@/lib/api';
import { BUSINESS, PRODUCTS } from '@/lib/data';

// ─────────────────────────────────────────────────────────────────
// Print Labels — the manual's barcode-label tool. Pick products and
// quantities, choose which info to show, preview a label sheet, print.
// Pure client-side (works on the live catalog); no API needed.
// ─────────────────────────────────────────────────────────────────
const { useState: useStateLb } = React;

// deterministic Code128-ish bar pattern from a string (visual only)
function barsFor(code: any) {
  let seed = 0; const s = String(code || 'SKU');
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  const bars = []; let x = seed;
  for (let i = 0; i < 34; i++) { x = (x * 1103515245 + 12345) >>> 0; bars.push({ w: 1 + (x % 3), on: i % 2 === 0 }); }
  return bars;
}
function Barcode({ code, height = 34, color = '#111' }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, height }}>
      {barsFor(code).map((b: any, i: number) => (
        <span key={i} style={{ width: b.w, height: '100%', background: b.on ? color : 'transparent' }} />
      ))}
    </div>
  );
}

// Expand a catalog product into label rows: a variable product yields one row
// per variation (its own SKU / barcode / price); everything else is one row.
function toLabelItems(p: any): any[] {
  if (p.type === 'variable' && Array.isArray(p.variations) && p.variations.length) {
    return p.variations.map((v: any) => ({
      key: `${p.id}::${v.id}`,
      name: `${p.name} — ${v.name}`,
      sku: v.sub_sku || p.sku,
      price: v.price != null ? Number(v.price) : Number(p.price || 0),
      qty: 1,
    }));
  }
  return [{ key: String(p.id), name: p.name, sku: p.sku, price: Number(p.price || 0), qty: 1 }];
}

// `initial` seeds one label per product; `initialItems` seeds pre-built rows so a
// caller (e.g. a purchase) can set its own per-row quantities.
export function PrintLabels({ T, onClose, initial, initialItems, products }: any) {
  const session = useSession();
  const bizName = (session && session.business_name) || BUSINESS.name;
  const catalog = (products && products.length) ? products : PRODUCTS;
  const [items, setItems] = useStateLb(() => (initialItems && initialItems.length) ? initialItems : (initial || []).flatMap((p: any) => toLabelItems(p)));
  const [q, setQ] = useStateLb('');
  const [opts, setOpts] = useStateLb<any>({ business: true, name: true, price: true, sku: true });
  const [perRow, setPerRow] = useStateLb(3);
  // Saved sticker-sheet geometries. When one is chosen the printout uses real
  // inches (paper size, margins, gaps); otherwise it falls back to the simple
  // "labels per row" grid.
  const [sheets, setSheets] = useStateLb<any[]>([]);
  const [sheetId, setSheetId] = useStateLb('');
  React.useEffect(() => {
    API.barcodeSetting.list().then((rows: any[]) => {
      setSheets(rows || []);
      const def = (rows || []).find((r: any) => r.is_default);
      if (def) setSheetId(String(def.id));
    }).catch(() => setSheets([]));
  }, []);
  const sheet = sheets.find((x: any) => String(x.id) === sheetId) || null;

  const found = q.trim() ? catalog.filter((p: any) => p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku || '').toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  // Adding a product appends any of its label rows not already present (by key).
  const add = (p: any) => { setItems((it: any) => { const have = new Set(it.map((x: any) => x.key)); return [...it, ...toLabelItems(p).filter((r: any) => !have.has(r.key))]; }); setQ(''); };
  const setQty = (key: any, v: any) => setItems((it: any) => it.map((x: any) => x.key === key ? { ...x, qty: Math.max(1, v) } : x));
  const rm = (key: any) => setItems((it: any) => it.filter((x: any) => x.key !== key));

  const labels: any[] = [];
  items.forEach((it: any) => { for (let i = 0; i < it.qty; i++) labels.push(it); });

  function doPrint() {
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    const inner = (p: any) => `
      ${opts.business ? `<div class="biz">${bizName}</div>` : ''}
      ${opts.name ? `<div class="nm">${p.name}</div>` : ''}
      <div class="bars">${barsFor(p.sku).map((b: any) => `<span style="width:${b.w}px;background:${b.on ? '#111' : 'transparent'}"></span>`).join('')}</div>
      ${opts.sku ? `<div class="sku">${p.sku}</div>` : ''}
      ${opts.price ? `<div class="pr">$${p.price.toFixed(2)}</div>` : ''}`;

    let css: string;
    let bodyHtml: string;

    if (sheet) {
      const { sticker_width: sw, sticker_height: sh, top_margin: tm, left_margin: lm,
              stickers_in_one_row: perRowS, row_distance: rg, col_distance: cg,
              is_continuous: roll, paper_width: pw, paper_height: ph, stickers_per_sheet: perSheet } = sheet;
      // A roll prints one label per page; sheet stock paginates every perSheet labels.
      const page = roll ? `${sw}in ${sh}in` : `${pw}in ${ph}in`;
      css = `@page { size: ${page}; margin: 0 }
        body { margin:0; background:#fff }
        .sheet { box-sizing:border-box; padding:${tm}in 0 0 ${lm}in; page-break-after:always; }
        .sheet:last-child { page-break-after:auto }
        .grid { display:grid; grid-template-columns:repeat(${roll ? 1 : perRowS}, ${sw}in); column-gap:${cg}in; row-gap:${rg}in; }
        .cell { width:${sw}in; height:${sh}in; box-sizing:border-box; overflow:hidden;
                display:flex; flex-direction:column; align-items:center; justify-content:center;
                gap:1px; text-align:center; font-family:system-ui,sans-serif; }
        .bars { display:flex; align-items:flex-end; height:${Math.max(0.18, Number(sh) * 0.38)}in; margin:1px 0 }
        .bars span { height:100% }
        .biz{font-size:7pt;color:#666;font-weight:600} .nm{font-size:8pt;font-weight:700;color:#111;line-height:1.1}
        .sku{font-size:6.5pt;font-family:monospace;color:#333;letter-spacing:.5px} .pr{font-size:9pt;font-weight:700;color:#111}
        @media screen { .sheet { outline:1px dashed #ccc; margin:10px auto; width:${roll ? sw : pw}in } }`;
      const chunk = roll ? 1 : Math.max(1, Number(perSheet) || perRowS);
      const sheetsHtml: string[] = [];
      for (let i = 0; i < labels.length; i += chunk) {
        const cells = labels.slice(i, i + chunk).map((p: any) => `<div class="cell">${inner(p)}</div>`).join('');
        sheetsHtml.push(`<div class="sheet"><div class="grid">${cells}</div></div>`);
      }
      bodyHtml = sheetsHtml.join('');
    } else {
      css = `body { margin:14px; background:#fff }
        .grid { display:grid; grid-template-columns:repeat(${perRow},1fr); gap:8px }
        .cell { border:1px dashed #ccc; border-radius:6px; padding:8px 10px; display:flex; flex-direction:column;
                align-items:center; gap:3px; text-align:center; font-family:system-ui,sans-serif }
        .bars { display:flex; align-items:flex-end; height:30px; margin:2px 0 } .bars span { height:100% }
        .biz{font-size:9px;color:#666;font-weight:600;letter-spacing:.3px} .nm{font-size:11px;font-weight:700;color:#111;line-height:1.15}
        .sku{font-size:9px;font-family:monospace;color:#333;letter-spacing:1px} .pr{font-size:13px;font-weight:700;color:#111}`;
      bodyHtml = `<div class="grid">${labels.map((p: any) => `<div class="cell">${inner(p)}</div>`).join('')}</div>`;
    }

    w.document.write(`<html><head><title>Labels — ${bizName}</title><style>${css}</style></head><body>
      ${bodyHtml}
      <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
      </body></html>`);
    w.document.close();
  }

  return (
    <Modal T={T} title="Print Labels" subtitle="Barcode labels for your products" width={720} onClose={onClose}
      footer={<><div style={{ flex: 1, fontSize: 13, color: T.inkSub }}>{labels.length} label{labels.length === 1 ? '' : 's'}{sheet && !sheet.is_continuous && sheet.stickers_per_sheet > 0 ? ` · ${Math.ceil(labels.length / sheet.stickers_per_sheet)} sheet${Math.ceil(labels.length / sheet.stickers_per_sheet) === 1 ? '' : 's'}` : ''}</div><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={doPrint} disabled={!labels.length}>⎙ Print</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'min(100%, 280px) 1fr', gap: 18 }}>
        {/* left: add products + options */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 } as React.CSSProperties}>Products</div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or SKU…" style={{ width: '100%', padding: '9px 11px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box' }} />
            {found.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, background: T.paper, border: `1px solid ${T.line}`, borderRadius: T.r, boxShadow: T.sh2, overflow: 'hidden' }}>
                {found.map((p: any) => <button key={p.id} onClick={() => add(p)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', border: 'none', borderBottom: `1px solid ${T.line}`, background: T.paper, cursor: 'pointer', fontSize: 12.5, color: T.ink, fontFamily: T.fBody } as React.CSSProperties}>{p.name} <span style={{ color: T.inkSub, fontFamily: T.fMono, fontSize: 11 }}>{p.sku}</span></button>)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {items.length === 0 && <div style={{ fontSize: 12, color: T.inkMute, padding: '8px 0' }}>Search to add products.</div>}
            {items.map((it: any) => (
              <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                  <span style={{ display: 'block', fontSize: 10.5, fontFamily: T.fMono, color: T.inkSub }}>{it.sku}</span>
                </span>
                <input type="number" value={it.qty} onChange={e => setQty(it.key, Number(e.target.value))} style={{ width: 50, padding: '5px 7px', fontSize: 12.5, fontFamily: T.fMono, textAlign: 'right', color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 6, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} />
                <button onClick={() => rm(it.key)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 11 }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 } as React.CSSProperties}>Show on label</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {([['business', 'Business name'], ['name', 'Product name'], ['price', 'Price'], ['sku', 'SKU / barcode']] as any[]).map(([k, lbl]: any) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.inkMid, cursor: 'pointer' }}>
                <input type="checkbox" checked={opts[k]} onChange={e => setOpts((o: any) => ({ ...o, [k]: e.target.checked }))} style={{ accentColor: T.accent.base, width: 15, height: 15 }} />{lbl}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 6 } as React.CSSProperties}>Barcode setting</div>
            <SelectField T={T} value={sheetId} options={['', ...sheets.map((x: any) => String(x.id))]} onChange={(v: any) => setSheetId(v)}
              render={(v: any) => {
                if (!v) return 'Simple grid (no sheet)';
                const x = sheets.find((y: any) => String(y.id) === v);
                if (!x) return 'Simple grid (no sheet)';
                return x.is_continuous
                  ? `${x.name} — roll ${x.sticker_width}" × ${x.sticker_height}"`
                  : `${x.name} — ${x.stickers_per_sheet} per sheet, ${x.paper_width}" × ${x.paper_height}"`;
              }} />
            <div style={{ fontSize: 11, color: T.inkMute, marginTop: 5, lineHeight: 1.45 }}>
              {sheet ? 'Prints to the exact sticker geometry (inches).' : <>No sheet selected — labels print as a simple grid. Define sheets in <b>Settings → Barcode Settings</b>.</>}
            </div>
          </div>
          {!sheet && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: T.inkSub }}>Per row</span>
              <SelectField T={T} value={String(perRow)} options={['2', '3', '4', '5']} onChange={(v: any) => setPerRow(Number(v))} />
            </div>
          )}
        </div>

        {/* right: live preview */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 } as React.CSSProperties}>Preview</div>
          <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: T.r, padding: 12, minHeight: 220, maxHeight: 320, overflowY: 'auto' }}>
            {labels.length === 0 ? <div style={{ textAlign: 'center', color: T.inkMute, fontSize: 12.5, padding: '70px 0' }}>Add products to preview labels.</div> : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sheet ? (sheet.is_continuous ? 1 : sheet.stickers_in_one_row) : perRow}, 1fr)`, gap: 8 }}>
                {labels.slice(0, 24).map((p: any, i: number) => (
                  <div key={i} style={{ border: '1px dashed #cbb', borderRadius: 6, padding: '8px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center' } as React.CSSProperties}>
                    {opts.business && <div style={{ fontSize: 8, color: '#888', fontWeight: 700 }}>{bizName}</div>}
                    {opts.name && <div style={{ fontSize: 10, fontWeight: 700, color: '#111', lineHeight: 1.1 }}>{p.name}</div>}
                    <Barcode code={p.sku} height={26} />
                    {opts.sku && <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#444', letterSpacing: 1 }}>{p.sku}</div>}
                    {opts.price && <div style={{ fontSize: 12, fontWeight: 800, color: '#111' }}>${p.price.toFixed(2)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {labels.length > 24 && <div style={{ fontSize: 11, color: T.inkMute, marginTop: 6 }}>Showing first 24 — all {labels.length} print.</div>}
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────
// Import / Export products — the manual's bulk product tools.
// Export: download the catalog as CSV in the import-template format.
// Import: upload/paste CSV → validate per row (unit/category checks,
// like the manual's common errors) → create each via API.product.
// ─────────────────────────────────────────────────────────────────
