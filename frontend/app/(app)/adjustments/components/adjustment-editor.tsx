'use client';
// ─────────────────────────────────────────────────────────────────
// Add / Edit Stock Adjustment — the reference's full-page form:
// location, reference no, date, adjustment type (Normal = routine
// leakage/expiry, Abnormal = exceptional loss), a product search
// that adds priced lines, the recovered amount and a reason.
// Saving REMOVES the quantities from stock at the location.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { LuSearch, LuTrash2, LuInfo } from 'react-icons/lu';

const TYPE_LABEL: any = { normal: 'Normal', abnormal: 'Abnormal' };

// "2026-07-20T21:10" for datetime-local, in LOCAL time (toISOString is UTC).
function localStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AdjustmentEditor({ T, adjustment, onCancel, onDone }:
  { T: Theme; adjustment?: any; onCancel: () => void; onDone: (msg: string) => void }) {
  const editing = !!adjustment;
  const [locs, setLocs] = React.useState<any[]>([]);
  const [catalog, setCatalog] = React.useState<any[]>([]);
  const [locationId, setLocationId] = React.useState(adjustment?.location_id || '');
  const [refNo, setRefNo] = React.useState(adjustment?.ref || '');
  const [date, setDate] = React.useState(adjustment?.adjustment_date ? localStamp(new Date(adjustment.adjustment_date)) : localStamp());
  const [type, setType] = React.useState(adjustment?.type || 'normal');
  const [lines, setLines] = React.useState<any[]>(adjustment?.lines?.map((l: any) => ({
    product_id: l.product_id, name: l.product_name, sku: l.sku || '', qty: String(l.qty), unit_price: String(l.unit_price ?? 0),
  })) || []);
  const [recovered, setRecovered] = React.useState(adjustment ? String(adjustment.total_recovered || 0) : '0');
  const [reason, setReason] = React.useState(adjustment?.reason || '');
  const [q, setQ] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    API.location.list().then((l: any) => {
      setLocs(l);
      if (!editing) setLocationId((v: any) => v || String(l[0]?.id || ''));
    }).catch(() => {});
    API.product.list({ per_page: 500 }).then((r: any) => setCatalog(r.items || [])).catch(() => {});
  }, [editing]);

  // Adjustments write counted stock off the shelf — services and combos have none.
  const products = catalog.filter((p: any) => p.type !== 'combo' && p.enable_stock !== false && !p.is_archived);
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? products.filter((p: any) =>
        String(p.name || '').toLowerCase().includes(needle) ||
        String(p.sku || '').toLowerCase().includes(needle) ||
        String(p.barcode || '').toLowerCase().includes(needle))
        .filter((p: any) => !lines.some((l) => l.product_id === p.id))
        .slice(0, 8)
    : [];

  const addLine = (p: any) => {
    setLines((ls) => [...ls, { product_id: p.id, name: p.name, sku: p.sku || '', qty: '1', unit_price: String(p.cost ?? 0) }]);
    setQ('');
  };
  const setLine = (i: number, k: string, v: any) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const lineSub = (l: any) => Math.max(0, (Number(l.qty) || 0) * (Number(l.unit_price) || 0));
  const total = lines.reduce((s, l) => s + lineSub(l), 0);

  async function save() {
    if (!locationId) { setErr('Pick a business location.'); return; }
    const bad = lines.find((l) => l.product_id && !(Number(l.qty) > 0));
    if (bad) { setErr(`Enter a quantity for ${bad.name} — or remove the line.`); return; }
    const frac = lines.find((l) => l.product_id && !Number.isInteger(Number(l.qty)));
    if (frac) { setErr(`Quantity for ${frac.name} must be a whole number.`); return; }
    if (Number(recovered) < 0) { setErr('Recovered amount cannot be negative.'); return; }
    const good = lines.filter((l) => l.product_id && Number(l.qty) > 0);
    if (!good.length) { setErr('Add at least one product with a quantity.'); return; }
    setBusy(true); setErr(null);
    const body = {
      location_id: locationId,
      ref_no: refNo.trim() || undefined,
      adjustment_date: date ? new Date(date).toISOString() : undefined,
      type,
      total_recovered: Number(recovered) || 0,
      reason: reason.trim() || undefined,
      lines: good.map((l) => ({ product_id: l.product_id, qty: Number(l.qty), unit_price: Number(l.unit_price) || 0 })),
    };
    try {
      if (editing) { await API.stockAdjustment.update(adjustment.id, body); onDone('Adjustment updated'); }
      else { const a = await API.stockAdjustment.create(body); onDone(`Adjustment ${a.ref || ''} saved`.trim()); }
    } catch (ex: any) {
      setErr(ex.message || 'Could not save the adjustment.');
      setBusy(false);
    }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '9px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` };
  const num: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 12.5, fontFamily: T.fMono, textAlign: 'right', color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title={editing ? `Edit Stock Adjustment ${adjustment.ref || ''}` : 'Add Stock Adjustment'}
        subtitle="Saved quantities are removed from stock at the location" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <Panel T={T}>
            <FormGrid cols={4}>
              <Field T={T} label="Business Location *">
                <SelectField T={T} value={String(locationId)} options={['', ...locs.map((l: any) => String(l.id))]}
                  onChange={setLocationId} render={(v: any) => v === '' ? 'Please Select' : (locs.find((l: any) => String(l.id) === v) || {}).name || v} />
              </Field>
              <Field T={T} label="Reference No" hint={editing ? 'Leave blank to keep the current reference' : 'Leave blank to auto-generate'}>
                <TextField T={T} value={refNo} onChange={setRefNo} placeholder="ADJ-…" />
              </Field>
              <Field T={T} label="Date *"><TextField T={T} type="datetime-local" value={date} onChange={setDate} /></Field>
              <Field T={T} label="Adjustment type *">
                <SelectField T={T} value={type} options={['normal', 'abnormal']}
                  onChange={setType} render={(v: any) => TYPE_LABEL[v]} />
              </Field>
            </FormGrid>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 12, color: T.inkSub }}>
              <LuInfo size={14} style={{ flexShrink: 0 }} />
              Normal — routine loss (leakage, breakage, expiry). Abnormal — exceptional loss (fire, theft, flood).
            </div>
          </Panel>

          <Panel T={T}>
            {/* Product search */}
            <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto 14px' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.inkSub, display: 'inline-flex' }}><LuSearch size={15} /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products for stock adjustment"
                style={{ width: '100%', padding: '10px 13px 10px 36px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paperAlt, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box' }} />
              {matches.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 4, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 9, boxShadow: '0 10px 30px rgba(8,12,20,0.18)', overflow: 'hidden' }}>
                  {matches.map((p: any) => (
                    <button key={p.id} onClick={() => addLine(p)}
                      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: T.fBody }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = T.paperAlt)} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{p.name}</span>
                      <span style={{ fontSize: 11.5, fontFamily: T.fMono, color: T.inkSub }}>{p.sku}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.inkSub }}>{p.stock === Infinity ? '∞' : `${p.stock} in stock`}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lines */}
            <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead><tr>
                    <th style={th}>Product</th>
                    <th style={{ ...th, textAlign: 'right', width: 110 }}>Quantity</th>
                    <th style={{ ...th, textAlign: 'right', width: 130 }}>Unit Price</th>
                    <th style={{ ...th, textAlign: 'right', width: 120 }}>Subtotal</th>
                    <th style={{ ...th, width: 46 }}></th>
                  </tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.product_id}>
                        <td style={{ padding: '9px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: T.ink }}>
                          <span style={{ fontWeight: 600 }}>{l.name}</span>
                          {l.sku && <span style={{ marginLeft: 8, fontSize: 11, fontFamily: T.fMono, color: T.inkSub }}>{l.sku}</span>}
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.line}` }}>
                          <input type="number" min="1" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} style={num} />
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.line}` }}>
                          <input type="number" min="0" step="0.01" value={l.unit_price} onChange={(e) => setLine(i, 'unit_price', e.target.value)} style={num} />
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{money(lineSub(l))}</td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.line}`, textAlign: 'center' }}>
                          <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} title="Remove"
                            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <LuTrash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {lines.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: '22px 12px', textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>Search above to add products.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px', background: T.paperAlt, fontSize: 13, fontWeight: 700, color: T.ink }}>
                Total Amount:&nbsp;<span style={{ fontFamily: T.fMono }}>{money(total)}</span>
              </div>
            </div>
          </Panel>

          <Panel T={T}>
            <FormGrid>
              <Field T={T} label="Total amount recovered" hint="Insurance claim or scrap sale value">
                <TextField T={T} type="number" value={recovered} onChange={setRecovered} />
              </Field>
              <Field T={T} label="Reason">
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason"
                  style={{ width: '100%', padding: '10px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              </Field>
            </FormGrid>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <Btn T={T} kind="ghost" onClick={onCancel}>Cancel</Btn>
              <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
            </div>
            {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
