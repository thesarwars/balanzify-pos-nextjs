'use client';
// ─────────────────────────────────────────────────────────────────
// Purchases & Opening Stock — the manual's two stock-in routes.
// A purchase from a supplier adds stock and raises the supplier
// liability; opening stock seeds a product's starting quantity.
// Wired through API.purchase + API.openingStock.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { PRODUCTS } from '@/lib/data';

const { useState: useStatePu, useEffect: useEffectPu } = React;

export function Purchases({ T }: { T: any }) {
  const [rows, setRows] = useStatePu<any[]>([]);
  const [loading, setLoading] = useStatePu(true);
  const [suppliers, setSuppliers] = useStatePu<any[]>([]);
  const [locs, setLocs] = useStatePu<any[]>([]);
  const [edit, setEdit] = useStatePu(false);
  const [opening, setOpening] = useStatePu(false);
  const [view, setView] = useStatePu<any>(null);
  const [show, node] = useToast();

  const reload = React.useCallback(() => {
    setLoading(true);
    API.purchaseOrder.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffectPu(() => { reload(); }, [reload]);
  useEffectPu(() => {
    API.contact.list({ type: 'supplier' }).then(setSuppliers).catch(() => {});
    API.location.list().then(setLocs).catch(() => {});
  }, []);

  const totalSpend = rows.reduce((s: any, r: any) => s + (r.grand_total || 0), 0);
  const totalDue = rows.reduce((s: any, r: any) => s + (r.due || 0), 0);
  const tone: any = { paid: 'green', partial: 'amber', due: 'red' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Purchases" subtitle={`${rows.length} purchase orders`}
        right={<>
          <Btn T={T} kind="ghost" onClick={() => setOpening(true)}>◱ Opening Stock</Btn>
          <Btn T={T} kind="accent" onClick={() => setEdit(true)}>+ Add Purchase</Btn>
        </>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <StatStrip T={T} stats={[['Purchase orders', rows.length], ['Total spend', money0(totalSpend)], ['Outstanding to suppliers', money0(totalDue)]]} />
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[['Reference', 'l'], ['Supplier', 'l'], ['Location', 'l'], ['Items', 'r'], ['Total', 'r'], ['Due', 'r'], ['Payment', 'r'], ['Date', 'r']].map(([h, a]: any, i: number) => (
                <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((p: any) => (
                  <tr key={p.id} onClick={() => setView(p)} style={{ cursor: 'pointer', transition: 'background .12s' }} onMouseEnter={(e: any) => e.currentTarget.style.background = T.paperAlt} onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.accent.text }}>{p.ref_no}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: T.ink, fontWeight: 600 }}>{p.supplier_name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{p.location_name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>{p.item_count}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink } as React.CSSProperties}>{money(p.grand_total)}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: p.due > 0 ? T.amberText : T.inkMute } as React.CSSProperties}>{p.due > 0 ? money(p.due) : '—'}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}><Badge T={T} tone={tone[p.payment_status]}>{p.payment_status}</Badge></td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontSize: 12, color: T.inkSub } as React.CSSProperties}>{p.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>GET /connector/api/purchase…</div>}
            {!loading && rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>No purchases yet.</div>}
          </Panel>
        </div>
      </div>

      {edit && <PurchaseEditor T={T} suppliers={suppliers} locs={locs} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); show('Purchase recorded · stock updated'); reload(); }} />}
      {opening && <OpeningStock T={T} onClose={() => setOpening(false)} toast={show} />}
      {view && <PurchaseView T={T} purchase={view} onClose={() => setView(null)} />}
      {node}
    </div>
  );
}

// ── Purchase editor ─────────────────────────────────────────────────
function PurchaseEditor({ T, suppliers, locs, onClose, onSaved }: { T: any; suppliers: any; locs: any; onClose: () => void; onSaved: () => void }) {
  const [supplier_id, setSupplier] = useStatePu<any>('');
  const [reference, setReference] = useStatePu('');
  const [status, setStatus] = useStatePu('received');   // received | ordered | pending
  const [location_id, setLocation] = useStatePu<any>((locs[0] || {}).id || '');
  const [date, setDate] = useStatePu(new Date().toISOString().slice(0, 10));
  const [payTerm, setPayTerm] = useStatePu('');
  const [notes, setNotes] = useStatePu('');
  const [lines, setLines] = useStatePu<any[]>([blankLine()]);
  const [discType, setDiscType] = useStatePu('none');   // none | fixed | percent
  const [discVal, setDiscVal] = useStatePu('');
  const [taxPct, setTaxPct] = useStatePu('');            // purchase tax %
  const [shipping, setShipping] = useStatePu('');
  const [expenses, setExpenses] = useStatePu<any[]>([{ name: '', amount: '' }]);
  const [paid, setPaid] = useStatePu<any>('');
  const [payMethod, setPayMethod] = useStatePu('cash');
  const [payNote, setPayNote] = useStatePu('');
  const [busy, setBusy] = useStatePu(false);
  const [err, setErr] = useStatePu<any>(null);
  // Live catalog in real mode; seed PRODUCTS is the mock fallback.
  const [catalog, setCatalog] = useStatePu<any[]>(PRODUCTS);
  const [units, setUnits] = useStatePu<any[]>([]);
  useEffectPu(() => {
    if (API.config?.isReal?.()) API.product.list({ per_page: 200 }).then((r: any) => setCatalog(r.items || [])).catch(() => {});
    API.unit.list().then((us: any) => setUnits(Array.isArray(us) ? us : [])).catch(() => {});
  }, []);
  const products = catalog.filter((p: any) => p.type !== 'combo' && p.enable_stock !== false);
  const supplier = suppliers.find((s: any) => String(s.id) === String(supplier_id));

  const setLine = (i: any, k: any, v: any) => setLines((ls: any) => ls.map((l: any, j: any) => j === i ? { ...l, [k]: v } : l));
  const addLine = () => setLines((ls: any) => [...ls, blankLine()]);
  const rmLine = (i: any) => setLines((ls: any) => ls.filter((_: any, j: any) => j !== i));
  const onPickProduct = (i: any, pid: any) => { const p = products.find((p: any) => p.id === pid); setLines((ls: any) => ls.map((l: any, j: any) => j === i ? { ...l, product_id: pid, unit_id: '', unit_cost: l.unit_cost || (p ? String(p.cost) : ''), selling_price: l.selling_price || (p ? String(p.price) : '') } : l)); };

  const unitOptsFor = (l: any) => {
    const p = products.find((x: any) => x.id === l.product_id);
    if (!p) return [];
    const base = units.find((u: any) => u.short_name === p.unit || u.actual_name === p.unit);
    if (!base) return [];
    return units.filter((u: any) => String(u.base_unit_id) === String(base.id));
  };
  const baseUnitName = (l: any) => { const p = products.find((x: any) => x.id === l.product_id); return (p && p.unit) || 'unit'; };

  // Per-line computed values.
  const netCost = (l: any) => (Number(l.unit_cost) || 0) * (1 - (Number(l.discount_percent) || 0) / 100);
  const lineTotal = (l: any) => (Number(l.qty) || 0) * netCost(l);
  const lineMargin = (l: any) => { const nc = netCost(l), sp = Number(l.selling_price) || 0; return nc > 0 ? Math.round(((sp - nc) / nc) * 100) : 0; };

  const subtotal = lines.reduce((s: any, l: any) => s + lineTotal(l), 0);
  const discountAmt = discType === 'fixed' ? (Number(discVal) || 0) : discType === 'percent' ? subtotal * (Number(discVal) || 0) / 100 : 0;
  const taxAmt = subtotal > 0 ? (subtotal - discountAmt) * (Number(taxPct) || 0) / 100 : 0;
  const shipAmt = Number(shipping) || 0;
  const expensesTotal = expenses.reduce((s: any, e: any) => s + (Number(e.amount) || 0), 0);
  const total = Math.max(0, subtotal - discountAmt + taxAmt + shipAmt + expensesTotal);
  const due = Math.max(0, total - (Number(paid) || 0));

  const setExpense = (i: any, k: any, v: any) => setExpenses((es: any) => es.map((e: any, j: any) => j === i ? { ...e, [k]: v } : e));

  async function save() {
    if (!supplier_id) { setErr('Pick a supplier.'); return; }
    const valid = lines.filter((l: any) => l.product_id && Number(l.qty) > 0);
    if (!valid.length) { setErr('Add at least one product line.'); return; }
    setBusy(true); setErr(null);
    try {
      const created = await API.purchaseOrder.create({
        supplier_id, location_id, date, reference_no: reference.trim() || undefined, status,
        pay_term: payTerm, notes,
        discount_amount: discountAmt, tax_amount: taxAmt, shipping: shipAmt,
        expenses: expenses.filter((e: any) => e.name && Number(e.amount) > 0),
        lines: valid,
      });
      // Immediately receive stock only when the purchase status is "received".
      if (status === 'received') {
        const items = (created && created._real && created._real.items) || [];
        const received = items.map((it: any) => ({ id: it.id, product_id: it.productId, qty: Number(it.orderedQty || 0), unit_price: Number(it.unitPrice || 0) }));
        await API.purchaseOrder.setStatus(created.id, 'received', received);
      }
      if (Number(paid) > 0) await API.purchaseOrder.pay(created.id, Number(paid), payMethod, payNote).catch(() => {});
      onSaved();
    } catch (ex: any) { setErr(ex.message || 'Could not save the purchase.'); } finally { setBusy(false); }
  }

  const cols = '1.3fr 60px 96px 84px 62px 84px 84px 84px 54px 30px';
  return (
    <Modal T={T} title="Add purchase" subtitle="Record a purchase from a supplier" width={980} onClose={onClose}
      footer={<>
        <div style={{ flex: 1, fontSize: 13.5, color: T.inkSub }}>Purchase total <b style={{ color: T.ink, fontFamily: T.fMono, marginLeft: 6, fontSize: 15 }}>{money(total)}</b>{due > 0 && <span style={{ marginLeft: 12, color: T.amberText }}>Due {money(due)}</span>}</div>
        <Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : status === 'received' ? 'Save & receive' : 'Save purchase'}</Btn>
      </>}>
      {/* Header */}
      <FormGrid cols={4}>
        <Field T={T} label="Supplier"><SelectField T={T} value={String(supplier_id)} options={['', ...suppliers.map((s: any) => String(s.id))]} onChange={(v: any) => setSupplier(v)} render={(v: any) => v ? (suppliers.find((s: any) => String(s.id) === v) || {}).name : 'Please select…'} /></Field>
        <Field T={T} label="Reference No" hint="Blank = auto-generated"><TextField T={T} value={reference} onChange={setReference} placeholder="e.g. PO-2026-001" /></Field>
        <Field T={T} label="Purchase Date"><TextField T={T} type="date" value={date} onChange={setDate} /></Field>
        <Field T={T} label="Purchase Status"><SelectField T={T} value={status} options={['received', 'ordered', 'pending']} onChange={setStatus} render={(v: any) => ({ received: 'Received', ordered: 'Ordered', pending: 'Pending' } as any)[v]} /></Field>
        <Field T={T} label="Business Location"><SelectField T={T} value={String(location_id)} options={locs.map((l: any) => String(l.id))} onChange={setLocation} render={(v: any) => (locs.find((l: any) => String(l.id) === v) || {}).name} /></Field>
        <Field T={T} label="Pay term (days)"><TextField T={T} type="number" value={payTerm} onChange={setPayTerm} placeholder="e.g. 30" /></Field>
      </FormGrid>
      {supplier && supplier.address && <div style={{ fontSize: 12, color: T.inkSub, marginTop: 6 }}>Address: {supplier.address}</div>}

      {/* Product lines */}
      <div style={{ marginTop: 18, marginBottom: 9, fontSize: 12, fontWeight: 700, color: T.inkSub }}>PRODUCTS</div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto' }}>
        <div style={{ minWidth: 860 }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, padding: '8px 12px', background: T.paperAlt, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub } as React.CSSProperties}>
            <span>Product</span><span style={{ textAlign: 'right' }}>Qty</span><span>Unit</span><span style={{ textAlign: 'right' }}>Unit cost</span><span style={{ textAlign: 'right' }}>Disc %</span><span style={{ textAlign: 'right' }}>Net cost</span><span style={{ textAlign: 'right' }}>Subtotal</span><span style={{ textAlign: 'right' }}>Selling</span><span style={{ textAlign: 'right' }}>Margin</span><span />
          </div>
          {lines.map((l: any, i: number) => {
            const opts = unitOptsFor(l);
            return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, padding: '7px 12px', borderTop: `1px solid ${T.line}`, alignItems: 'center' }}>
              <select value={l.product_id} onChange={(e: any) => onPickProduct(i, e.target.value)} style={{ padding: '7px 8px', fontSize: 12, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none' }}>
                <option value="">Select…</option>
                {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" value={l.qty} onChange={(e: any) => setLine(i, 'qty', e.target.value)} placeholder="0" style={miniNum(T)} />
              <select value={l.unit_id} onChange={(e: any) => setLine(i, 'unit_id', e.target.value)} disabled={!l.product_id} title="Purchase unit — multiples convert to base stock at receipt" style={{ padding: '7px 6px', fontSize: 11.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none', opacity: l.product_id ? 1 : 0.5 }}>
                <option value="">{baseUnitName(l)}</option>
                {opts.map((u: any) => <option key={u.id} value={u.id}>{u.short_name}=×{u.base_unit_multiplier}</option>)}
              </select>
              <input type="number" value={l.unit_cost} onChange={(e: any) => setLine(i, 'unit_cost', e.target.value)} placeholder="0.00" style={miniNum(T)} />
              <input type="number" value={l.discount_percent} onChange={(e: any) => setLine(i, 'discount_percent', e.target.value)} placeholder="0" style={miniNum(T)} />
              <span style={{ textAlign: 'right', fontFamily: T.fMono, fontSize: 12, color: T.inkSub } as React.CSSProperties}>{money(netCost(l))}</span>
              <span style={{ textAlign: 'right', fontFamily: T.fMono, fontSize: 12, color: T.ink } as React.CSSProperties}>{money(lineTotal(l))}</span>
              <input type="number" value={l.selling_price} onChange={(e: any) => setLine(i, 'selling_price', e.target.value)} placeholder="0.00" style={miniNum(T)} />
              <span style={{ textAlign: 'right', fontFamily: T.fMono, fontSize: 12, color: lineMargin(l) >= 0 ? T.greenText : T.redText } as React.CSSProperties}>{lineMargin(l)}%</span>
              <button onClick={() => rmLine(i)} disabled={lines.length === 1} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: lines.length === 1 ? 'not-allowed' : 'pointer', fontSize: 11, opacity: lines.length === 1 ? 0.4 : 1 }}>✕</button>
            </div>
          ); })}
          <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.line}` }}><button onClick={addLine} style={{ background: 'none', border: 'none', color: T.accent.text, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: T.fBody }}>+ Add product line</button></div>
        </div>
      </div>

      {/* Totals + discount/tax/shipping/expenses */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, marginTop: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, marginBottom: 6 }}>DISCOUNT</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 130 }}><SelectField T={T} value={discType} options={['none', 'fixed', 'percent']} onChange={setDiscType} render={(v: any) => ({ none: 'None', fixed: 'Fixed', percent: 'Percentage' } as any)[v]} /></div>
              {discType !== 'none' && <input type="number" value={discVal} onChange={(e: any) => setDiscVal(e.target.value)} placeholder={discType === 'percent' ? '%' : '0.00'} style={{ ...miniNum(T), width: 100 }} />}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, marginBottom: 6 }}>PURCHASE TAX (%)</div>
            <input type="number" value={taxPct} onChange={(e: any) => setTaxPct(e.target.value)} placeholder="0" style={{ ...miniNum(T), width: 100 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, marginBottom: 6 }}>SHIPPING & EXPENSES</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{ fontSize: 12, color: T.inkSub, width: 110 }}>Shipping charges</span><input type="number" value={shipping} onChange={(e: any) => setShipping(e.target.value)} placeholder="0.00" style={{ ...miniNum(T), width: 100 }} /></div>
            {expenses.map((e: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input value={e.name} onChange={(ev: any) => setExpense(i, 'name', ev.target.value)} placeholder="Expense name" style={{ flex: 1, padding: '7px 9px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 6, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} />
                <input type="number" value={e.amount} onChange={(ev: any) => setExpense(i, 'amount', ev.target.value)} placeholder="0.00" style={{ ...miniNum(T), width: 100 }} />
              </div>
            ))}
            <button onClick={() => setExpenses((es: any) => [...es, { name: '', amount: '' }])} style={{ background: 'none', border: 'none', color: T.accent.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.fBody, padding: 0 }}>+ Add expense</button>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, marginBottom: 6 }}>ADDITIONAL NOTES</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional" style={{ width: '100%', padding: '9px 11px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', resize: 'vertical', boxSizing: 'border-box' } as React.CSSProperties} />
          </div>
        </div>

        {/* Summary + payment */}
        <div style={{ background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[['Subtotal', subtotal], ['Discount', -discountAmt], ['Purchase tax', taxAmt], ['Shipping', shipAmt], ['Expenses', expensesTotal]].map(([k, v]: any) => (
            (k === 'Subtotal' || v !== 0) ? <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.inkSub }}><span>{k}</span><span style={{ fontFamily: T.fMono, color: k === 'Discount' ? T.redText : T.ink }}>{money(v)}</span></div> : null
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 15, fontWeight: 700, paddingTop: 8, borderTop: `1px dashed ${T.line}` }}><span style={{ color: T.ink }}>Purchase total</span><span style={{ fontFamily: T.fMono, color: T.ink }}>{money(total)}</span></div>
          <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, marginBottom: 7 }}>PAYMENT</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 7 }}><span style={{ color: T.inkSub }}>Amount paid</span><input type="number" value={paid} onChange={(e: any) => setPaid(e.target.value)} placeholder="0.00" style={{ ...miniNum(T), width: 100 }} /></div>
            <div style={{ marginBottom: 7 }}><SelectField T={T} value={payMethod} options={['cash', 'bank', 'cheque', 'zaad', 'mobile']} onChange={setPayMethod} render={(v: any) => ({ cash: 'Cash', bank: 'Bank transfer', cheque: 'Cheque', zaad: 'ZAAD', mobile: 'Mobile money' } as any)[v]} /></div>
            <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Payment note" style={{ width: '100%', padding: '7px 9px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 6, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 8, fontWeight: 600 }}><span style={{ color: T.inkSub }}>Payment due</span><span style={{ fontFamily: T.fMono, color: due > 0 ? T.amberText : T.greenText }}>{money(due)}</span></div>
          </div>
        </div>
      </div>
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
    </Modal>
  );
}
function blankLine() { return { product_id: '', qty: '', unit_id: '', unit_cost: '', discount_percent: '', selling_price: '' }; }

// ── Purchase detail ─────────────────────────────────────────────────
function PurchaseView({ T, purchase, onClose }: { T: any; purchase: any; onClose: () => void }) {
  const [data, setData] = useStatePu<any>(null);
  useEffectPu(() => { API.purchaseOrder.get(purchase.id).then(setData).catch(() => setData(purchase)); }, [purchase.id]);
  const p = data || purchase;
  return (
    <Modal T={T} title={p.ref_no} subtitle={`${p.supplier_name} · ${p.location_name}`} width={520} onClose={onClose} footer={null}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <MiniStat T={T} label="Total" value={money(p.grand_total)} />
        <MiniStat T={T} label="Paid" value={money(p.paid || 0)} tone={T.green} />
        <MiniStat T={T} label="Due" value={money(p.due || 0)} tone={p.due > 0 ? T.amber : T.green} />
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px', padding: '8px 12px', background: T.paperAlt, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub }}><span>Product</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Cost</span><span style={{ textAlign: 'right' }}>Total</span></div>
        {(p.lines || []).map((l: any, i: number) => { const pr: any = PRODUCTS.find((x: any) => parseInt(String(x.id).replace(/\D/g, ''), 10) === l.product_id) || {}; return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px', padding: '9px 12px', borderTop: `1px solid ${T.line}`, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: T.ink }}>{l.product_name || pr.name || 'Product #' + l.product_id}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub } as React.CSSProperties}>{l.qty}{l.unit_name ? ` ${l.unit_name}` : ''}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub } as React.CSSProperties}>{money(l.unit_cost)}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.ink } as React.CSSProperties}>{money(l.qty * l.unit_cost)}</span>
          </div>
        ); })}
      </div>
    </Modal>
  );
}

// ── Opening stock ───────────────────────────────────────────────────
function OpeningStock({ T, onClose, toast }: { T: any; onClose: () => void; toast: any }) {
  const [pid, setPid] = useStatePu<any>('');
  const [qty, setQty] = useStatePu<any>('');
  const [busy, setBusy] = useStatePu(false);
  const [tick, setTick] = useStatePu(0);
  const [catalog, setCatalog] = useStatePu<any[]>(PRODUCTS);
  useEffectPu(() => { if (API.config?.isReal?.()) API.product.list({ per_page: 200 }).then((r: any) => setCatalog(r.items || [])).catch(() => {}); }, []);
  const products = catalog.filter((p: any) => p.enable_stock !== false && p.type !== 'combo');
  const current: any = products.find((p: any) => p.id === pid);

  async function apply() {
    if (!pid || qty === '') return;
    setBusy(true);
    try { await API.openingStock.set({ product_id: pid, qty: Number(qty) }); setQty(''); setTick((t: any) => t + 1); toast('Opening stock updated'); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title="Opening stock" subtitle="Seed or adjust a product's quantity" width={460} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Done</Btn><Btn T={T} kind="accent" onClick={apply} disabled={busy || !pid || qty === ''}>{busy ? 'Applying…' : 'Apply'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Product" full>
          <SelectField T={T} value={pid} options={['', ...products.map((p: any) => p.id)]} onChange={setPid} render={(v: any) => v ? (products.find((p: any) => p.id === v) || {}).name : 'Select product…'} />
        </Field>
      </FormGrid>
      {current && (
        <div key={tick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', marginTop: 12, borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 13, color: T.inkMid }}>Current on-hand</span>
          <span style={{ fontFamily: T.fMono, fontSize: 18, fontWeight: 600, color: T.ink }}>{current.stock} {current.unit}</span>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <Field T={T} label="Quantity to add (use a negative number to reduce)" full><TextField T={T} type="number" value={qty} onChange={setQty} placeholder="e.g. 50 or −10" /></Field>
      </div>
      <div style={{ fontSize: 11, color: T.inkMute, marginTop: 8, lineHeight: 1.5 }}>This adds to the current on-hand. To zero a product with 10 in stock, add −10.</div>
    </Modal>
  );
}

function miniNum(T: any): React.CSSProperties { return { width: '100%', padding: '7px 9px', fontSize: 12.5, fontFamily: T.fMono, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none', boxSizing: 'border-box', textAlign: 'right' }; }

// ── Local helpers (StatStrip / MiniStat) ────────────────────────────
function StatStrip({ T, stats }: { T: any; stats: any[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 150px), 1fr))`, gap: 14, marginBottom: 18 }}>
      {stats.map(([label, value]: any, i: number) => (
        <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '15px 18px', boxShadow: T.sh1 }}>
          <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 } as React.CSSProperties}>{label}</div>
          <div style={{ fontFamily: T.fMono, fontWeight: 500, fontSize: 24, color: T.ink, marginTop: 7, letterSpacing: '-0.8px' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ T, label, value, tone }: { T: any; label: any; value: any; tone?: any }) {
  return (
    <div style={{ background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r, padding: '11px 13px' }}>
      <div style={{ fontSize: 10, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 } as React.CSSProperties}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: tone || T.ink, fontFamily: T.fMono, marginTop: 4, letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  );
}
