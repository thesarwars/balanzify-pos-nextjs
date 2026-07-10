'use client';
import React from 'react';
import { money } from '@/lib/theme';
import { Btn, Modal, Field, TextField, SelectField } from '@/components/kit';
import { API } from '@/lib/api';
import { PRODUCTS } from '@/lib/data';
import { blankLine, sub, formStatus, StaticVal, miniNum } from './bits';
import { ProductCombo } from './product-combo';
import { readSheet, mapImportRows } from './import-lines';

const { useState: useStatePu, useEffect: useEffectPu } = React;

// ── Purchase editor (also handles editing an existing purchase) ─────
export function PurchaseEditor({ T, suppliers, locs, existing, onClose, onSaved }: { T: any; suppliers: any; locs: any; existing?: any; onClose: () => void; onSaved: () => void }) {
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
