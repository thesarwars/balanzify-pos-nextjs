'use client';
import React from 'react';
import { Modal, Btn, SelectField, swatchBg } from '@/components/kit';
import { money } from '@/lib/theme';
import { API } from '@/lib/api';
import { thStyle, tdStyle } from './list-table';

export function ViewProductModal({ T, product, refs, cats, onClose, onEdit }: any) {
  const [full, setFull] = React.useState<any>(product);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    API.product.get(product.id).then((p: any) => setFull(p)).catch(() => setFull(product)).finally(() => setLoading(false));
  }, [product.id]);
  const raw = (full && full._real) || {};
  const variants: any[] = Array.isArray(raw.variants) ? raw.variants : [];
  const stockLevels: any[] = Array.isArray(raw.stockLevels) ? raw.stockLevels : [];
  const locName = (id: any) => (refs.locations.find((l: any) => String(l.id) === String(id)) || {}).name || '—';
  const availLocs = (Array.isArray(full.location_ids) && full.location_ids.length) ? full.location_ids.map(locName).join(', ') : 'All locations';
  const taxName = (refs.taxRates.find((t: any) => String(t.id) === String(full.tax_id)) || {}).name || 'None';
  const catName = full.category_name || cats.find((c: any) => c.id === full.cat)?.name || '—';
  const attrName = (a: any) => { try { return Object.values(a || {}).join(' / '); } catch { return ''; } };
  const skuOf = (v: any) => v.sku || v.sub_sku || full.sku;

  const info: [string, any][] = [
    ['SKU', full.sku], ['Brand', full.brand_name || (refs.brands.find((b: any) => String(b.id) === String(full.brand_id)) || {}).name || '—'],
    ['Unit', full.unit], ['Barcode Type', full.barcode_type || 'C128'],
    ['Category', catName], ['Available in locations', availLocs],
    ['Manage stock?', full.enable_stock === false ? 'No' : 'Yes'], ['Alert quantity', (full.alert_quantity || 0) + ' ' + full.unit],
    ['Applicable Tax', taxName], ['Selling Price Tax Type', full.selling_price_tax_type === 'inclusive' ? 'Inclusive' : 'Exclusive'],
    ['Product Type', ({ single: 'Single', variable: 'Variable', combo: 'Combo' } as any)[full.type || 'single']],
  ];

  return (
    <Modal T={T} title={full.name} subtitle={full.sku} width={920} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={onEdit}>Edit product</Btn></>}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 300, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 18px' }}>
          {info.map(([k, v]) => (
            <div key={k} style={{ fontSize: 12.5 }}><span style={{ color: T.inkSub }}>{k}: </span><b style={{ color: T.ink }}>{v}</b></div>
          ))}
        </div>
        <div style={{ width: 180, height: 130, borderRadius: T.r, border: `1px solid ${T.line}`, background: swatchBg(full), flexShrink: 0, backgroundSize: 'cover' } as React.CSSProperties} />
      </div>

      {full.type === 'variable' && variants.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Variations</div>
          <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: T.r }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead><tr>{['Variation', 'SKU', 'Purchase', 'Margin %', 'Selling'].map((h, i) => <th key={h} style={thStyle(T, i > 1 ? 'r' : 'l')}>{h}</th>)}</tr></thead>
              <tbody>
                {variants.map((v: any) => {
                  const cost = Number(v.costPrice || 0), price = Number(v.sellingPrice || 0);
                  const margin = price ? Math.round(((price - cost) / price) * 100) : 0;
                  return (
                    <tr key={v.id}>
                      <td style={tdStyle(T)}>{attrName(v.attributes) || '—'}</td>
                      <td style={{ ...tdStyle(T), fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{skuOf(v)}</td>
                      <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono }}>{money(cost)}</td>
                      <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{margin}%</td>
                      <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, fontWeight: 600 }}>{money(price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Product stock details</div>
        <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: T.r }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead><tr>{['SKU', 'Location', 'Unit Price', 'Current stock', 'Stock value'].map((h, i) => <th key={h} style={thStyle(T, i > 1 ? 'r' : 'l')}>{h}</th>)}</tr></thead>
            <tbody>
              {stockLevels.length === 0 && <tr><td colSpan={5} style={{ padding: 22, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>No stock recorded yet.</td></tr>}
              {stockLevels.map((sl: any, i: number) => {
                const v = variants.find((x: any) => x.id === sl.variantId);
                const price = v ? Number(v.sellingPrice || 0) : full.price;
                const cost = v ? Number(v.costPrice || 0) : full.cost;
                return (
                  <tr key={i}>
                    <td style={{ ...tdStyle(T), fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{v ? skuOf(v) : full.sku}{v && attrName(v.attributes) ? ` · ${attrName(v.attributes)}` : ''}</td>
                    <td style={tdStyle(T)}>{(sl.location && sl.location.name) || locName(sl.locationId)}</td>
                    <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono }}>{money(price)}</td>
                    <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono }}>{sl.quantity} {full.unit}</td>
                    <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{money((sl.quantity || 0) * cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && <div style={{ padding: 10, textAlign: 'center', fontSize: 11.5, color: T.inkMute }}>Loading latest stock…</div>}
      </div>
    </Modal>
  );
}

// ── Product stock history — movement log + in/out summary (live) ───────
export function StockHistoryModal({ T, product, onClose }: any) {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    API.product.movements(product.id).then((m: any) => setRows(Array.isArray(m) ? m : [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, [product.id]);
  const totalIn = rows.filter((r: any) => r.quantity > 0).reduce((s: number, r: any) => s + r.quantity, 0);
  const totalOut = rows.filter((r: any) => r.quantity < 0).reduce((s: number, r: any) => s + Math.abs(r.quantity), 0);
  const typeLabel = (t: any) => String(t || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  const stat = (label: string, val: any) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}><span style={{ color: T.inkSub }}>{label}</span><b style={{ fontFamily: T.fMono, color: T.ink }}>{val} {product.unit}</b></div>
  );
  return (
    <Modal T={T} title="Product stock history" subtitle={product.name} width={880} onClose={onClose} footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 18 }}>
        <div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 4 } as React.CSSProperties}>Quantities In</div>{stat('Total received', totalIn)}</div>
        <div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 4 } as React.CSSProperties}>Quantities Out</div>{stat('Total out', totalOut)}</div>
        <div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 4 } as React.CSSProperties}>Totals</div>{stat('Current stock', product.stock === Infinity ? '∞' : product.stock)}</div>
      </div>
      <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: T.r }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr>{['Type', 'Qty change', 'New qty', 'Date', 'Reference', 'By'].map((h, i) => <th key={h} style={thStyle(T, i === 1 || i === 2 ? 'r' : 'l')}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && !loading && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>No stock movements yet.</td></tr>}
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td style={tdStyle(T)}>{typeLabel(r.type)}</td>
                <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, color: r.quantity >= 0 ? T.greenText : T.redText }}>{r.quantity >= 0 ? '+' : ''}{r.quantity}</td>
                <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{r.balance_after ?? '—'}</td>
                <td style={{ ...tdStyle(T), fontSize: 12, color: T.inkSub }}>{r.date ? String(r.date).slice(0, 16).replace('T', ' ') : ''}</td>
                <td style={{ ...tdStyle(T), fontSize: 12, fontFamily: T.fMono, color: T.inkSub }}>{r.reference_type ? typeLabel(r.reference_type) : (r.notes || '—')}</td>
                <td style={{ ...tdStyle(T), fontSize: 12, color: T.inkSub }}>{r.by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && <div style={{ padding: 10, textAlign: 'center', fontSize: 11.5, color: T.inkMute }}>Loading movements…</div>}
    </Modal>
  );
}

// ── Add / edit opening stock — designed; connects when the opening-stock
//    write path lands (variant POST accepts opening_stock; a bulk editor
//    endpoint is pending). ────────────────────────────────────────────
export function OpeningStockModal({ T, product, refs, onClose, toast }: any) {
  const loc0 = (refs.locations[0] || {});
  const [locId, setLocId] = React.useState(loc0.id || '');
  const lines = (product.variations && product.variations.length)
    ? product.variations.map((v: any) => ({ key: v.id, name: `${product.name} (${v.name})`, cost: v.cost || product.cost }))
    : [{ key: product.id, name: product.name, cost: product.cost }];
  const [rowsState, setRowsState] = React.useState<any>(() => Object.fromEntries(lines.map((l: any) => [l.key, { qty: '', cost: String(l.cost || ''), note: '' }])));
  const set = (k: any, field: string, v: any) => setRowsState((s: any) => ({ ...s, [k]: { ...s[k], [field]: v } }));
  const total = lines.reduce((s: number, l: any) => s + (Number(rowsState[l.key]?.qty) || 0) * (Number(rowsState[l.key]?.cost) || 0), 0);

  return (
    <Modal T={T} title="Add opening stock" subtitle={product.name} width={780} onClose={onClose}
      footer={<><div style={{ flex: 1, fontSize: 11.5, color: T.inkMute }}>Saving connects when the opening-stock write path lands.</div><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={() => { onClose(); toast('Opening-stock editing is on the way — nothing saved yet.'); }}>Save</Btn></>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSub }}>Location</span>
        <div style={{ minWidth: 200 }}>
          <SelectField T={T} value={locId} options={refs.locations.map((l: any) => String(l.id))} onChange={setLocId} render={(v: any) => (refs.locations.find((l: any) => String(l.id) === v) || {}).name || v} />
        </div>
      </div>
      <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: T.r }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead><tr>{['Product', 'Qty remaining', 'Unit cost', 'Subtotal', 'Note'].map((h, i) => <th key={h} style={thStyle(T, i === 3 ? 'r' : 'l')}>{h}</th>)}</tr></thead>
          <tbody>
            {lines.map((l: any) => {
              const r = rowsState[l.key] || {};
              return (
                <tr key={l.key}>
                  <td style={{ ...tdStyle(T), fontSize: 12.5, fontWeight: 600, color: T.ink }}>{l.name}</td>
                  <td style={tdStyle(T)}><input type="number" value={r.qty} onChange={e => set(l.key, 'qty', e.target.value)} placeholder="0" style={osInput(T)} /></td>
                  <td style={tdStyle(T)}><input type="number" value={r.cost} onChange={e => set(l.key, 'cost', e.target.value)} placeholder="0.00" style={osInput(T)} /></td>
                  <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, color: T.ink }}>{money((Number(r.qty) || 0) * (Number(r.cost) || 0))}</td>
                  <td style={tdStyle(T)}><input value={r.note} onChange={e => set(l.key, 'note', e.target.value)} placeholder="optional" style={osInput(T)} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr style={{ background: T.paperAlt }}><td style={{ ...tdStyle(T), fontWeight: 700 }} colSpan={3}>Total (before tax)</td><td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, fontWeight: 700 }}>{money(total)}</td><td style={tdStyle(T)} /></tr></tfoot>
        </table>
      </div>
    </Modal>
  );
}
function osInput(T: any): React.CSSProperties {
  return { width: '100%', padding: '7px 9px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 6, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties;
}
