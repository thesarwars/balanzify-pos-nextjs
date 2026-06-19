'use client';
// ─────────────────────────────────────────────────────────────────
// Sales Orders & Purchase Orders — order documents (no stock movement)
// with ordered / partial / completed status. Convert a PO into a
// received Purchase, or a SO into a finalized Sale. Wired through
// API.purchaseOrder + API.salesOrder (+ API.purchase / API.sell).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { PRODUCTS } from '@/lib/data';

const { useState: useStateOr, useEffect: useEffectOr } = React;

export function Orders({ T }: { T: Theme }) {
  const [tab, setTab] = useStateOr<any>('purchase');
  const [poRows, setPoRows] = useStateOr<any[]>([]);
  const [soRows, setSoRows] = useStateOr<any[]>([]);
  const [parties, setParties] = useStateOr<any>({ suppliers: [], customers: [] });
  const [locs, setLocs] = useStateOr<any[]>([]);
  const [edit, setEdit] = useStateOr<any>(false);
  const [view, setView] = useStateOr<any>(null);
  const [show, node] = useToast();

  const reloadPO = React.useCallback(() => API.purchaseOrder.list().then(setPoRows).catch(() => {}), []);
  const reloadSO = React.useCallback(() => API.salesOrder.list().then(setSoRows).catch(() => {}), []);
  useEffectOr(() => { reloadPO(); reloadSO(); }, [reloadPO, reloadSO]);
  useEffectOr(() => {
    API.contact.list({ type: 'supplier' }).then((s: any) => setParties((p: any) => ({ ...p, suppliers: s }))).catch(() => {});
    API.contact.list({ type: 'customer' }).then((c: any) => setParties((p: any) => ({ ...p, customers: c }))).catch(() => {});
    API.location.list().then(setLocs).catch(() => {});
  }, []);

  const isPO = tab === 'purchase';
  const rows = isPO ? poRows : soRows;
  const api: any = isPO ? API.purchaseOrder : API.salesOrder;
  const tone: any = { ordered: 'amber', partial: 'blue', completed: 'green' };
  const label: any = { ordered: 'Ordered', partial: 'Partial', completed: 'Completed' };

  async function convert(o: any) {
    try {
      if (isPO) {
        await API.purchase.create({ supplier_id: o.supplier_id, location_id: o.location_id, status: 'received', lines: o.lines.map((l: any) => ({ product_id: l.product_id, qty: l.qty, unit_cost: l.unit_cost })) });
        await API.purchaseOrder.setStatus(o.id, 'completed');
        show('Received as purchase · stock updated'); reloadPO();
      } else {
        await API.sell.create({ location_id: o.location_id, contact_id: o.contact_id, customer_name: o.party_name, method: 'cash', amount: o.total, payments: [{ method: 'cash', amount: o.total }], lines: o.lines.map((l: any) => ({ product_id: l.product_id, quantity: l.qty, unit_price: l.unit_price })) });
        await API.salesOrder.setStatus(o.id, 'completed');
        show('Converted to sale'); reloadSO();
      }
    } catch (e: any) { show(e.message); }
  }
  async function del(o: any) { try { await api.remove(o.id); show('Order deleted'); isPO ? reloadPO() : reloadSO(); } catch (e: any) { show(e.message); } }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Orders" subtitle="Purchase & sales order documents"
        right={<Btn T={T} kind="accent" onClick={() => setEdit(true)}>+ New {isPO ? 'Purchase' : 'Sales'} Order</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
            {[['purchase', 'Purchase Orders', poRows.length], ['sales', 'Sales Orders', soRows.length]].map(([id, lbl, n]: any) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl} <span style={{ opacity: 0.7 }}>· {n}</span></button>
            ))}
          </div>
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[['Reference', 'l'], [isPO ? 'Supplier' : 'Customer', 'l'], ['Location', 'l'], ['Items', 'r'], ['Total', 'r'], ['Date', 'l'], ['Status', 'l'], ['', 'r']].map(([h, a]: any, i: number) => (
                <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((o: any) => (
                  <tr key={o.id} style={{ transition: 'background .12s' }} onMouseEnter={(e: any) => e.currentTarget.style.background = T.paperAlt} onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}>
                    <td onClick={() => setView(o)} style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.accent.text, cursor: 'pointer' }}>{o.ref}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{o.party_name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{o.location_name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{o.item_count}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{money(o.total)}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub }}>{o.date}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={tone[o.status]}>{label[o.status]}</Badge></td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                        {o.status !== 'completed' && <button onClick={() => convert(o)} style={orMini(T, 'accent')}>{isPO ? 'Receive' : 'Convert'}</button>}
                        <button onClick={() => del(o)} style={orMini(T, 'danger')}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No {isPO ? 'purchase' : 'sales'} orders yet.</div>}
          </Panel>
          <div style={{ fontSize: 11.5, color: T.inkMute, marginTop: 12, lineHeight: 1.5 }}>{isPO ? 'Purchase orders don’t add stock. “Receive” converts the order into a purchase, adding stock and the supplier liability.' : 'Sales orders don’t deduct stock. “Convert” finalizes the order into a sale.'}</div>
        </div>
      </div>

      {edit && <OrderEditor T={T} isPO={isPO} parties={parties} locs={locs} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); show('Order created'); isPO ? reloadPO() : reloadSO(); }} />}
      {view && <OrderView T={T} order={view} isPO={view._isPO != null ? view._isPO : isPO} onClose={() => setView(null)} />}
      {node}
    </div>
  );
}

function OrderEditor({ T, isPO, parties, locs, onClose, onSaved }: { T: Theme; isPO: boolean; parties: any; locs: any[]; onClose: () => void; onSaved: () => void }) {
  const list = isPO ? parties.suppliers : parties.customers;
  const [partyId, setPartyId] = useStateOr<any>('');
  const [locId, setLocId] = useStateOr<any>((locs[0] || {}).id || 1);
  const [date, setDate] = useStateOr<any>(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useStateOr<any[]>([{ product_id: '', qty: '', price: '' }]);
  const [busy, setBusy] = useStateOr<any>(false);
  const [err, setErr] = useStateOr<any>(null);
  const products = PRODUCTS.filter((p: any) => p.type !== 'combo');
  const setLine = (i: number, k: string, v: any) => setLines((ls: any[]) => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const onPick = (i: number, pid: any) => { const p = products.find((p: any) => p.id === pid); setLines((ls: any[]) => ls.map((l, j) => j === i ? { ...l, product_id: pid, price: l.price || (p ? String(isPO ? p.cost : p.price) : '') } : l)); };
  const total = lines.reduce((s: number, l: any) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const ls = lines.filter((l: any) => l.product_id && Number(l.qty) > 0);
      if (isPO) await API.purchaseOrder.create({ supplier_id: partyId, location_id: locId, date, lines: ls.map((l: any) => ({ product_id: l.product_id, qty: Number(l.qty), unit_cost: Number(l.price || 0) })) });
      else await API.salesOrder.create({ contact_id: partyId, location_id: locId, date, lines: ls.map((l: any) => ({ product_id: l.product_id, qty: Number(l.qty), unit_price: Number(l.price || 0) })) });
      onSaved();
    } catch (ex: any) { setErr(ex.message || 'Could not save the order.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title={`New ${isPO ? 'purchase' : 'sales'} order`} subtitle={isPO ? 'Request goods from a supplier' : 'Order from a customer'} width={680} onClose={onClose}
      footer={<><div style={{ flex: 1, fontSize: 13, color: T.inkSub }}>Total <b style={{ color: T.ink, fontFamily: T.fMono, marginLeft: 6 }}>{money(total)}</b></div><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Create order'}</Btn></>}>
      <FormGrid>
        <Field T={T} label={isPO ? 'Supplier' : 'Customer'}><SelectField T={T} value={String(partyId)} options={['', ...list.map((p: any) => String(p.id))]} onChange={(v: any) => setPartyId(v)} render={(v: any) => v ? (list.find((p: any) => String(p.id) === v) || {}).name : 'Select…'} /></Field>
        <Field T={T} label="Location"><SelectField T={T} value={String(locId)} options={locs.map((l: any) => String(l.id))} onChange={(v: any) => setLocId(Number(v))} render={(v: any) => (locs.find((l: any) => String(l.id) === v) || {}).name} /></Field>
        <Field T={T} label="Date"><TextField T={T} type="date" value={date} onChange={setDate} /></Field>
      </FormGrid>
      <div style={{ marginTop: 18, marginBottom: 9, fontSize: 12, fontWeight: 700, color: T.inkSub }}>PRODUCTS</div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 34px', gap: 8, padding: '8px 12px', background: T.paperAlt, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub } as React.CSSProperties}><span>Product</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>{isPO ? 'Cost' : 'Price'}</span><span></span></div>
        {lines.map((l: any, i: number) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 34px', gap: 8, padding: '8px 12px', borderTop: `1px solid ${T.line}`, alignItems: 'center' }}>
            <select value={l.product_id} onChange={(e: any) => onPick(i, e.target.value)} style={{ padding: '8px 10px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none' }}>
              <option value="">Select product…</option>{products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" value={l.qty} onChange={(e: any) => setLine(i, 'qty', e.target.value)} placeholder="0" style={onum(T)} />
            <input type="number" value={l.price} onChange={(e: any) => setLine(i, 'price', e.target.value)} placeholder="0.00" style={onum(T)} />
            <button onClick={() => setLines((ls: any[]) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: lines.length === 1 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: lines.length === 1 ? 0.4 : 1 }}>✕</button>
          </div>
        ))}
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.line}` }}><button onClick={() => setLines((ls: any[]) => [...ls, { product_id: '', qty: '', price: '' }])} style={{ background: 'none', border: 'none', color: T.accent.text, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: T.fBody }}>+ Add product</button></div>
      </div>
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function OrderView({ T, order, isPO, onClose }: { T: Theme; order: any; isPO: boolean; onClose: () => void }) {
  return (
    <Modal T={T} title={order.ref} subtitle={`${order.party_name} · ${order.location_name} · ${order.date}`} width={500} onClose={onClose} footer={null}>
      <div style={{ marginBottom: 14 }}><Badge T={T} tone={order.status === 'completed' ? 'green' : order.status === 'partial' ? 'blue' : 'amber'}>{({ ordered: 'Ordered', partial: 'Partial', completed: 'Completed' } as any)[order.status]}</Badge></div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px', padding: '8px 12px', background: T.paperAlt, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub } as React.CSSProperties}><span>Product</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Total</span></div>
        {(order.lines || []).map((l: any, i: number) => { const p: any = PRODUCTS.find((x: any) => parseInt(String(x.id).replace(/\D/g, ''), 10) === l.product_id) || {}; const unit = l.unit_cost != null ? l.unit_cost : l.unit_price; return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px', padding: '9px 12px', borderTop: `1px solid ${T.line}`, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: T.ink }}>{p.name || 'Product #' + l.product_id}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{l.qty}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.ink }}>{money(l.qty * unit)}</span>
          </div>
        ); })}
      </div>
    </Modal>
  );
}

function onum(T: Theme): React.CSSProperties { return { width: '100%', padding: '7px 9px', fontSize: 12.5, fontFamily: T.fMono, textAlign: 'right', color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none', boxSizing: 'border-box' }; }
function orMini(T: Theme, kind: string): React.CSSProperties { const danger = kind === 'danger', accent = kind === 'accent'; return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${accent ? T.accent.base : danger ? T.redSoft : T.line}`, background: accent ? T.accent.base : danger ? T.redSoft : T.paper, color: accent ? T.accent.on : danger ? T.redText : T.inkMid }; }
