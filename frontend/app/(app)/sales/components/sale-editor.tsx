'use client';
// ─────────────────────────────────────────────────────────────────
// Add Sale — the back-office sale document.
//
// Status decides whether it reaches the books. Draft, Quotation and
// Proforma save the document and nothing else: no stock leaves the
// shelf, no journal is written, no receivable is raised. Finalising
// one later runs the same posting path as a sale saved as Final, so
// there is only ever one way for a sale to hit the ledger.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Panel, Field, TextField, SelectField, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { money, qty as fmtQty } from '@/lib/theme';
import { todayLocal } from '@/lib/business-settings';
import { API } from '@/lib/api';
import { ProductCombo } from '../../purchase-orders/components/product-combo';
import { miniNum } from '../../purchase-orders/components/bits';

const { useState, useEffect, useMemo, useCallback } = React;

type Line = {
  key: number; product_id: string; name: string; sku: string;
  quantity: string; unit_price: string; discount: string; tax_rate_id: string;
};

const STATUSES: [string, string][] = [
  ['completed', 'Final'], ['draft', 'Draft'], ['quotation', 'Quotation'], ['proforma', 'Proforma'],
];
const SHIPPING_STATUSES = ['', 'pending', 'packed', 'shipped', 'delivered', 'cancelled'];
// Only tenders the ledger knows how to route. `credit` is not one of them: an
// unpaid balance is expressed by simply not paying it.
const TENDERS: [string, string][] = [
  ['cash', 'Cash'], ['zaad', 'Zaad'], ['evc', 'EVC'], ['edahab', 'eDahab'], ['mpesa', 'M-Pesa'],
  ['telebirr', 'Telebirr'], ['cbe_birr', 'CBE Birr'], ['mobile_money', 'Mobile money'],
  ['visa', 'Visa'], ['mastercard', 'Mastercard'],
];

let SEQ = 1;
const blank = (): Line => ({ key: SEQ++, product_id: '', name: '', sku: '', quantity: '1', unit_price: '', discount: '0', tax_rate_id: '' });
const num = (v: any) => (Number(v) || 0);
const NON_POSTING = ['draft', 'quotation', 'proforma'];

/**
 * `sale` (the raw GET /sales/:id payload) switches the form into EDIT mode.
 * Editing a POSTED sale locks the status (it stays Final) and the payment block
 * (its recorded payments ride through the server's reverse + re-post untouched);
 * editing a draft is a plain rewrite and may finalise it in the same save.
 */
export function SaleEditor({ T, sale, initialStatus, onDone, onCancel }:
  { T: any; sale?: any; initialStatus?: string; onDone: (msg: string, savedStatus?: string) => void; onCancel: () => void }) {
  const editing = !!sale;
  const wasPosted = editing && !NON_POSTING.includes(sale.status);
  const [locations, setLocations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [taxes, setTaxes] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [schemes, setSchemes] = useState<any[]>([]);

  const [locationId, setLocationId] = useState(editing ? String(sale.locationId || '') : '');
  const [customerId, setCustomerId] = useState(editing ? String(sale.customerId || '') : '');
  const [status, setStatus] = useState(editing ? sale.status : (initialStatus || 'completed'));
  const [saleDate, setSaleDate] = useState(editing && sale.saleDate ? String(sale.saleDate).slice(0, 10) : todayLocal());
  const [payTerm, setPayTerm] = useState(editing && sale.payTerm != null ? String(sale.payTerm) : '');
  const [payTermPeriod, setPayTermPeriod] = useState(editing ? (sale.payTermPeriod || 'days') : 'days');
  const [schemeId, setSchemeId] = useState(editing ? String(sale.invoiceSchemeId || '') : '');
  const [invoiceNo, setInvoiceNo] = useState(editing ? (sale.saleNumber || '') : '');
  const [doc, setDoc] = useState<any>(editing && sale.documentUrl ? { url: sale.documentUrl, key: sale.documentKey, name: 'Attached document' } : null);
  const [docBusy, setDocBusy] = useState(false);

  const [lines, setLines] = useState<Line[]>(editing
    ? [...(sale.items || []).map((it: any): Line => ({
        key: SEQ++, product_id: String(it.productId), name: (it.product && it.product.name) || '',
        sku: (it.product && it.product.sku) || '', quantity: String(it.quantity),
        unit_price: String(it.unitPrice), discount: String(it.discount || 0), tax_rate_id: it.taxRateId || '',
      })), blank()]
    : [blank()]);
  const [discountType, setDiscountType] = useState(editing ? (sale.discountType || 'pct') : 'pct');
  const [discountValue, setDiscountValue] = useState(editing ? String(sale.discountValue || 0) : '0');
  const [orderTaxId, setOrderTaxId] = useState(editing ? (sale.taxRateId || '') : '');
  const [sellNote, setSellNote] = useState(editing ? (sale.notes || '') : '');
  const [staffNote, setStaffNote] = useState(editing ? (sale.staffNote || '') : '');

  const [shipDetails, setShipDetails] = useState(editing ? (sale.shippingDetails || '') : '');
  const [shipAddress, setShipAddress] = useState(editing ? (sale.shippingAddress || '') : '');
  const [shipCharges, setShipCharges] = useState(editing ? String(sale.shippingCharges || 0) : '0');
  const [shipStatus, setShipStatus] = useState(editing ? (sale.shippingStatus || '') : '');
  const [deliveredTo, setDeliveredTo] = useState(editing ? (sale.deliveredTo || '') : '');
  const [deliveryPersonId, setDeliveryPersonId] = useState(editing ? String(sale.deliveryPersonId || '') : '');
  const [shipDoc, setShipDoc] = useState<any>(editing && sale.shippingDocumentUrl ? { url: sale.shippingDocumentUrl, key: sale.shippingDocumentKey, name: 'Shipping document' } : null);

  const pad4 = (xs: any[]) => { const out = xs.map((e: any) => ({ name: e.name || '', amount: String(e.amount || '') })); while (out.length < 4) out.push({ name: '', amount: '' }); return out; };
  const [expenses, setExpenses] = useState<any[]>(pad4(editing ? (sale.expenses || []) : []));
  const [showExpenses, setShowExpenses] = useState(editing && (sale.expenses || []).length > 0);

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [paidOn, setPaidOn] = useState(todayLocal());
  const [payAccountId, setPayAccountId] = useState('');
  const [payNote, setPayNote] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [show, toastNode] = useToast();

  const posts = status === 'completed';

  useEffect(() => {
    // In edit mode the location came from the sale — don't clobber it.
    API.location.list().then((ls: any[]) => { setLocations(ls || []); if (!editing && ls && ls[0]) setLocationId(String(ls[0].id)); }).catch(() => {});
    API.contact.list({ type: 'customer' }).then(setCustomers).catch(() => {});
    API.product.list({ per_page: 500 }).then((r: any) => setProducts(r.items || [])).catch(() => {});
    Promise.all([API.taxRate.list().catch(() => []), API.taxRate.groups().catch(() => [])])
      .then(([a, b]: any[]) => setTaxes([...(a || []), ...(b || [])]));
    API.paymentAccount.list().then(setAccounts).catch(() => {});
    API.user.list().then(setUsers).catch(() => {});
    API.invoiceScheme.list().then(setSchemes).catch(() => {});
  }, []);

  const customer = useMemo(() => customers.find((c: any) => String(c.id) === customerId), [customers, customerId]);
  const rateOf = useCallback((id: string) => {
    const t = taxes.find((x: any) => String(x.id) === id);
    return t ? Number(t.amount) / 100 : 0;
  }, [taxes]);

  // Mirrors backend lib/saleInvoice.computeTotals exactly: line tax on the line's
  // own net, order tax on the subtotal after the order discount, and they add up.
  const t = useMemo(() => {
    let subtotal = 0, lineTax = 0;
    for (const l of lines) {
      if (!l.product_id) continue;
      const net = num(l.quantity) * num(l.unit_price) - num(l.discount);
      subtotal += net;
      lineTax += net * rateOf(l.tax_rate_id);
    }
    const discountAmount = discountType === 'flat'
      ? Math.min(subtotal, num(discountValue))
      : subtotal * (num(discountValue) / 100);
    const goods = subtotal - discountAmount;
    const orderTax = goods * rateOf(orderTaxId);
    const tax = lineTax + orderTax;
    const shipping = num(shipCharges);
    const expensesTotal = expenses.reduce((s, e) => s + (e.name ? num(e.amount) : 0), 0);
    const total = goods + tax + shipping + expensesTotal;
    return { subtotal, discountAmount, goods, tax, shipping, expensesTotal, total };
  }, [lines, discountType, discountValue, orderTaxId, shipCharges, expenses, rateOf]);

  // A posted sale's money is its recorded payments; the form takes no new ones.
  const paidAlready = wasPosted ? num(sale.amountPaid) : 0;
  const paid = wasPosted ? paidAlready : posts ? num(payAmount) : 0;
  const balance = Math.max(0, t.total - paid);
  const changeReturn = Math.max(0, paid - t.total);

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const dropLine = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [blank()]));
  const pickProduct = (key: number, pid: any) => {
    const p = products.find((x: any) => String(x.id) === String(pid));
    if (!p) return;
    setLines((ls) => ls.map((l) => (l.key === key
      ? { ...l, product_id: String(p.id), name: p.name, sku: p.sku || '', unit_price: String(p.selling_price ?? p.price ?? '') }
      : l)));
    setLines((ls) => (ls.every((l) => l.product_id) ? [...ls, blank()] : ls));
  };

  async function upload(file: File, set: (v: any) => void) {
    setDocBusy(true); setErr(null);
    try { const r = await API.upload.file(file); set({ url: r.url, key: r.key, name: file.name }); }
    catch (e: any) { setErr(e.message || 'Could not upload that file.'); }
    finally { setDocBusy(false); }
  }

  async function save(andPrint: boolean) {
    const items = lines.filter((l) => l.product_id && num(l.quantity) > 0);
    if (!locationId) { setErr('Choose a business location.'); return; }
    if (!items.length) { setErr('Add at least one product.'); return; }
    if (!saleDate) { setErr('A sale date is required.'); return; }
    if (posts && balance > 0.001 && !customerId) {
      setErr('This sale is not fully paid, so it has to be billed to a customer. Pick a customer, or take the full amount now.');
      return;
    }
    if (!wasPosted && paid - t.total > 0.001 && payMethod !== 'cash') {
      setErr('Only a cash payment may exceed the total (as change). Reduce the amount.');
      return;
    }
    if (wasPosted && paidAlready - t.total > 0.001) {
      setErr(`The ${paidAlready.toFixed(2)} already paid exceeds the new total. Money would have to be returned first — use a sell return instead of shrinking the sale.`);
      return;
    }

    setBusy(true); setErr(null);
    try {
      // A posted sale keeps its recorded payments — the form takes no new ones.
      const payments = !wasPosted && posts && paid > 0
        ? [{ method: payMethod, amount: Math.min(paid, t.total), paid_on: paidOn, payment_account_id: payAccountId || undefined, note: payNote || undefined, tendered: paid }]
        : [];
      const body = {
        location_id: locationId, customer_id: customerId || undefined, status,
        sale_date: saleDate, pay_term: payTerm || undefined, pay_term_period: payTerm ? payTermPeriod : undefined,
        invoice_scheme_id: schemeId || undefined, invoice_no: invoiceNo || undefined,
        document_url: doc?.url, document_key: doc?.key,
        discount_type: discountType, discount_value: discountValue,
        tax_rate_id: orderTaxId || undefined,
        notes: sellNote, staff_note: staffNote,
        shipping_details: shipDetails, shipping_address: shipAddress, shipping_charges: shipCharges,
        shipping_status: shipStatus || undefined, delivered_to: deliveredTo,
        delivery_person_id: deliveryPersonId || undefined,
        shipping_document_url: shipDoc?.url, shipping_document_key: shipDoc?.key,
        expenses,
        items: items.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price, discount: l.discount, tax_rate_id: l.tax_rate_id || undefined })),
        payments,
      };
      const saved: any = editing
        ? await API.sell.updateInvoice(sale.id, body)
        : await API.sell.createInvoice(body);
      if (andPrint && saved && saved.id) window.open(`/sales?print=${saved.id}`, '_blank');
      const label = STATUSES.find(([k]) => k === status)?.[1] || 'Sale';
      onDone(editing
        ? `${saved.saleNumber || ''} updated${wasPosted ? ' · stock and ledger re-posted' : ''}`
        : posts ? `${label} saved · ${saved.saleNumber || ''} · stock and ledger updated` : `${label} saved · nothing posted to the ledger`,
        status);
    } catch (e: any) {
      setErr(e.message || 'Could not save the sale.');
      setBusy(false);
    }
  }

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 12, borderBottom: `1px solid ${T.line}`, verticalAlign: 'middle' };
  const mono = { fontFamily: T.fMono } as React.CSSProperties;
  const lineNet = (l: Line) => num(l.quantity) * num(l.unit_price) - num(l.discount);
  const lineIncTax = (l: Line) => lineNet(l) * (1 + rateOf(l.tax_rate_id));

  // `onFile` is passed explicitly — routing by label would send both chips'
  // uploads to whichever setter matched the string.
  const FileChip = ({ file, onFile, onClear }: { file: any; onFile: (v: any) => void; onClear: () => void }) => (
    file ? (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12.5, background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r }}>
        <span>📄</span>
        <a href={file.url} target="_blank" rel="noreferrer" style={{ color: T.accent.text, fontWeight: 600, textDecoration: 'none', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</a>
        <button onClick={onClear} style={{ border: 'none', background: 'none', color: T.redText, cursor: 'pointer' }}>✕</button>
      </div>
    ) : (
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, color: T.inkMid, background: T.paper, border: `1px dashed ${T.line}`, borderRadius: T.r, cursor: docBusy ? 'wait' : 'pointer' }}>
        📎 {docBusy ? 'Uploading…' : 'Browse..'}
        <input type="file" accept=".pdf,.csv,.zip,.doc,.docx,.jpeg,.jpg,.png" style={{ display: 'none' }}
          onChange={(e: any) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f, onFile); }} />
      </label>
    )
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title={editing ? `Edit Sale · ${sale.saleNumber || ''}`
          : initialStatus === 'draft' ? 'Add Draft' : initialStatus === 'quotation' ? 'Add Quotation' : 'Add Sale'}
        subtitle={wasPosted ? 'Reverses the old posting and re-posts the new one in a single transaction'
          : posts ? 'Deducts stock and posts to the ledger' : 'Saved as a document — nothing is posted'}
        right={<Btn T={T} kind="ghost" onClick={onCancel}>← Back to sales</Btn>} />

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Header */}
          <Panel T={T}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 14 }}>
              <Field T={T} label="Business Location *">
                <SelectField T={T} value={locationId} options={locations.map((l: any) => String(l.id))} onChange={setLocationId}
                  render={(v: any) => (locations.find((l: any) => String(l.id) === v) || {}).name || 'Select'} />
              </Field>
              <Field T={T} label="Customer *" hint={customer ? (customer.address || customer.phone || '') : 'Leave blank for a walk-in — but then it must be paid in full'}>
                <SelectField T={T} value={customerId} options={['', ...customers.map((c: any) => String(c.id))]} onChange={setCustomerId}
                  render={(v: any) => (v ? (customers.find((c: any) => String(c.id) === v) || {}).name : 'Walk-In Customer')} />
              </Field>
              <Field T={T} label="Pay term" hint="Payments due within this period show on the dashboard">
                <div style={{ display: 'flex', gap: 6 }}>
                  <TextField T={T} type="number" min={0} value={payTerm} onChange={setPayTerm} placeholder="Pay term" />
                  <SelectField T={T} value={payTermPeriod} options={['days', 'months']} onChange={setPayTermPeriod} render={(v: any) => (v === 'days' ? 'Days' : 'Months')} />
                </div>
              </Field>
              <Field T={T} label="Sale Date *"><TextField T={T} type="date" value={saleDate} onChange={setSaleDate} /></Field>
              <Field T={T} label="Status *" hint={wasPosted ? 'A posted sale stays Final' : posts ? 'Posts stock + ledger on save' : 'Document only — finalise it later to post'}>
                <SelectField T={T} value={status} options={STATUSES.map(([k]) => k)} onChange={setStatus} disabled={wasPosted}
                  render={(v: any) => STATUSES.find(([k]) => k === v)?.[1] || v} />
              </Field>
              <Field T={T} label="Invoice scheme" hint={editing ? 'Fixed when the document was created' : undefined}>
                <SelectField T={T} value={schemeId} options={['', ...schemes.map((s: any) => String(s.id))]} onChange={setSchemeId} disabled={editing}
                  render={(v: any) => (v ? (schemes.find((s: any) => String(s.id) === v) || {}).name : "Location's default")} />
              </Field>
              <Field T={T} label="Invoice No." hint="Keep blank to auto generate">
                <TextField T={T} value={invoiceNo} onChange={setInvoiceNo} placeholder="Invoice No." />
              </Field>
              <Field T={T} label="Attach Document" hint="Max 5MB · pdf, csv, zip, doc, image">
                <div><FileChip file={doc} onFile={setDoc} onClear={() => setDoc(null)} /></div>
              </Field>
            </div>
          </Panel>

          {/* Lines */}
          <Panel T={T} pad={false}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>
                  <th style={{ ...th, width: 28 }}>#</th>
                  <th style={{ ...th, textAlign: 'left', minWidth: 240 }}>Product</th>
                  <th style={{ ...th, textAlign: 'right', width: 92 }}>Quantity</th>
                  <th style={{ ...th, textAlign: 'right', width: 110 }}>Unit Price</th>
                  <th style={{ ...th, textAlign: 'right', width: 100 }}>Discount</th>
                  <th style={{ ...th, textAlign: 'left', width: 150 }}>Tax</th>
                  <th style={{ ...th, textAlign: 'right', width: 120 }}>Price inc. tax</th>
                  <th style={{ ...th, textAlign: 'right', width: 110 }}>Subtotal</th>
                  <th style={{ ...th, width: 34 }} />
                </tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.key}>
                      <td style={{ ...td, color: T.inkMute, textAlign: 'center' }}>{l.product_id ? i + 1 : ''}</td>
                      <td style={td}><ProductCombo T={T} products={products} value={l.product_id} onPick={(pid: any) => pickProduct(l.key, pid)} /></td>
                      <td style={td}><input type="number" min={1} step={1} value={l.quantity} onChange={(e: any) => setLine(l.key, { quantity: e.target.value })} style={miniNum(T)} /></td>
                      <td style={td}><input type="number" min={0} step="0.01" value={l.unit_price} onChange={(e: any) => setLine(l.key, { unit_price: e.target.value })} style={miniNum(T)} /></td>
                      <td style={td}><input type="number" min={0} step="0.01" value={l.discount} onChange={(e: any) => setLine(l.key, { discount: e.target.value })} style={miniNum(T)} /></td>
                      <td style={td}>
                        <SelectField T={T} value={l.tax_rate_id} options={['', ...taxes.map((x: any) => String(x.id))]} onChange={(v: any) => setLine(l.key, { tax_rate_id: v })}
                          render={(v: any) => { if (!v) return 'None'; const x = taxes.find((y: any) => String(y.id) === v); return x ? `${x.name} @ ${x.amount}%` : 'None'; }}
                          style={{ padding: '6px 8px', fontSize: 12 }} />
                      </td>
                      <td style={{ ...td, ...mono, textAlign: 'right', color: T.inkSub }}>{l.product_id ? money(lineIncTax(l)) : '—'}</td>
                      <td style={{ ...td, ...mono, textAlign: 'right', fontWeight: 600, color: T.ink }}>{l.product_id ? money(lineNet(l)) : '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <button onClick={() => dropLine(l.key)} aria-label="Remove line" style={{ border: 'none', background: 'none', color: T.redText, cursor: 'pointer', fontSize: 14 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td colSpan={6} style={{ ...td, textAlign: 'right', fontWeight: 700, color: T.ink, background: T.paperAlt }}>
                    Items: <span style={mono}>{fmtQty(lines.filter((l) => l.product_id).reduce((s, l) => s + num(l.quantity), 0))}</span>
                  </td>
                  <td colSpan={2} style={{ ...td, textAlign: 'right', fontWeight: 700, color: T.ink, background: T.paperAlt, ...mono }}>Total: {money(t.subtotal)}</td>
                  <td style={{ ...td, background: T.paperAlt }} />
                </tr></tfoot>
              </table>
            </div>
            <div style={{ padding: '10px 14px', fontSize: 11.5, color: T.inkMute, borderTop: `1px solid ${T.line}` }}>
              Search a product by name, SKU or barcode. A new row appears as soon as the last one is filled.
            </div>
          </Panel>

          {/* Discount / order tax / notes */}
          <Panel T={T}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 14, alignItems: 'end' }}>
              <Field T={T} label="Discount Type *">
                <SelectField T={T} value={discountType} options={['pct', 'flat']} onChange={setDiscountType} render={(v: any) => (v === 'pct' ? 'Percentage' : 'Fixed')} />
              </Field>
              <Field T={T} label="Discount Amount *"><TextField T={T} type="number" min={0} step="0.01" value={discountValue} onChange={setDiscountValue} /></Field>
              <div style={{ fontSize: 12.5, color: T.inkMid }}>Discount Amount: <b style={{ ...mono, color: T.redText }}>(−) {money(t.discountAmount)}</b></div>
              <Field T={T} label="Order Tax *">
                <SelectField T={T} value={orderTaxId} options={['', ...taxes.map((x: any) => String(x.id))]} onChange={setOrderTaxId}
                  render={(v: any) => { if (!v) return 'None'; const x = taxes.find((y: any) => String(y.id) === v); return x ? `${x.name} @ ${x.amount}%` : 'None'; }} />
              </Field>
              <div style={{ fontSize: 12.5, color: T.inkMid }}>Order Tax: <b style={{ ...mono, color: T.ink }}>(+) {money(t.tax)}</b></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14, marginTop: 14 }}>
              <Field T={T} label="Sell note" hint="Printed on the invoice">
                <textarea value={sellNote} onChange={(e: any) => setSellNote(e.target.value)} rows={3}
                  style={{ width: '100%', padding: 10, fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              </Field>
              <Field T={T} label="Staff note" hint="Internal — never printed">
                <textarea value={staffNote} onChange={(e: any) => setStaffNote(e.target.value)} rows={3}
                  style={{ width: '100%', padding: 10, fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              </Field>
            </div>
          </Panel>

          {/* Shipping */}
          <Panel T={T} title="Shipping">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 14 }}>
              <Field T={T} label="Shipping Details"><TextField T={T} value={shipDetails} onChange={setShipDetails} placeholder="Shipping Details" /></Field>
              <Field T={T} label="Shipping Address"><TextField T={T} value={shipAddress} onChange={setShipAddress} placeholder="Shipping Address" /></Field>
              <Field T={T} label="Shipping Charges" hint="Billed as shipping income, not product revenue">
                <TextField T={T} type="number" min={0} step="0.01" value={shipCharges} onChange={setShipCharges} />
              </Field>
              <Field T={T} label="Shipping Status">
                <SelectField T={T} value={shipStatus} options={SHIPPING_STATUSES} onChange={setShipStatus}
                  render={(v: any) => (v ? v[0].toUpperCase() + v.slice(1) : 'Please Select')} />
              </Field>
              <Field T={T} label="Delivered To"><TextField T={T} value={deliveredTo} onChange={setDeliveredTo} placeholder="Delivered To" /></Field>
              <Field T={T} label="Delivery Person">
                <SelectField T={T} value={deliveryPersonId} options={['', ...users.map((u: any) => String(u.id))]} onChange={setDeliveryPersonId}
                  render={(v: any) => (v ? (users.find((u: any) => String(u.id) === v) || {}).name : 'Please Select')} />
              </Field>
              <Field T={T} label="Shipping Documents"><div><FileChip file={shipDoc} onFile={setShipDoc} onClear={() => setShipDoc(null)} /></div></Field>
            </div>

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Btn T={T} kind="accent" onClick={() => setShowExpenses((v) => !v)}>+ Add additional expenses {showExpenses ? '▴' : '▾'}</Btn>
            </div>
            {showExpenses && (
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.5 }}>Additional expense name</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.5 }}>Amount</div>
                {expenses.map((e, i) => (
                  <React.Fragment key={i}>
                    <TextField T={T} value={e.name} onChange={(v: any) => setExpenses((xs) => xs.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
                    <TextField T={T} type="number" min={0} step="0.01" value={e.amount} onChange={(v: any) => setExpenses((xs) => xs.map((x, j) => (j === i ? { ...x, amount: v } : x)))} placeholder="0" />
                  </React.Fragment>
                ))}
                <div style={{ gridColumn: '1 / -1', fontSize: 11, color: T.inkMute }}>Billed to the customer and recorded as other income.</div>
              </div>
            )}
            <div style={{ marginTop: 16, textAlign: 'right', fontSize: 15, fontWeight: 700, color: T.ink }}>
              Total Payable: <span style={mono}>{money(t.total)}</span>
            </div>
          </Panel>

          {/* Payment */}
          <Panel T={T} title={wasPosted ? 'Payments' : 'Add payment'}>
            {wasPosted ? (
              <div style={{ fontSize: 12.5, color: T.inkMid, lineHeight: 1.7 }}>
                <div>
                  Paid so far <b style={{ ...mono, color: T.ink, fontSize: 15, margin: '0 6px' }}>{money(paidAlready)}</b>
                  across {(sale.payments || []).filter((p: any) => p.status === 'completed').length} payment(s) — they stay attached and ride through this edit untouched.
                </div>
                <div style={{ marginTop: 6 }}>
                  Balance after this edit: <b style={{ ...mono, color: balance > 0 ? T.redText : T.ink }}>{money(balance)}</b>
                  {balance > 0 && customerId ? ' — billed to the customer as a receivable.' : ''}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: T.inkMute }}>Take or view payments from the row's Actions → View Payments.</div>
              </div>
            ) : !posts ? (
              <div style={{ fontSize: 12.5, color: T.inkMute, lineHeight: 1.6 }}>
                A {STATUSES.find(([k]) => k === status)?.[1].toLowerCase()} takes no payment. Finalise it from the sales list when the customer commits, and record the payment then.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: T.inkSub, marginBottom: 12 }}>
                  Advance Balance: <b style={{ ...mono, color: T.ink }}>{money(0)}</b>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 14 }}>
                  <Field T={T} label="Amount *"><TextField T={T} type="number" min={0} step="0.01" value={payAmount} onChange={setPayAmount} placeholder="0.00" /></Field>
                  <Field T={T} label="Paid on *"><TextField T={T} type="date" value={paidOn} onChange={setPaidOn} /></Field>
                  <Field T={T} label="Payment Method *">
                    <SelectField T={T} value={payMethod} options={TENDERS.map(([k]) => k)} onChange={setPayMethod} render={(v: any) => TENDERS.find(([k]) => k === v)?.[1] || v} />
                  </Field>
                  <Field T={T} label="Payment Account">
                    <SelectField T={T} value={payAccountId} options={['', ...accounts.map((a: any) => String(a.id))]} onChange={setPayAccountId}
                      render={(v: any) => (v ? (accounts.find((a: any) => String(a.id) === v) || {}).name : 'None')} />
                  </Field>
                </div>
                <Field T={T} label="Payment note" full>
                  <textarea value={payNote} onChange={(e: any) => setPayNote(e.target.value)} rows={2}
                    style={{ width: '100%', marginTop: 12, padding: 10, fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
                </Field>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12.5, color: T.inkSub }}>Change Return:</div>
                    <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: T.ink }}>{money(changeReturn)}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13.5, color: T.inkSub }}>
                    Balance: <b style={{ ...mono, color: balance > 0 ? T.redText : T.ink, fontSize: 16, marginLeft: 6 }}>{money(balance)}</b>
                    {balance > 0 && <div style={{ fontSize: 11, color: T.inkMute, marginTop: 4 }}>Billed to {customer ? customer.name : 'the customer'} as a receivable.</div>}
                  </div>
                </div>
              </>
            )}
          </Panel>

          {err && <div style={{ padding: '11px 14px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, paddingBottom: 30 }}>
            <Btn T={T} kind="accent" onClick={() => save(false)} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
            <Btn T={T} kind="ghost" onClick={() => save(true)} disabled={busy}>Save and print</Btn>
          </div>
        </div>
      </div>
      {toastNode}
    </div>
  );
}
