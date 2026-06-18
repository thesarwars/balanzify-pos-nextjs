'use client';
// ─────────────────────────────────────────────────────────────────
// Wholesale — B2B order lifecycle for shop/trade customers: create at
// wholesale prices, warehouse pick, dispatch with driver, deliver, then
// collect payment. Outstanding balances rolled up per customer.
// A paid add-on: shows an enable prompt unless the Wholesale module is on.
// Wired through API.wholesale (/api/v1/wholesale).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useS, useEffect: useE, useCallback: useCb } = React;

const STATUS_TONE: any = { pending: 'gray', picked: 'blue', out_for_delivery: 'amber', delivered: 'green', cancelled: 'red' };
const STATUS_LABEL: any = { pending: 'Pending', picked: 'Picked', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };
const PAY_TONE: any = { unpaid: 'red', partial: 'amber', paid: 'green' };
const FILTERS = [['', 'All'], ['pending', 'Pending'], ['picked', 'Picked'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered']];

export function Wholesale({ T }: { T: Theme }) {
  const [enabled, setEnabled] = useS<any>(null);   // null = loading
  const [tab, setTab] = useS<any>('orders');
  const [filter, setFilter] = useS('');
  const [orders, setOrders] = useS<any[]>([]);
  const [outstanding, setOutstanding] = useS<any[]>([]);
  const [loading, setLoading] = useS(true);
  const [add, setAdd] = useS(false);
  const [act, setAct] = useS<any>(null);   // { kind, order }
  const [show, node] = useToast();

  useE(() => { API.module.list().then((ms: any) => setEnabled(!!(ms.find((m: any) => m.key === 'wholesale') || {}).enabled)).catch(() => setEnabled(false)); }, []);
  const reloadOrders = useCb(() => { setLoading(true); API.wholesale.orders(filter || undefined).then(setOrders).catch(() => setOrders([])).finally(() => setLoading(false)); }, [filter]);
  const reloadOutstanding = useCb(() => { API.wholesale.outstanding().then(setOutstanding).catch(() => setOutstanding([])); }, []);
  useE(() => { if (enabled) reloadOrders(); }, [enabled, reloadOrders]);
  useE(() => { if (enabled && tab === 'outstanding') reloadOutstanding(); }, [enabled, tab, reloadOutstanding]);

  async function enableModule() { try { await API.module.setEnabled('wholesale', true); setEnabled(true); show('Wholesale module enabled'); } catch (e: any) { show(e.message); } }
  const refreshAll = () => { reloadOrders(); if (tab === 'outstanding') reloadOutstanding(); };

  if (enabled === null) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paperAlt, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>;
  if (enabled === false) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.paperAlt }}>
      <Topbar T={T} title="Wholesale" subtitle="B2B orders, dispatch & collections" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ width: 76, height: 76, borderRadius: 20, background: T.accent.soft, color: T.accent.base, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, margin: '0 auto 20px' }}>📦</div>
          <div style={{ fontFamily: T.fDisplay, fontSize: 24, fontWeight: T.dispWeight, color: T.ink, marginBottom: 8 }}>Wholesale module</div>
          <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6, marginBottom: 22 }}>Sell to trade customers at wholesale prices with a full order lifecycle: warehouse pick lists, driver dispatch, delivery confirmation, and per-customer outstanding collections. Paid add-on ($15/mo).</div>
          <Btn T={T} kind="accent" onClick={enableModule}>Enable Wholesale · $15/mo</Btn>
        </div>
      </div>
      {node}
    </div>
  );

  const tabs = [['orders', 'Orders'], ['outstanding', 'Outstanding', outstanding.length]];
  const totalOut = outstanding.reduce((s, o) => s + Number(o.outstanding || 0), 0);

  const nextAction = (o: any) => {
    if (o.status === 'pending') return { kind: 'pick', label: 'Pick', danger: false };
    if (o.status === 'picked') return { kind: 'dispatch', label: 'Dispatch', danger: false };
    if (o.status === 'out_for_delivery') return { kind: 'deliver', label: 'Mark delivered', danger: false };
    if (o.status === 'delivered' && o.payment_status !== 'paid') return { kind: 'pay', label: 'Record payment', danger: false };
    return null;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Wholesale" subtitle="B2B orders, dispatch & collections"
        right={<Btn T={T} kind="accent" onClick={() => setAdd(true)}>+ New order</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
            {tabs.map(([id, lbl, n]: any) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl}{n ? <span style={{ opacity: 0.7 }}> · {n}</span> : ''}</button>
            ))}
          </div>

          {tab === 'orders' && (<>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {FILTERS.map(([id, lbl]) => (
                <button key={id} onClick={() => setFilter(id)} style={{ padding: '6px 13px', borderRadius: 99, border: `1px solid ${filter === id ? T.accent.base : T.line}`, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: filter === id ? 700 : 500, background: filter === id ? T.accent.soft : T.paper, color: filter === id ? T.accent.text : T.inkMid }}>{lbl}</button>
              ))}
            </div>
            <Panel T={T} pad={false}>
              <table style={tbl}><thead><tr>{['Order', 'Customer', 'Items', 'Total', 'Paid', 'Status', 'Payment', ''].map((h, i) => <th key={i} style={th(T, i >= 2 && i <= 4)}>{h}</th>)}</tr></thead>
                <tbody>{orders.map((o: any) => {
                  const a = nextAction(o);
                  return (
                    <tr key={o.id}>
                      <td style={td(T)}><b style={{ color: T.ink, fontFamily: T.fMono, fontSize: 12.5 }}>{o.order_number}</b><span style={{ display: 'block', fontSize: 11, color: T.inkMute }}>{o.date}</span></td>
                      <td style={td(T)}><b style={{ color: T.ink }}>{o.customer_name}</b>{o.customer_phone ? <span style={{ display: 'block', fontSize: 11, color: T.inkSub, fontFamily: T.fMono }}>{o.customer_phone}</span> : null}</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{o.items.length}</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: T.ink }}>{money(o.total)}</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: o.outstanding > 0 ? T.redText : T.inkSub }}>{money(o.amount_paid)}</td>
                      <td style={td(T)}><Badge T={T} tone={STATUS_TONE[o.status] || 'gray'}>{STATUS_LABEL[o.status] || o.status}</Badge>{o.driver_name ? <span style={{ display: 'block', fontSize: 10.5, color: T.inkMute, marginTop: 3 }}>🚚 {o.driver_name}</span> : null}</td>
                      <td style={td(T)}><Badge T={T} tone={PAY_TONE[o.payment_status] || 'gray'}>{o.payment_status}</Badge></td>
                      <td style={{ ...td(T), textAlign: 'right' }}>{a ? <button onClick={() => setAct({ kind: a.kind, order: o })} style={mini(T)}>{a.label}</button> : <span style={{ fontSize: 12, color: T.inkMute }}>—</span>}</td>
                    </tr>
                  );
                })}{!loading && orders.length === 0 && <tr><td colSpan={8} style={empty(T)}>No orders{filter ? ' in this status' : ' yet'}.</td></tr>}</tbody></table>
              {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading orders…</div>}
            </Panel>
          </>)}

          {tab === 'outstanding' && (<>
            <div style={{ fontSize: 13, color: T.inkSub, marginBottom: 12 }}>Total outstanding across trade customers: <b style={{ color: T.redText, fontFamily: T.fMono }}>{money(totalOut)}</b></div>
            <Panel T={T} pad={false}>
              <table style={tbl}><thead><tr>{['Customer', 'Phone', 'Delivered orders', 'Outstanding'].map((h, i) => <th key={i} style={th(T, i >= 2)}>{h}</th>)}</tr></thead>
                <tbody>{outstanding.map((o: any, i: number) => (
                  <tr key={i}>
                    <td style={td(T)}><b style={{ color: T.ink }}>{o.customer || '—'}</b></td>
                    <td style={td(T)}><span style={{ fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{o.phone || '—'}</span></td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{o.orders}</td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: T.redText, fontWeight: 600 }}>{money(o.outstanding)}</td>
                  </tr>
                ))}{outstanding.length === 0 && <tr><td colSpan={4} style={empty(T)}>No outstanding balances 🎉</td></tr>}</tbody></table>
            </Panel>
          </>)}
        </div>
      </div>

      {add && <OrderModal T={T} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); show('Order created'); reloadOrders(); }} />}
      {act && <ActionModal T={T} act={act} onClose={() => setAct(null)} onDone={(m: string) => { setAct(null); show(m); refreshAll(); }} toast={show} />}
      {node}
    </div>
  );
}

// ── Create order ──────────────────────────────────────────────────
function OrderModal({ T, onClose, onSaved }: { T: Theme; onClose: () => void; onSaved: () => void }) {
  const [customers, setCustomers] = useS<any[]>([]);
  const [products, setProducts] = useS<any[]>([]);
  const [customerId, setCustomerId] = useS('');
  const [lines, setLines] = useS<any[]>([]);
  const [pid, setPid] = useS('');
  const [qty, setQty] = useS('1');
  const [notes, setNotes] = useS('');
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);

  useE(() => {
    API.contact.list({ type: 'customer' }).then((c: any) => setCustomers(Array.isArray(c) ? c : [])).catch(() => {});
    API.product.list({ per_page: 200 }).then((r: any) => setProducts(r.items || [])).catch(() => {});
  }, []);

  function addLine() {
    if (!pid || !(Number(qty) > 0)) return;
    const p = products.find((x: any) => String(x.id) === String(pid));
    if (!p) return;
    setLines((s: any[]) => {
      const existing = s.find((l) => String(l.product_id) === String(pid));
      if (existing) return s.map((l) => String(l.product_id) === String(pid) ? { ...l, quantity: l.quantity + Number(qty) } : l);
      return [...s, { product_id: p.id, name: p.name, price: Number(p.sellingPrice || 0), quantity: Number(qty) }];
    });
    setPid(''); setQty('1');
  }
  const removeLine = (id: any) => setLines((s: any[]) => s.filter((l) => l.product_id !== id));
  const est = lines.reduce((s, l) => s + l.price * l.quantity, 0);

  async function save() {
    if (!customerId) { setErr('Select a trade customer.'); return; }
    if (lines.length === 0) { setErr('Add at least one product line.'); return; }
    setBusy(true); setErr(null);
    try {
      await API.wholesale.createOrder({ customer_id: customerId, items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })), delivery_notes: notes });
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not create order.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title="New wholesale order" subtitle="Priced at each product’s wholesale rate" width={620} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Creating…' : 'Create order'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Trade customer" full>
          <SelectField T={T} value={customerId} options={['', ...customers.map((c: any) => String(c.id))]} onChange={(v: any) => setCustomerId(v)}
            render={(v: any) => v ? (customers.find((c: any) => String(c.id) === String(v)) || {}).name : 'Select customer…'} />
        </Field>
      </FormGrid>

      <div style={{ marginTop: 16, marginBottom: 8, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub }}>Order lines</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <SelectField T={T} value={pid} options={['', ...products.map((p: any) => String(p.id))]} onChange={(v: any) => setPid(v)}
            render={(v: any) => v ? (products.find((p: any) => String(p.id) === String(v)) || {}).name : 'Add a product…'} />
        </div>
        <div style={{ width: 90 }}><TextField T={T} type="number" value={qty} onChange={setQty} placeholder="Qty" /></div>
        <Btn T={T} kind="ghost" onClick={addLine}>+ Add</Btn>
      </div>

      {lines.length > 0 && (
        <div style={{ marginTop: 12, border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
          {lines.map((l) => (
            <div key={l.product_id} style={{ display: 'flex', alignItems: 'center', padding: '9px 13px', borderBottom: `1px solid ${T.line}`, gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13, color: T.ink }}>{l.name}</span>
              <span style={{ fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{l.quantity} × ~{money(l.price)}</span>
              <span style={{ fontFamily: T.fMono, fontSize: 12.5, color: T.ink, width: 80, textAlign: 'right' }}>{money(l.price * l.quantity)}</span>
              <button onClick={() => removeLine(l.product_id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: T.redText, fontSize: 15, lineHeight: 1 }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 13px', background: T.paperAlt, fontSize: 12.5 }}>
            <span style={{ color: T.inkSub }}>Estimated total (retail price — actual uses wholesale)</span>
            <b style={{ fontFamily: T.fMono, color: T.ink }}>~{money(est)}</b>
          </div>
        </div>
      )}

      <FormGrid style={{ marginTop: 14 }}>
        <Field T={T} label="Delivery notes" full><TextField T={T} value={notes} onChange={setNotes} placeholder="optional — address, time window, gate code…" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

// ── Lifecycle action (pick / dispatch / deliver / pay) ────────────
function ActionModal({ T, act, onClose, onDone, toast }: { T: Theme; act: any; onClose: () => void; onDone: (m: string) => void; toast: (m: string) => void }) {
  const o = act.order;
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const [picked, setPicked] = useS<any>(() => Object.fromEntries((o.items || []).map((i: any) => [i.id, !i.picked])));
  const [driver, setDriver] = useS('');
  const [amount, setAmount] = useS(String(o.outstanding || ''));

  async function run() {
    setBusy(true); setErr(null);
    try {
      if (act.kind === 'pick') {
        const ids = Object.keys(picked).filter((k) => picked[k]);
        if (ids.length === 0) { setErr('Select at least one line to pick.'); setBusy(false); return; }
        const r: any = await API.wholesale.pick(o.id, ids);
        onDone(r.message || 'Lines picked');
      } else if (act.kind === 'dispatch') {
        if (!driver.trim()) { setErr('Driver name is required.'); setBusy(false); return; }
        const r: any = await API.wholesale.dispatch(o.id, driver.trim());
        onDone(r.message || 'Dispatched');
      } else if (act.kind === 'deliver') {
        const r: any = await API.wholesale.deliver(o.id);
        onDone(r.message || 'Delivered');
      } else if (act.kind === 'pay') {
        if (!(Number(amount) > 0)) { setErr('Enter a payment amount.'); setBusy(false); return; }
        const r: any = await API.wholesale.payOrder(o.id, amount);
        onDone(r.message || 'Payment recorded');
      }
    } catch (e: any) { setErr(e.message || 'Action failed.'); setBusy(false); }
  }

  const titles: any = { pick: 'Pick order', dispatch: 'Dispatch order', deliver: 'Confirm delivery', pay: 'Record payment' };
  const cta: any = { pick: 'Confirm picked', dispatch: 'Dispatch', deliver: 'Mark delivered', pay: 'Record payment' };

  return (
    <Modal T={T} title={`${titles[act.kind]} · ${o.order_number}`} subtitle={o.customer_name} width={480} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={run} disabled={busy}>{busy ? 'Working…' : cta[act.kind]}</Btn></>}>
      {act.kind === 'pick' && (
        <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
          {(o.items || []).map((i: any) => (
            <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 13px', borderBottom: `1px solid ${T.line}`, cursor: i.picked ? 'default' : 'pointer', opacity: i.picked ? 0.55 : 1 }}>
              <input type="checkbox" checked={!!picked[i.id]} disabled={i.picked} onChange={() => setPicked((s: any) => ({ ...s, [i.id]: !s[i.id] }))} />
              <span style={{ flex: 1, fontSize: 13, color: T.ink }}>{i.product_name}</span>
              <span style={{ fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>×{i.quantity}</span>
              {i.picked ? <Badge T={T} tone="green">picked</Badge> : null}
            </label>
          ))}
        </div>
      )}
      {act.kind === 'dispatch' && (
        <FormGrid><Field T={T} label="Driver name" full><TextField T={T} value={driver} onChange={setDriver} placeholder="e.g. Sam — Van 3" /></Field></FormGrid>
      )}
      {act.kind === 'deliver' && (
        <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6 }}>Confirm <b style={{ color: T.ink }}>{o.order_number}</b> was delivered to <b style={{ color: T.ink }}>{o.customer_name}</b>. Its <b style={{ color: T.redText }}>{money(o.outstanding)}</b> balance becomes collectible.</div>
      )}
      {act.kind === 'pay' && (<>
        <div style={{ fontSize: 13, color: T.inkSub, marginBottom: 12 }}>Order total <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(o.total)}</b> · paid <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(o.amount_paid)}</b> · outstanding <b style={{ fontFamily: T.fMono, color: T.redText }}>{money(o.outstanding)}</b></div>
        <FormGrid><Field T={T} label="Payment amount" full><TextField T={T} type="number" value={amount} onChange={setAmount} placeholder="0.00" /></Field></FormGrid>
      </>)}
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th = (T: Theme, right?: boolean): React.CSSProperties => ({ textAlign: right ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` });
const td = (T: Theme): React.CSSProperties => ({ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: T.inkMid });
const empty = (T: Theme): React.CSSProperties => ({ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 });
function mini(T: Theme): React.CSSProperties { return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid }; }
