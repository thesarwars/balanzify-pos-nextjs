'use client';
// ─────────────────────────────────────────────────────────────────
// Row-action modals: add payment, view payments, update status, labels.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { money } from '@/lib/theme';
import { Btn, Modal, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { PRODUCTS } from '@/lib/data';
import { PrintLabels } from '../../products/components/print-labels';
import { MiniStat, formStatus } from './bits';
import { todayLocal } from '@/lib/business-settings';

const { useState: useStatePu, useEffect: useEffectPu } = React;

// ── Add payment ─────────────────────────────────────────────────────
export function AddPaymentModal({ T, purchase, onClose, onSaved }: { T: any; purchase: any; onClose: () => void; onSaved: () => void }) {
  const due = Math.max(0, Number(purchase.due) || 0);
  const [amount, setAmount] = useStatePu(due ? String(due) : '');
  const [method, setMethod] = useStatePu('cash');
  const [paidOn, setPaidOn] = useStatePu(todayLocal());
  const [note, setNote] = useStatePu('');
  const [busy, setBusy] = useStatePu(false);
  const [err, setErr] = useStatePu<any>(null);
  async function save() {
    const amt = Number(amount);
    if (!(amt > 0)) { setErr('Enter an amount greater than 0.'); return; }
    setBusy(true); setErr(null);
    try { await API.purchaseOrder.pay(purchase.id, amt, method, note.trim() || undefined, paidOn); onSaved(); }
    catch (e: any) { setErr(e.message || 'Could not record the payment.'); setBusy(false); }
  }
  return (
    <Modal T={T} title="Add payment" subtitle={purchase.ref_no} width={520} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <MiniStat T={T} label="Total" value={money(purchase.grand_total)} />
        <MiniStat T={T} label="Paid" value={money(purchase.paid || 0)} tone={T.green} />
        <MiniStat T={T} label="Due" value={money(due)} tone={due > 0 ? T.amber : T.green} />
      </div>
      <FormGrid>
        <Field T={T} label="Amount"><TextField T={T} type="number" value={amount} onChange={setAmount} placeholder="0.00" /></Field>
        <Field T={T} label="Payment method"><SelectField T={T} value={method} options={['cash', 'bank', 'cheque', 'zaad', 'mobile']} onChange={setMethod} render={(v: any) => ({ cash: 'Cash', bank: 'Bank transfer', cheque: 'Cheque', zaad: 'ZAAD', mobile: 'Mobile money' } as any)[v]} /></Field>
        <Field T={T} label="Paid on"><TextField T={T} type="date" value={paidOn} onChange={setPaidOn} /></Field>
        <Field T={T} label="Payment note" full><TextField T={T} value={note} onChange={setNote} placeholder="Optional" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

// ── View payments ───────────────────────────────────────────────────
export function PaymentsModal({ T, purchase, onClose, onAddPayment }: { T: any; purchase: any; onClose: () => void; onAddPayment: () => void }) {
  const [data, setData] = useStatePu<any>(null);
  useEffectPu(() => { API.purchaseOrder.get(purchase.id).then(setData).catch(() => setData(purchase)); }, [purchase.id]);
  const p = data || purchase;
  const pays = p.payments || [];
  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, textAlign: 'left' };
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 12.5, borderBottom: `1px solid ${T.line}` };
  return (
    <Modal T={T} title="Payments" subtitle={p.ref_no} width={560} onClose={onClose}
      footer={<><div style={{ flex: 1 }} />{p.due > 0 && <Btn T={T} kind="accent" onClick={onAddPayment}>＋ Add payment</Btn>}<Btn T={T} kind="ghost" onClick={onClose}>Close</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <MiniStat T={T} label="Total" value={money(p.grand_total)} />
        <MiniStat T={T} label="Paid" value={money(p.paid || 0)} tone={T.green} />
        <MiniStat T={T} label="Due" value={money(p.due || 0)} tone={p.due > 0 ? T.amber : T.green} />
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto' }}>
        {pays.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead><tr><th style={th}>Date</th><th style={th}>Reference</th><th style={th}>Mode</th><th style={th}>Note</th><th style={{ ...th, textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>{pays.map((pay: any, i: number) => (
              <tr key={pay.id || i}>
                <td style={{ ...td, fontFamily: T.fMono, color: T.inkMid }}>{pay.date || '—'}</td>
                <td style={{ ...td, fontFamily: T.fMono, color: T.inkSub }}>{pay.reference || '—'}</td>
                <td style={{ ...td, color: T.inkSub, textTransform: 'capitalize' }}>{String(pay.method || '').replace(/_/g, ' ') || '—'}</td>
                <td style={{ ...td, color: T.inkSub }}>{pay.note || '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 600, color: T.greenText }}>{money(pay.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div style={{ padding: 22, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No payments found.</div>}
      </div>
    </Modal>
  );
}

// ── Update status ───────────────────────────────────────────────────
export function UpdateStatusModal({ T, purchase, onClose, onSaved }: { T: any; purchase: any; onClose: () => void; onSaved: (msg?: string) => void }) {
  const received = ['received', 'partial', 'approved'].includes(purchase.status);
  const [status, setStatus] = useStatePu(formStatus(purchase.status));
  const [busy, setBusy] = useStatePu(false);
  const [err, setErr] = useStatePu<any>(null);
  async function save() {
    setBusy(true); setErr(null);
    try {
      if (status === 'received') {
        const full = await API.purchaseOrder.get(purchase.id);
        const items = (full && full._real && full._real.items) || [];
        const toReceive = items.filter((it: any) => Number(it.orderedQty) > Number(it.receivedQty || 0))
          .map((it: any) => ({ id: it.id, product_id: it.productId, qty: Number(it.orderedQty) - Number(it.receivedQty || 0), unit_price: Number(it.unitPrice || 0) }));
        if (!toReceive.length) { setErr('This purchase is already fully received.'); setBusy(false); return; }
        await API.purchaseOrder.setStatus(purchase.id, 'received', toReceive);
        onSaved('Received · stock updated');
      } else {
        await API.purchaseOrder.setStatus(purchase.id, status === 'ordered' ? 'sent' : 'draft');
        onSaved('Status updated');
      }
    } catch (e: any) { setErr(e.message || 'Could not update the status.'); setBusy(false); }
  }
  return (
    <Modal T={T} title="Update status" subtitle={purchase.ref_no} width={440} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn>{!received && <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Updating…' : 'Update'}</Btn>}</>}>
      {received ? (
        <div style={{ fontSize: 13, color: T.inkMid, lineHeight: 1.6 }}>
          This purchase is <b>received</b>. Its stock, cost and supplier balance are already posted, so the status can't be downgraded here — reverse it with a purchase return instead.
        </div>
      ) : (
        <>
          <Field T={T} label="Purchase status" full>
            <SelectField T={T} value={status} options={['received', 'ordered', 'pending']} onChange={setStatus} render={(v: any) => ({ received: 'Received', ordered: 'Ordered', pending: 'Pending' } as any)[v]} />
          </Field>
          {status === 'received' && <div style={{ marginTop: 10, fontSize: 12, color: T.inkSub, lineHeight: 1.5 }}>Marking this received will receive all ordered quantities into stock.</div>}
        </>
      )}
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

// ── Labels for a purchase ───────────────────────────────────────────
// Seeds the shared label printer with this purchase's products, one label per
// unit received (falling back to the ordered qty for a not-yet-received PO).
export function PurchaseLabels({ T, purchase, onClose }: { T: any; purchase: any; onClose: () => void }) {
  const [catalog, setCatalog] = useStatePu<any[]>([]);
  const [ready, setReady] = useStatePu(false);
  useEffectPu(() => {
    if (API.config?.isReal?.()) API.product.list({ per_page: 200 }).then((r: any) => setCatalog(r.items || [])).catch(() => setCatalog([])).finally(() => setReady(true));
    else { setCatalog(PRODUCTS); setReady(true); }
  }, []);

  if (!ready) {
    return <Modal T={T} title="Print labels" subtitle={purchase.ref_no} width={420} onClose={onClose} footer={null}>
      <div style={{ padding: 20, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>Loading products…</div>
    </Modal>;
  }

  const byId = new Map(catalog.map((p: any) => [String(p.id), p]));
  const initialItems = (purchase.lines || []).map((l: any) => {
    const prod: any = byId.get(String(l.product_id));
    const qty = Number(l.received_qty) > 0 ? Number(l.received_qty) : Number(l.qty) || 1;
    const price = prod ? Number(prod.price || 0) : Number(l.selling_price || 0);
    const sku = (prod && prod.sku) || l.sku || '';
    if (!sku && !l.product_name) return null;
    return { key: String(l.product_id), name: (prod && prod.name) || l.product_name, sku, price, qty: Math.max(1, qty) };
  }).filter(Boolean);

  return <PrintLabels T={T} products={catalog} initialItems={initialItems} onClose={onClose} />;
}
