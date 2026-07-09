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
import { ActionsMenu } from '../../products/components/list-table';

const { useState: useStatePu, useEffect: useEffectPu } = React;

export function Purchases({ T }: { T: any }) {
  const [rows, setRows] = useStatePu<any[]>([]);
  const [loading, setLoading] = useStatePu(true);
  const [suppliers, setSuppliers] = useStatePu<any[]>([]);
  const [locs, setLocs] = useStatePu<any[]>([]);
  const [edit, setEdit] = useStatePu(false);
  const [editing, setEditing] = useStatePu<any>(null);   // an existing purchase being edited
  const [opening, setOpening] = useStatePu(false);
  const [view, setView] = useStatePu<any>(null);
  const [openMenu, setOpenMenu] = useStatePu<any>(null); // row whose Actions menu is open
  const [payFor, setPayFor] = useStatePu<any>(null);     // add-payment modal target
  const [paymentsFor, setPaymentsFor] = useStatePu<any>(null);
  const [statusFor, setStatusFor] = useStatePu<any>(null);
  const [delFor, setDelFor] = useStatePu<any>(null);
  const [show, node] = useToast();

  const openFull = React.useCallback((id: any, cb: (p: any) => void) => { API.purchaseOrder.get(id).then(cb).catch(() => show('Could not load the purchase.')); }, [show]);
  const isReceivedRow = (p: any) => ['received', 'partial', 'approved'].includes(p.status);
  const actionsFor = (p: any) => {
    const received = isReceivedRow(p);
    const items: any[] = [
      { label: '◉ View', on: () => setView(p) },
      { label: '⎙ Print', on: () => openFull(p.id, (full: any) => printPurchase(full)) },
      { label: '✎ Edit', on: () => openFull(p.id, (full: any) => setEditing(full)) },
      { sep: true },
      { label: '＋ Add payment', on: () => setPayFor(p) },
      { label: '◍ View payments', on: () => setPaymentsFor(p) },
      { sep: true },
      { label: '↻ Update status', on: () => setStatusFor(p) },
    ];
    if (!received) items.push({ label: '🗑 Delete', on: () => setDelFor(p), danger: true });
    return items;
  };
  async function doDelete(p: any) {
    try { await API.purchaseOrder.remove(p.id); setDelFor(null); show('Purchase cancelled'); reload(); }
    catch (e: any) { show(e.message || 'Could not cancel the purchase.'); }
  }

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
              <thead><tr>{[['Actions', 'l'], ['Reference', 'l'], ['Supplier', 'l'], ['Location', 'l'], ['Items', 'r'], ['Total', 'r'], ['Due', 'r'], ['Payment', 'r'], ['Date', 'r']].map(([h, a]: any, i: number) => (
                <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((p: any) => (
                  <tr key={p.id} onClick={() => setView(p)} style={{ cursor: 'pointer', transition: 'background .12s' }} onMouseEnter={(e: any) => e.currentTarget.style.background = T.paperAlt} onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}>
                    <td onClick={(e: any) => e.stopPropagation()} style={{ padding: '10px 18px', borderBottom: `1px solid ${T.line}` }}>
                      <ActionsMenu T={T} open={openMenu === p.id} onToggle={() => setOpenMenu((m: any) => m === p.id ? null : p.id)} items={actionsFor(p)} />
                    </td>
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
      {editing && <PurchaseEditor T={T} suppliers={suppliers} locs={locs} existing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); show('Purchase updated'); reload(); }} />}
      {opening && <OpeningStock T={T} onClose={() => setOpening(false)} toast={show} />}
      {view && <PurchaseView T={T} purchase={view} onClose={() => setView(null)} onEdit={(full: any) => { setView(null); setEditing(full); }} />}
      {payFor && <AddPaymentModal T={T} purchase={payFor} onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); show('Payment recorded'); reload(); }} />}
      {paymentsFor && <PaymentsModal T={T} purchase={paymentsFor} onClose={() => setPaymentsFor(null)} onAddPayment={() => { const p = paymentsFor; setPaymentsFor(null); setPayFor(p); }} />}
      {statusFor && <UpdateStatusModal T={T} purchase={statusFor} onClose={() => setStatusFor(null)} onSaved={(msg: string) => { setStatusFor(null); show(msg || 'Status updated'); reload(); }} />}
      {delFor && <ConfirmModal T={T} title="Cancel purchase?" body={`This cancels purchase ${delFor.ref_no}. This can't be undone.`} confirmLabel="Cancel purchase" onConfirm={() => doDelete(delFor)} onClose={() => setDelFor(null)} />}
      {node}
    </div>
  );
}

// ── Purchase editor (also handles editing an existing purchase) ─────
function PurchaseEditor({ T, suppliers, locs, existing, onClose, onSaved }: { T: any; suppliers: any; locs: any; existing?: any; onClose: () => void; onSaved: () => void }) {
  const ex = existing || null;
  const isEdit = !!ex;
  // A received purchase already posted stock, cost & AP — its lines, amounts,
  // supplier and location are locked; only metadata may change.
  const locked = !!(ex && ex.received);
  const exLines: any[] = ex && Array.isArray(ex.lines) && ex.lines.length
    ? ex.lines.map((l: any) => ({
        product_id: l.product_id, qty: String(l.qty ?? ''), unit_id: l.unit_id || '',
        unit_cost: String(l.unit_cost_before_discount ?? l.unit_cost ?? ''),
        discount_percent: l.discount_percent ? String(l.discount_percent) : '',
        selling_price: l.selling_price != null ? String(l.selling_price) : '',
      }))
    : [blankLine()];

  const [supplier_id, setSupplier] = useStatePu<any>(ex ? ex.supplier_id : '');
  const [reference, setReference] = useStatePu(ex ? (ex.ref_no || '') : '');
  const [status, setStatus] = useStatePu(ex ? formStatus(ex.status) : 'received');   // received | ordered | pending
  const [location_id, setLocation] = useStatePu<any>(ex ? (ex.location_id || '') : ((locs[0] || {}).id || ''));
  const [date, setDate] = useStatePu(ex ? (ex.date || new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10));
  const [payTerm, setPayTerm] = useStatePu(ex && ex.payment_terms ? String(ex.payment_terms) : '');
  const [notes, setNotes] = useStatePu(ex ? (ex.notes || '') : '');
  const [lines, setLines] = useStatePu<any[]>(exLines);
  const [discType, setDiscType] = useStatePu(ex && ex.discount > 0 ? 'fixed' : 'none');   // none | fixed | percent
  const [discVal, setDiscVal] = useStatePu(ex && ex.discount > 0 ? String(ex.discount) : '');
  const [taxRateId, setTaxRateId] = useStatePu('');      // purchase tax = a defined tax rate
  const [taxTouched, setTaxTouched] = useStatePu(false);
  const [taxRates, setTaxRates] = useStatePu<any[]>([]);
  const [shipping, setShipping] = useStatePu(ex && ex.shipping ? String(ex.shipping) : '');
  const [shipDetails, setShipDetails] = useStatePu(ex ? (ex.shipping_details || '') : '');   // carrier / tracking / handling notes
  const [expenses, setExpenses] = useStatePu<any[]>(ex && Array.isArray(ex.expenses) && ex.expenses.length ? ex.expenses.map((e: any) => ({ name: e.name, amount: String(e.amount) })) : [{ name: '', amount: '' }]);
  const [paid, setPaid] = useStatePu<any>('');
  const [payMethod, setPayMethod] = useStatePu('cash');
  const [payNote, setPayNote] = useStatePu('');
  const [paidOn, setPaidOn] = useStatePu(new Date().toISOString().slice(0, 10));
  const [doc, setDoc] = useStatePu<any>(ex && ex.document_url ? { url: ex.document_url, key: '', name: 'Attached document' } : null);
  const [docBusy, setDocBusy] = useStatePu(false);
  const [importMsg, setImportMsg] = useStatePu('');
  const docRef = React.useRef<any>(null);
  const importRef = React.useRef<any>(null);
  const [busy, setBusy] = useStatePu(false);
  const [err, setErr] = useStatePu<any>(null);
  // Live catalog in real mode; seed PRODUCTS is the mock fallback.
  const [catalog, setCatalog] = useStatePu<any[]>(PRODUCTS);
  const [units, setUnits] = useStatePu<any[]>([]);
  useEffectPu(() => {
    if (API.config?.isReal?.()) API.product.list({ per_page: 200 }).then((r: any) => setCatalog(r.items || [])).catch(() => {});
    API.unit.list().then((us: any) => setUnits(Array.isArray(us) ? us : [])).catch(() => {});
    API.taxRate.list().then((ts: any) => setTaxRates(Array.isArray(ts) ? ts : [])).catch(() => {});
  }, []);
  // Editing: once tax rates load, pre-select the one that reproduces the stored tax.
  useEffectPu(() => {
    if (!ex || taxTouched || taxRateId || !(ex.tax > 0) || !taxRates.length) return;
    const base = (ex.subtotal || 0) - (ex.discount || 0);
    if (base <= 0) return;
    const pct = (ex.tax / base) * 100;
    const match = taxRates.find((r: any) => Math.abs(Number(r.amount) - pct) < 0.05);
    if (match) setTaxRateId(String(match.id));
  }, [taxRates]);
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
  const taxRate = taxRateId ? Number((taxRates.find((r: any) => String(r.id) === String(taxRateId)) || {}).amount || 0) : 0;
  // If editing and the stored rate couldn't be matched to a defined rate, keep the stored tax amount.
  const taxAmt = taxRateId
    ? (subtotal > 0 ? +((subtotal - discountAmt) * taxRate / 100).toFixed(2) : 0)
    : (isEdit && !taxTouched && ex && ex.tax ? Number(ex.tax) : 0);
  const shipAmt = Number(shipping) || 0;
  const expensesTotal = expenses.reduce((s: any, e: any) => s + (Number(e.amount) || 0), 0);
  const total = Math.max(0, subtotal - discountAmt + taxAmt + shipAmt + expensesTotal);
  const due = Math.max(0, total - (Number(paid) || 0));

  const setExpense = (i: any, k: any, v: any) => setExpenses((es: any) => es.map((e: any, j: any) => j === i ? { ...e, [k]: v } : e));

  // ── Document attachment (invoice scan, etc.) ──
  async function onPickDoc(e: any) {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    setDocBusy(true); setErr(null);
    try { const r = await API.upload.file(f); setDoc({ url: r.url, key: r.key, name: f.name }); }
    catch (ex: any) { setErr(ex.message || 'Could not upload the document.'); }
    finally { setDocBusy(false); }
  }
  function onRemoveDoc() { const key = doc && doc.key; setDoc(null); if (key) API.upload.remove(key).catch(() => {}); }

  // ── Import product lines from CSV / XLSX ──
  async function onImportFile(e: any) {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    setImportMsg(''); setErr(null);
    try {
      const grid = await readSheet(f);
      const { lines: imported, matched, total } = mapImportRows(grid, products);
      if (!imported.length) { setImportMsg(`No products matched (${total} row${total === 1 ? '' : 's'} read). Use SKU or exact product name.`); return; }
      setLines((ls: any) => { const keep = ls.filter((l: any) => l.product_id); return [...keep, ...imported]; });
      setImportMsg(`Imported ${matched} of ${total} row${total === 1 ? '' : 's'}${matched < total ? ` · ${total - matched} unmatched` : ''}.`);
    } catch (ex: any) { setErr(ex.message || 'Could not read that file.'); }
  }

  async function save() {
    // ── Editing an existing purchase ──
    if (isEdit) {
      setBusy(true); setErr(null);
      try {
        const body: any = {
          reference_no: reference.trim() || undefined,
          date, pay_term: payTerm, notes,
          shipping_details: shipDetails.trim() || undefined,
          document_url: (doc && doc.url) || undefined, document_key: (doc && doc.key) || undefined,
        };
        if (!locked) {
          // Full edit — the purchase hasn't been received, so lines/amounts are safe to change.
          const valid = lines.filter((l: any) => l.product_id && Number(l.qty) > 0);
          if (!supplier_id) { setErr('Pick a supplier.'); setBusy(false); return; }
          if (!valid.length) { setErr('Add at least one product line.'); setBusy(false); return; }
          Object.assign(body, {
            supplier_id, location_id, status,
            discount_amount: discountAmt, tax_amount: taxAmt, shipping: shipAmt,
            expenses: expenses.filter((e: any) => e.name && Number(e.amount) > 0),
            lines: valid,
          });
        }
        await API.purchaseOrder.update(ex.id, body);
        onSaved();
      } catch (exn: any) { setErr(exn.message || 'Could not update the purchase.'); } finally { setBusy(false); }
      return;
    }

    // ── Creating a new purchase ──
    if (!supplier_id) { setErr('Pick a supplier.'); return; }
    const valid = lines.filter((l: any) => l.product_id && Number(l.qty) > 0);
    if (!valid.length) { setErr('Add at least one product line.'); return; }
    setBusy(true); setErr(null);
    try {
      const created = await API.purchaseOrder.create({
        supplier_id, location_id, date, reference_no: reference.trim() || undefined, status,
        pay_term: payTerm, notes,
        discount_amount: discountAmt, tax_amount: taxAmt, shipping: shipAmt,
        shipping_details: shipDetails.trim() || undefined,
        document_url: (doc && doc.url) || undefined, document_key: (doc && doc.key) || undefined,
        expenses: expenses.filter((e: any) => e.name && Number(e.amount) > 0),
        lines: valid,
      });
      // Immediately receive stock only when the purchase status is "received".
      if (status === 'received') {
        const items = (created && created._real && created._real.items) || [];
        const received = items.map((it: any) => ({ id: it.id, product_id: it.productId, qty: Number(it.orderedQty || 0), unit_price: Number(it.unitPrice || 0) }));
        await API.purchaseOrder.setStatus(created.id, 'received', received);
      }
      if (Number(paid) > 0) await API.purchaseOrder.pay(created.id, Number(paid), payMethod, payNote, paidOn).catch(() => {});
      onSaved();
    } catch (ex: any) { setErr(ex.message || 'Could not save the purchase.'); } finally { setBusy(false); }
  }

  const cols = '1.3fr 60px 96px 84px 62px 84px 84px 84px 54px 30px';
  const displayTotal = locked && ex ? ex.total : total;
  const dSub = locked && ex ? ex.subtotal : subtotal;
  const dDisc = locked && ex ? ex.discount : discountAmt;
  const dTax = locked && ex ? ex.tax : taxAmt;
  const dShip = locked && ex ? ex.shipping : shipAmt;
  const dExp = locked && ex ? ex.expenses_total : expensesTotal;
  const saveLabel = isEdit ? (busy ? 'Updating…' : 'Update purchase') : (busy ? 'Saving…' : status === 'received' ? 'Save & receive' : 'Save purchase');
  return (
    <Modal T={T} title={isEdit ? `Edit purchase${ex.ref_no ? ' · ' + ex.ref_no : ''}` : 'Add purchase'} subtitle={isEdit ? (locked ? 'Received — only reference, dates, notes, shipping details & document can change' : 'Update this purchase') : 'Record a purchase from a supplier'} width={980} onClose={onClose}
      footer={<>
        <div style={{ flex: 1, fontSize: 13.5, color: T.inkSub }}>Purchase total <b style={{ color: T.ink, fontFamily: T.fMono, marginLeft: 6, fontSize: 15 }}>{money(displayTotal)}</b>{!isEdit && due > 0 && <span style={{ marginLeft: 12, color: T.amberText }}>Due {money(due)}</span>}</div>
        <Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn T={T} kind="accent" onClick={save} disabled={busy}>{saveLabel}</Btn>
      </>}>
      {locked && <div style={{ marginBottom: 14, padding: '10px 13px', borderRadius: T.r, background: T.amberSoft || T.paperAlt, border: `1px solid ${T.amber || T.line}`, color: T.amberText || T.inkMid, fontSize: 12.5, lineHeight: 1.5 }}>
        This purchase has been received — its items, amounts, supplier and location are locked. To change quantities or costs, create a new purchase or a stock adjustment.
      </div>}
      {/* Header — even 3-column grid so nothing orphans */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px 16px' }}>
        <Field T={T} label="Supplier">{locked ? <StaticVal T={T}>{ex.supplier_name}</StaticVal> : <SelectField T={T} value={String(supplier_id)} options={['', ...suppliers.map((s: any) => String(s.id))]} onChange={(v: any) => setSupplier(v)} render={(v: any) => v ? (suppliers.find((s: any) => String(s.id) === v) || {}).name : 'Please select…'} />}</Field>
        <Field T={T} label="Reference No" hint={isEdit ? undefined : 'Blank = auto-generated'}><TextField T={T} value={reference} onChange={setReference} placeholder="e.g. PO-2026-001" /></Field>
        <Field T={T} label="Purchase Date"><TextField T={T} type="date" value={date} onChange={setDate} /></Field>
        <Field T={T} label="Purchase Status">{locked ? <StaticVal T={T}>{({ received: 'Received', ordered: 'Ordered', pending: 'Pending' } as any)[status] || status}</StaticVal> : <SelectField T={T} value={status} options={['received', 'ordered', 'pending']} onChange={setStatus} render={(v: any) => ({ received: 'Received', ordered: 'Ordered', pending: 'Pending' } as any)[v]} />}</Field>
        <Field T={T} label="Business Location">{locked ? <StaticVal T={T}>{ex.location_name}</StaticVal> : <SelectField T={T} value={String(location_id)} options={locs.map((l: any) => String(l.id))} onChange={setLocation} render={(v: any) => (locs.find((l: any) => String(l.id) === v) || {}).name} />}</Field>
        <Field T={T} label="Pay term (days)"><TextField T={T} type="number" value={payTerm} onChange={setPayTerm} placeholder="e.g. 30" /></Field>
      </div>
      {!locked && supplier && supplier.address && <div style={{ fontSize: 12, color: T.inkSub, marginTop: 8 }}>Address: {supplier.address}</div>}

      {/* Attach document — invoice scan / PDF / photo */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input ref={docRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.csv,.zip" style={{ display: 'none' }} onChange={onPickDoc} />
        {!doc ? (
          <button onClick={() => docRef.current && docRef.current.click()} disabled={docBusy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: T.fBody, color: T.inkMid, background: T.paper, border: `1px dashed ${T.line}`, borderRadius: T.r, cursor: docBusy ? 'wait' : 'pointer' }}>
            📎 {docBusy ? 'Uploading…' : 'Attach document'}
          </button>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12.5, background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r }}>
            <span>📄</span>
            <a href={doc.url} target="_blank" rel="noreferrer" style={{ color: T.accent.text, fontWeight: 600, textDecoration: 'none', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name || 'Document'}</a>
            <button onClick={onRemoveDoc} title="Remove document" style={{ border: 'none', background: 'none', color: T.redText, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>✕</button>
          </div>
        )}
        <span style={{ fontSize: 11, color: T.inkMute }}>Invoice, delivery note or receipt (pdf, image, doc)</span>
      </div>

      {/* Locked (received) purchases show their lines read-only */}
      {locked && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, marginBottom: 9 }}>PRODUCTS</div>
          <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 62px 100px', gap: 6, padding: '8px 12px', background: T.paperAlt, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub } as React.CSSProperties}>
              <span>Product</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Unit cost</span><span style={{ textAlign: 'right' }}>Disc %</span><span style={{ textAlign: 'right' }}>Subtotal</span>
            </div>
            {(ex.lines || []).map((l: any, i: number) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 62px 100px', gap: 6, padding: '7px 12px', borderTop: `1px solid ${T.line}`, alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: T.ink, fontWeight: 600 }}>{l.product_name}{l.sku ? <span style={{ color: T.inkMute, fontWeight: 400 }}> · {l.sku}</span> : null}</span>
                <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub } as React.CSSProperties}>{l.qty}{l.unit_name ? ` ${l.unit_name}` : ''}</span>
                <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub } as React.CSSProperties}>{money(l.unit_cost)}</span>
                <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub } as React.CSSProperties}>{l.discount_percent || 0}%</span>
                <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.ink } as React.CSSProperties}>{money((Number(l.qty) || 0) * (Number(l.unit_cost) || 0))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product lines — editable (new purchase or not-yet-received edit) */}
      {!locked && <>
      <div style={{ marginTop: 18, marginBottom: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.inkSub }}>PRODUCTS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {importMsg && <span style={{ fontSize: 11.5, color: T.inkSub }}>{importMsg}</span>}
          <input ref={importRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={onImportFile} />
          <button onClick={() => importRef.current && importRef.current.click()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', fontSize: 12, fontWeight: 700, fontFamily: T.fBody, color: T.accent.text, background: T.paper, border: `1px solid ${T.line}`, borderRadius: T.r, cursor: 'pointer' }}>
            ⇪ Import products
          </button>
        </div>
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto' }}>
        <div style={{ minWidth: 860 }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, padding: '8px 12px', background: T.paperAlt, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub } as React.CSSProperties}>
            <span>Product</span><span style={{ textAlign: 'right' }}>Qty</span><span>Unit</span><span style={{ textAlign: 'right' }}>Unit cost</span><span style={{ textAlign: 'right' }}>Disc %</span><span style={{ textAlign: 'right' }}>Net cost</span><span style={{ textAlign: 'right' }}>Subtotal</span><span style={{ textAlign: 'right' }}>Selling</span><span style={{ textAlign: 'right' }}>Margin</span><span />
          </div>
          {lines.map((l: any, i: number) => {
            const opts = unitOptsFor(l);
            return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, padding: '7px 12px', borderTop: `1px solid ${T.line}`, alignItems: 'center' }}>
              <ProductCombo T={T} products={products} value={l.product_id} onPick={(pid: any) => onPickProduct(i, pid)} />
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
      </>}

      {/* Totals + discount/tax/shipping/expenses */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, marginTop: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Discount · Tax · Shipping — one row that fills the column (editable only) */}
          {!locked && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <div style={sub(T)}>Discount</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: discType === 'none' ? 1 : '0 0 auto', width: discType === 'none' ? 'auto' : 110, minWidth: 0 }}><SelectField T={T} value={discType} options={['none', 'fixed', 'percent']} onChange={setDiscType} render={(v: any) => ({ none: 'None', fixed: 'Fixed', percent: '%' } as any)[v]} /></div>
                {discType !== 'none' && <input type="number" value={discVal} onChange={(e: any) => setDiscVal(e.target.value)} placeholder={discType === 'percent' ? '%' : '0.00'} style={{ ...miniNum(T), flex: 1, minWidth: 0 }} />}
              </div>
            </div>
            <div>
              <div style={sub(T)}>Purchase tax</div>
              <SelectField T={T} value={taxRateId} options={['', ...taxRates.map((r: any) => String(r.id))]} onChange={(v: any) => { setTaxRateId(v); setTaxTouched(true); }}
                render={(v: any) => { if (!v) return 'None'; const r = taxRates.find((x: any) => String(x.id) === v); return r ? `${r.name} (${r.amount}%)` : 'None'; }} />
            </div>
            <div>
              <div style={sub(T)}>Shipping charges</div>
              <input type="number" value={shipping} onChange={(e: any) => setShipping(e.target.value)} placeholder="0.00" style={{ ...miniNum(T), width: '100%' }} />
            </div>
          </div>}

          {/* Shipping details — full width (always editable) */}
          <div>
            <div style={sub(T)}>Shipping details</div>
            <input value={shipDetails} onChange={(e: any) => setShipDetails(e.target.value)} placeholder="Carrier, tracking number, handling notes…" style={{ width: '100%', padding: '9px 11px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} />
          </div>

          {/* Additional expenses — full width (editable only) */}
          {!locked && <div>
            <div style={sub(T)}>Additional expenses</div>
            {expenses.map((e: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input value={e.name} onChange={(ev: any) => setExpense(i, 'name', ev.target.value)} placeholder="Expense name" style={{ flex: 1, minWidth: 0, padding: '8px 10px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 6, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} />
                <input type="number" value={e.amount} onChange={(ev: any) => setExpense(i, 'amount', ev.target.value)} placeholder="0.00" style={{ ...miniNum(T), width: 120 }} />
              </div>
            ))}
            <button onClick={() => setExpenses((es: any) => [...es, { name: '', amount: '' }])} style={{ background: 'none', border: 'none', color: T.accent.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.fBody, padding: '2px 0' }}>+ Add expense</button>
          </div>}

          {/* Additional notes — full width */}
          <div>
            <div style={sub(T)}>Additional notes</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional" style={{ width: '100%', padding: '9px 11px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', resize: 'vertical', boxSizing: 'border-box' } as React.CSSProperties} />
          </div>
        </div>

        {/* Summary + payment */}
        <div style={{ background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[['Subtotal', dSub], ['Discount', -dDisc], ['Purchase tax', dTax], ['Shipping', dShip], ['Expenses', dExp]].map(([k, v]: any) => (
            (k === 'Subtotal' || v !== 0) ? <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.inkSub }}><span>{k}</span><span style={{ fontFamily: T.fMono, color: k === 'Discount' ? T.redText : T.ink }}>{money(v)}</span></div> : null
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 15, fontWeight: 700, paddingTop: 8, borderTop: `1px dashed ${T.line}` }}><span style={{ color: T.ink }}>Purchase total</span><span style={{ fontFamily: T.fMono, color: T.ink }}>{money(displayTotal)}</span></div>
          {isEdit && ex && ex.paid > 0 && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.inkSub }}><span>Paid</span><span style={{ fontFamily: T.fMono, color: T.greenText }}>{money(ex.paid)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600 }}><span style={{ color: T.inkSub }}>Due</span><span style={{ fontFamily: T.fMono, color: ex.due > 0 ? T.amberText : T.greenText }}>{money(ex.due)}</span></div>
          </>}
          {!isEdit && <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, marginBottom: 7 }}>PAYMENT</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 7 }}><span style={{ color: T.inkSub }}>Amount paid</span><input type="number" value={paid} onChange={(e: any) => setPaid(e.target.value)} placeholder="0.00" style={{ ...miniNum(T), width: 100 }} /></div>
            <div style={{ marginBottom: 7 }}><SelectField T={T} value={payMethod} options={['cash', 'bank', 'cheque', 'zaad', 'mobile']} onChange={setPayMethod} render={(v: any) => ({ cash: 'Cash', bank: 'Bank transfer', cheque: 'Cheque', zaad: 'ZAAD', mobile: 'Mobile money' } as any)[v]} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 7 }}><span style={{ color: T.inkSub }}>Paid on</span><input type="date" value={paidOn} onChange={(e: any) => setPaidOn(e.target.value)} style={{ padding: '6px 8px', fontSize: 12, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 6, outline: 'none' } as React.CSSProperties} /></div>
            <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Payment note" style={{ width: '100%', padding: '7px 9px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 6, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 8, fontWeight: 600 }}><span style={{ color: T.inkSub }}>Payment due</span><span style={{ fontFamily: T.fMono, color: due > 0 ? T.amberText : T.greenText }}>{money(due)}</span></div>
          </div>}
        </div>
      </div>
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
    </Modal>
  );
}
function blankLine() { return { product_id: '', qty: '', unit_id: '', unit_cost: '', discount_percent: '', selling_price: '' }; }
function sub(T: any): React.CSSProperties { return { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, marginBottom: 6 } as React.CSSProperties; }
// Backend PO status → the editor's three-way status.
function formStatus(s: any): string {
  if (s === 'received' || s === 'partial' || s === 'approved') return 'received';
  if (s === 'sent' || s === 'ordered') return 'ordered';
  return 'pending';
}
// Read-only field value (used for locked fields when editing a received purchase).
function StaticVal({ T, children }: { T: any; children: any }) {
  return <div style={{ padding: '9px 11px', fontSize: 13.5, fontFamily: T.fBody, color: T.inkMid, background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r } as React.CSSProperties}>{children || '—'}</div>;
}

// ── Searchable product picker — filters by name / SKU / barcode ──────
// Uses a fixed-position dropdown so it escapes the line table's overflow clip.
function ProductCombo({ T, products, value, onPick }: { T: any; products: any[]; value: any; onPick: (pid: any) => void }) {
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

// ── CSV / XLSX import → product lines ────────────────────────────────
// Returns a grid (array of rows, each an array of cell strings).
async function readSheet(file: any): Promise<string[][]> {
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX: any = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    return rows.map((r: any[]) => r.map((c: any) => (c == null ? '' : String(c))));
  }
  const text = await file.text();
  return text.split(/\r?\n/).filter((l: string) => l.trim() !== '').map(splitCsvLine);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Map an imported grid to purchase lines by matching SKU / barcode / name.
function mapImportRows(grid: string[][], products: any[]): { lines: any[]; matched: number; total: number } {
  if (!grid.length) return { lines: [], matched: 0, total: 0 };
  const find = (cands: string[], header: string[]) => header.findIndex((h) => cands.includes(h.trim().toLowerCase()));
  const first = grid[0].map((c) => c.trim().toLowerCase());
  const looksHeader = first.some((c) => ['sku', 'name', 'product', 'qty', 'quantity', 'cost', 'unit cost', 'price'].includes(c));
  let idx = { sku: 0, name: -1, qty: 1, cost: 2, sell: 3 };
  let body = grid;
  if (looksHeader) {
    idx = {
      sku: find(['sku', 'code', 'barcode', 'item code'], first),
      name: find(['name', 'product', 'product name', 'item', 'item name'], first),
      qty: find(['qty', 'quantity', 'purchase quantity', 'purchase qty'], first),
      cost: find(['cost', 'unit cost', 'unit_cost', 'purchase price', 'purchase_price', 'buy price'], first),
      sell: find(['selling', 'selling price', 'price', 'sale price', 'unit selling price', 'mrp'], first),
    };
    body = grid.slice(1);
  }
  const cell = (row: string[], i: number) => (i >= 0 && i < row.length ? String(row[i] || '').trim() : '');
  const lines: any[] = []; let matched = 0; let total = 0;
  for (const row of body) {
    if (!row.length || row.every((c) => !c || !c.trim())) continue;
    total++;
    const skuV = cell(row, idx.sku), nameV = cell(row, idx.name >= 0 ? idx.name : idx.sku);
    const p = matchProduct(products, skuV, nameV);
    if (!p) continue;
    matched++;
    const qty = cell(row, idx.qty), cost = cell(row, idx.cost), sell = cell(row, idx.sell);
    lines.push({
      product_id: p.id, unit_id: '',
      qty: qty && !isNaN(Number(qty)) ? String(Number(qty)) : '1',
      unit_cost: cost && !isNaN(Number(cost)) ? String(Number(cost)) : (p.cost != null ? String(p.cost) : ''),
      discount_percent: '',
      selling_price: sell && !isNaN(Number(sell)) ? String(Number(sell)) : (p.price != null ? String(p.price) : ''),
    });
  }
  return { lines, matched, total };
}

function matchProduct(products: any[], skuV: string, nameV: string): any {
  const s = String(skuV || '').trim().toLowerCase();
  const n = String(nameV || '').trim().toLowerCase();
  if (s) { const bySku = products.find((p: any) => String(p.sku || '').toLowerCase() === s || String(p.barcode || '').toLowerCase() === s); if (bySku) return bySku; }
  if (n) {
    let byName = products.find((p: any) => String(p.name || '').toLowerCase() === n); if (byName) return byName;
    byName = products.find((p: any) => String(p.name || '').toLowerCase().includes(n) && n.length >= 3); if (byName) return byName;
    const asSku = products.find((p: any) => String(p.sku || '').toLowerCase() === n || String(p.barcode || '').toLowerCase() === n); if (asSku) return asSku;
  }
  return null;
}

// ── Purchase detail ─────────────────────────────────────────────────
function PurchaseView({ T, purchase, onClose, onEdit }: { T: any; purchase: any; onClose: () => void; onEdit?: (p: any) => void }) {
  const [data, setData] = useStatePu<any>(null);
  useEffectPu(() => { API.purchaseOrder.get(purchase.id).then(setData).catch(() => setData(purchase)); }, [purchase.id]);
  const p = data || purchase;
  const loaded = !!data;
  const statusLabel = ({ received: 'Received', partial: 'Partially received', approved: 'Received', sent: 'Ordered', draft: 'Pending', pending_approval: 'Pending', cancelled: 'Cancelled' } as any)[p.status] || p.status || '—';
  const payLabel = ({ paid: 'Paid', partial: 'Partial', due: 'Due' } as any)[p.payment_status] || p.payment_status;
  const th: React.CSSProperties = { padding: '9px 10px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const mono = { fontFamily: T.fMono } as React.CSSProperties;

  return (
    <Modal T={T} title={`Purchase details · ${p.ref_no}`} subtitle={`${p.supplier_name}${p.location_name && p.location_name !== '—' ? ' · ' + p.location_name : ''}`} width={880} onClose={onClose}
      footer={<>
        <div style={{ flex: 1 }} />
        {loaded && <Btn T={T} kind="ghost" onClick={() => printPurchase(p)}>⎙ Print</Btn>}
        {loaded && onEdit && <Btn T={T} kind="ghost" onClick={() => onEdit(p)}>✎ Edit</Btn>}
        <Btn T={T} kind="accent" onClick={onClose}>Close</Btn>
      </>}>
      {/* Header — supplier / reference / status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginBottom: 18 }}>
        <div style={{ fontSize: 12.5, color: T.inkMid, lineHeight: 1.6 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 4 } as React.CSSProperties}>Supplier</div>
          <div style={{ fontWeight: 700, color: T.ink, fontSize: 13.5 }}>{p.supplier_name}</div>
          {p.supplier_address && <div>{p.supplier_address}</div>}
          {(p.supplier_city || p.supplier_country) && <div>{[p.supplier_city, p.supplier_country].filter(Boolean).join(', ')}</div>}
          {p.supplier_phone && <div>☎ {p.supplier_phone}</div>}
          {p.supplier_email && <div>✉ {p.supplier_email}</div>}
        </div>
        <div style={{ fontSize: 12.5, color: T.inkMid, lineHeight: 1.7 }}>
          <Row T={T} k="Reference" v={p.ref_no} mono />
          <Row T={T} k="Date" v={p.date} />
          {p.expected_delivery && <Row T={T} k="Expected" v={p.expected_delivery} />}
          <Row T={T} k="Status" v={statusLabel} />
          <Row T={T} k="Payment" v={<Badge T={T} tone={({ paid: 'green', partial: 'amber', due: 'red' } as any)[p.payment_status]}>{payLabel}</Badge>} />
        </div>
      </div>

      {/* Line items */}
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left', width: 30 }}>#</th>
            <th style={{ ...th, textAlign: 'left' }}>Product</th>
            <th style={{ ...th, textAlign: 'left' }}>SKU</th>
            <th style={{ ...th, textAlign: 'right' }}>Qty</th>
            <th style={{ ...th, textAlign: 'right' }}>Unit cost</th>
            <th style={{ ...th, textAlign: 'right' }}>Disc %</th>
            <th style={{ ...th, textAlign: 'right' }}>Net cost</th>
            <th style={{ ...th, textAlign: 'right' }}>Subtotal</th>
            <th style={{ ...th, textAlign: 'right' }}>Selling</th>
          </tr></thead>
          <tbody>
            {(p.lines || []).map((l: any, i: number) => (
              <tr key={i}>
                <td style={{ ...td, color: T.inkMute }}>{i + 1}</td>
                <td style={{ ...td, whiteSpace: 'normal', fontWeight: 600, color: T.ink }}>{l.product_name || ('Product #' + l.product_id)}</td>
                <td style={{ ...td, ...mono, color: T.inkSub }}>{l.sku || '—'}</td>
                <td style={{ ...td, ...mono, textAlign: 'right', color: T.inkSub }}>{l.qty}{l.unit_name ? ` ${l.unit_name}` : ''}</td>
                <td style={{ ...td, ...mono, textAlign: 'right', color: T.inkSub }}>{money(l.unit_cost_before_discount != null ? l.unit_cost_before_discount : l.unit_cost)}</td>
                <td style={{ ...td, ...mono, textAlign: 'right', color: T.inkSub }}>{l.discount_percent || 0}%</td>
                <td style={{ ...td, ...mono, textAlign: 'right', color: T.inkSub }}>{money(l.unit_cost)}</td>
                <td style={{ ...td, ...mono, textAlign: 'right', color: T.ink, fontWeight: 600 }}>{money((Number(l.qty) || 0) * (Number(l.unit_cost) || 0))}</td>
                <td style={{ ...td, ...mono, textAlign: 'right', color: T.inkSub }}>{l.selling_price != null ? money(l.selling_price) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[['Net total', p.subtotal], ['Discount (−)', p.discount], ['Purchase tax (+)', p.tax], ['Shipping (+)', p.shipping], ['Expenses (+)', p.expenses_total]].map(([k, v]: any) => (
            (k === 'Net total' || Number(v) !== 0) ? <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.inkSub }}><span>{k}</span><span style={{ ...mono, color: String(k).startsWith('Discount') ? T.redText : T.ink }}>{money(v)}</span></div> : null
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5, fontWeight: 700, paddingTop: 8, borderTop: `1px dashed ${T.line}` }}><span style={{ color: T.ink }}>Purchase total</span><span style={{ ...mono, color: T.ink }}>{money(p.grand_total)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.inkSub }}><span>Paid</span><span style={{ ...mono, color: T.greenText }}>{money(p.paid || 0)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600 }}><span style={{ color: T.inkSub }}>Due</span><span style={{ ...mono, color: p.due > 0 ? T.amberText : T.greenText }}>{money(p.due || 0)}</span></div>
        </div>
      </div>

      {/* Payment info */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 } as React.CSSProperties}>Payment info</div>
        <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto' }}>
          {Array.isArray(p.payments) && p.payments.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left' }}>Date</th>
                <th style={{ ...th, textAlign: 'left' }}>Reference</th>
                <th style={{ ...th, textAlign: 'left' }}>Mode</th>
                <th style={{ ...th, textAlign: 'left' }}>Note</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
              </tr></thead>
              <tbody>
                {p.payments.map((pay: any, i: number) => (
                  <tr key={pay.id || i}>
                    <td style={{ ...td, ...mono, color: T.inkMid }}>{pay.date || '—'}</td>
                    <td style={{ ...td, ...mono, color: T.inkSub }}>{pay.reference || '—'}</td>
                    <td style={{ ...td, color: T.inkSub, textTransform: 'capitalize' }}>{String(pay.method || '').replace(/_/g, ' ') || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal', color: T.inkSub }}>{pay.note || '—'}</td>
                    <td style={{ ...td, ...mono, textAlign: 'right', fontWeight: 600, color: T.greenText }}>{money(pay.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No payments found.</div>
          )}
        </div>
      </div>

      {/* Shipping details / notes / document */}
      {(p.shipping_details || p.notes || p.document_url) && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 5 } as React.CSSProperties}>Shipping details</div>
            <div style={{ fontSize: 12.5, color: T.inkMid }}>{p.shipping_details || '—'}</div>
            {p.document_url && <a href={p.document_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, color: T.accent.text, fontWeight: 600, textDecoration: 'none' }}>📄 View attached document</a>}
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 5 } as React.CSSProperties}>Additional notes</div>
            <div style={{ fontSize: 12.5, color: T.inkMid, whiteSpace: 'pre-wrap' }}>{p.notes || '—'}</div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Small label / value row used in the detail header.
function Row({ T, k, v, mono }: { T: any; k: any; v: any; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: T.inkSub }}>{k}</span>
      <span style={{ color: T.ink, fontWeight: 600, ...(mono ? { fontFamily: T.fMono } : {}) }}>{v}</span>
    </div>
  );
}

// Print a purchase — opens a clean, self-contained page and triggers the browser print dialog.
function printPurchase(p: any) {
  const esc = (s: any) => String(s == null ? '' : s).replace(/[&<>]/g, (c: string) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]));
  const m = (n: any) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = (p.lines || []).map((l: any, i: number) => `<tr>
    <td>${i + 1}</td><td>${esc(l.product_name)}</td><td>${esc(l.sku || '')}</td>
    <td class="r">${esc(l.qty)}${l.unit_name ? ' ' + esc(l.unit_name) : ''}</td>
    <td class="r">${m(l.unit_cost_before_discount != null ? l.unit_cost_before_discount : l.unit_cost)}</td>
    <td class="r">${esc(l.discount_percent || 0)}%</td>
    <td class="r">${m(l.unit_cost)}</td>
    <td class="r">${m((Number(l.qty) || 0) * (Number(l.unit_cost) || 0))}</td>
  </tr>`).join('');
  const pays = (p.payments || []).length
    ? (p.payments || []).map((pay: any) => `<tr><td>${esc(pay.date)}</td><td>${esc(pay.reference || '')}</td><td>${esc((pay.method || '').replace(/_/g, ' '))}</td><td>${esc(pay.note || '')}</td><td class="r">${m(pay.amount)}</td></tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#888">No payments found</td></tr>';
  const totalRow = (k: string, v: any, neg?: boolean) => (Number(v) !== 0 || k === 'Net total') ? `<tr><td>${k}</td><td class="r">${neg ? '−' : ''}${m(v)}</td></tr>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Purchase ${esc(p.ref_no)}</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;margin:28px;font-size:13px}
    h1{font-size:18px;margin:0 0 2px} .sub{color:#666;margin-bottom:18px}
    .hdr{display:flex;justify-content:space-between;gap:24px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left} th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
    .r{text-align:right;font-variant-numeric:tabular-nums}
    .totals{width:320px;margin-left:auto} .totals td{border:none;padding:3px 8px}
    .grand{font-weight:700;border-top:1px solid #999 !important}
    @media print{button{display:none}}
  </style></head><body>
  <h1>Purchase details — ${esc(p.ref_no)}</h1>
  <div class="sub">${esc(p.supplier_name)}${p.location_name && p.location_name !== '—' ? ' · ' + esc(p.location_name) : ''} · ${esc(p.date)}</div>
  <div class="hdr">
    <div><b>Supplier</b><br>${esc(p.supplier_name)}<br>${esc(p.supplier_address || '')}<br>${esc(p.supplier_phone || '')}</div>
    <div><b>Reference:</b> ${esc(p.ref_no)}<br><b>Date:</b> ${esc(p.date)}<br><b>Status:</b> ${esc(p.status)}<br><b>Payment:</b> ${esc(p.payment_status)}</div>
  </div>
  <table><thead><tr><th>#</th><th>Product</th><th>SKU</th><th class="r">Qty</th><th class="r">Unit cost</th><th class="r">Disc %</th><th class="r">Net cost</th><th class="r">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>
  <table class="totals">
    ${totalRow('Net total', p.subtotal)}
    ${totalRow('Discount', p.discount, true)}
    ${totalRow('Purchase tax', p.tax)}
    ${totalRow('Shipping', p.shipping)}
    ${totalRow('Expenses', p.expenses_total)}
    <tr class="grand"><td>Purchase total</td><td class="r">${m(p.grand_total)}</td></tr>
    <tr><td>Paid</td><td class="r">${m(p.paid || 0)}</td></tr>
    <tr><td>Due</td><td class="r">${m(p.due || 0)}</td></tr>
  </table>
  <b>Payment info</b>
  <table><thead><tr><th>Date</th><th>Reference</th><th>Mode</th><th>Note</th><th class="r">Amount</th></tr></thead><tbody>${pays}</tbody></table>
  ${p.shipping_details ? `<p><b>Shipping details:</b> ${esc(p.shipping_details)}</p>` : ''}
  ${p.notes ? `<p><b>Notes:</b> ${esc(p.notes)}</p>` : ''}
  <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Add payment ─────────────────────────────────────────────────────
function AddPaymentModal({ T, purchase, onClose, onSaved }: { T: any; purchase: any; onClose: () => void; onSaved: () => void }) {
  const due = Math.max(0, Number(purchase.due) || 0);
  const [amount, setAmount] = useStatePu(due ? String(due) : '');
  const [method, setMethod] = useStatePu('cash');
  const [paidOn, setPaidOn] = useStatePu(new Date().toISOString().slice(0, 10));
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
function PaymentsModal({ T, purchase, onClose, onAddPayment }: { T: any; purchase: any; onClose: () => void; onAddPayment: () => void }) {
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
function UpdateStatusModal({ T, purchase, onClose, onSaved }: { T: any; purchase: any; onClose: () => void; onSaved: (msg?: string) => void }) {
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

// ── Generic confirm ─────────────────────────────────────────────────
function ConfirmModal({ T, title, body, confirmLabel, onConfirm, onClose }: { T: any; title: any; body: any; confirmLabel: any; onConfirm: () => void; onClose: () => void }) {
  const [busy, setBusy] = useStatePu(false);
  return (
    <Modal T={T} title={title} width={420} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="danger" onClick={async () => { setBusy(true); await onConfirm(); }} disabled={busy}>{busy ? '…' : confirmLabel}</Btn></>}>
      <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>{body}</div>
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
