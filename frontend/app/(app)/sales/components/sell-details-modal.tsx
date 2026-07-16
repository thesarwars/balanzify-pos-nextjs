'use client';
// ─────────────────────────────────────────────────────────────────
// Sell Details — the "View" action on a sale.
//
// Everything shown is read back from the sale record itself: the
// totals are the stored columns, payment info is the SalePayment
// rows, and Activities are the events the record actually knows
// about (created / payments / returns) — not a synthesized log.
// Packing Slip and Print Invoice open self-contained pages and hand
// them to the browser's print dialog, headed with the business
// profile. A quotation or proforma prints under its own title, so a
// customer is never handed a "Invoice" for a sale that never posted.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Badge, Modal } from '@/components/kit';
import { money } from '@/lib/theme';
import { formatDate, formatDateTime } from '@/lib/business-settings';
import { API } from '@/lib/api';

const { useState, useEffect } = React;

const STATUS_LABEL: Record<string, string> = {
  completed: 'Final', draft: 'Draft', quotation: 'Quotation', proforma: 'Proforma',
  pending: 'Pending', refunded: 'Refunded', partially_refunded: 'Partially refunded', cancelled: 'Cancelled',
};
const PAY_TONE: Record<string, any> = { paid: 'green', partial: 'amber', due: 'red' };
const title = (s: any) => (s ? String(s)[0].toUpperCase() + String(s).slice(1).replace(/_/g, ' ') : '');
const n2 = (v: any) => Number(v) || 0;

/** Product line, unified for the table and both print documents. */
function docLines(s: any) {
  return (s.items || []).map((it: any, i: number) => {
    const variant = it.variant && it.variant.attributes
      ? Object.values(it.variant.attributes).join(' / ')
      : '';
    const gross = n2(it.quantity) * n2(it.unitPrice);
    return {
      i: i + 1,
      name: [it.product && it.product.name, variant].filter(Boolean).join(' — '),
      sku: (it.variant && it.variant.sku) || (it.product && it.product.sku) || '',
      qty: n2(it.quantity),
      unit: (it.product && it.product.unitOfMeasure) || '',
      unitPrice: n2(it.unitPrice),
      discount: n2(it.discount),
      tax: n2(it.taxAmount),
      incTax: gross - n2(it.discount) + n2(it.taxAmount),
      subtotal: n2(it.totalPrice),
    };
  });
}

/** The events this sale record actually knows about, oldest first. */
function activities(s: any) {
  const acts: { date: string; action: string; by: string; note: string }[] = [];
  if (s.createdAt) acts.push({ date: s.createdAt, action: `${STATUS_LABEL[s.status] || 'Sale'} created`, by: (s.cashier && s.cashier.name) || '—', note: s.saleNumber || '' });
  for (const p of s.payments || []) {
    acts.push({ date: p.paidOn || p.createdAt, action: `Payment received (${title(p.provider)})`, by: '—', note: `${money(n2(p.amount))}${p.note ? ' · ' + p.note : ''}` });
  }
  for (const r of s.refunds || []) {
    acts.push({ date: r.createdAt, action: 'Sell return', by: '—', note: `${r.refundNumber || ''} · ${money(n2(r.totalRefunded))}${r.reason ? ' · ' + r.reason : ''}` });
  }
  return acts.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function SellDetailsModal({ T, sale, onClose, onSellReturn }:
  { T: Theme; sale: any; onClose: () => void; onSellReturn?: (row: any) => void }) {
  const [data, setData] = useState<any>(null);
  const [biz, setBiz] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    API.sell.get(sale.id).then(setData).catch((e: any) => setErr(e.message || 'Could not load the sale.'));
    API.business.get().then(setBiz).catch(() => {});
  }, [sale.id]);

  const s = data;
  const paymentStatus = s && !['draft', 'quotation', 'proforma'].includes(s.status)
    ? (n2(s.amountDue) <= 0 ? 'paid' : n2(s.amountPaid) > 0 ? 'partial' : 'due')
    : '';

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap', textAlign: 'left' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12, borderBottom: `1px solid ${T.line}` };
  const mono = { fontFamily: T.fMono } as React.CSSProperties;
  const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 4 };
  const r: React.CSSProperties = { textAlign: 'right' };

  const totalsRow = (k: string, v: React.ReactNode, opts: { strong?: boolean; red?: boolean } = {}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 12px', fontSize: opts.strong ? 13.5 : 12.5, fontWeight: opts.strong ? 700 : 500, color: opts.red ? T.redText : opts.strong ? T.ink : T.inkMid, borderTop: opts.strong ? `1px solid ${T.line}` : 'none' }}>
      <span>{k}</span><span style={mono}>{v}</span>
    </div>
  );

  const lines = s ? docLines(s) : [];
  const acts = s ? activities(s) : [];

  return (
    <Modal T={T} title={`Sell Details · ${sale.invoice_no || ''}`}
      subtitle={s ? `${(s.customer && s.customer.name) || 'Walk-In Customer'} · ${(s.location && s.location.name) || ''}` : 'Loading…'}
      width={940} onClose={onClose}
      footer={<>
        <div style={{ flex: 1 }} />
        {s && <Btn T={T} kind="ghost" onClick={() => printPackingSlip(s, biz)}>⎙ Packing Slip</Btn>}
        {s && <Btn T={T} kind="ghost" onClick={() => printInvoice(s, biz)}>⎙ Print Invoice</Btn>}
        {s && onSellReturn && !['draft', 'quotation', 'proforma'].includes(s.status) && (
          <Btn T={T} kind="ghost" onClick={() => onSellReturn(sale)}>↩ Sell Return</Btn>
        )}
        <Btn T={T} kind="accent" onClick={onClose}>Close</Btn>
      </>}>

      {!s && !err && <div style={{ padding: 40, textAlign: 'center', ...mono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>}
      {err && <div style={{ padding: '11px 14px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}

      {s && <>
        {/* Header — identity / customer / shipping / date */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 18, marginBottom: 18, fontSize: 12.5, color: T.inkMid, lineHeight: 1.65 }}>
          <div>
            <div><b style={{ color: T.inkSub }}>Invoice No.:</b> <span style={mono}>{s.saleNumber}</span></div>
            <div><b style={{ color: T.inkSub }}>Status:</b> {STATUS_LABEL[s.status] || title(s.status)}</div>
            <div style={{ marginTop: 2 }}>
              <b style={{ color: T.inkSub }}>Payment Status:</b>{' '}
              {paymentStatus ? <Badge T={T} tone={PAY_TONE[paymentStatus]}>{title(paymentStatus)}</Badge> : '—'}
            </div>
          </div>
          <div>
            <div style={label}>Customer</div>
            <div style={{ fontWeight: 700, color: T.ink }}>{(s.customer && s.customer.name) || 'Walk-In Customer'}</div>
            {s.customer?.address && <div style={{ whiteSpace: 'pre-wrap' }}>{s.customer.address}</div>}
            {s.customer?.phone && <div>Mobile: {s.customer.phone}</div>}
            {s.customer?.email && <div>{s.customer.email}</div>}
          </div>
          <div>
            <div style={label}>Shipping</div>
            {(s.shippingAddress || s.shippingDetails || s.shippingStatus)
              ? <>
                  {s.shippingAddress && <div style={{ whiteSpace: 'pre-wrap' }}>{s.shippingAddress}</div>}
                  {s.shippingDetails && <div>{s.shippingDetails}</div>}
                  {s.shippingStatus && <div><b style={{ color: T.inkSub }}>Status:</b> {title(s.shippingStatus)}</div>}
                  {s.deliveryPerson?.name && <div><b style={{ color: T.inkSub }}>Delivery:</b> {s.deliveryPerson.name}</div>}
                </>
              : <div>—</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div><b style={{ color: T.inkSub }}>Date:</b> {formatDateTime(s.saleDate || s.createdAt)}</div>
            {s.payTerm != null && <div><b style={{ color: T.inkSub }}>Pay term:</b> {s.payTerm} {s.payTermPeriod || 'days'}</div>}
            {s.documentUrl && <a href={s.documentUrl} target="_blank" rel="noreferrer" style={{ color: T.accent.text, fontWeight: 600, textDecoration: 'none' }}>📄 Attached document</a>}
          </div>
        </div>

        {/* Products */}
        <div style={label}>Products</div>
        <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead><tr>
              <th style={{ ...th, width: 30 }}>#</th><th style={th}>Product</th>
              <th style={{ ...th, ...r }}>Quantity</th><th style={{ ...th, ...r }}>Unit Price</th>
              <th style={{ ...th, ...r }}>Discount</th><th style={{ ...th, ...r }}>Tax</th>
              <th style={{ ...th, ...r }}>Price inc. tax</th><th style={{ ...th, ...r }}>Subtotal</th>
            </tr></thead>
            <tbody>
              {lines.map((l: any) => (
                <tr key={l.i}>
                  <td style={{ ...td, color: T.inkMute }}>{l.i}</td>
                  <td style={{ ...td, fontWeight: 600, color: T.ink }}>{l.name}{l.sku ? <span style={{ color: T.inkMute, fontWeight: 400 }}> · {l.sku}</span> : null}</td>
                  <td style={{ ...td, ...mono, ...r }}>{l.qty.toFixed(2)}{l.unit ? ` ${l.unit}` : ''}</td>
                  <td style={{ ...td, ...mono, ...r, color: T.inkSub }}>{money(l.unitPrice)}</td>
                  <td style={{ ...td, ...mono, ...r, color: T.inkSub }}>{money(l.discount)}</td>
                  <td style={{ ...td, ...mono, ...r, color: T.inkSub }}>{money(l.tax)}</td>
                  <td style={{ ...td, ...mono, ...r, color: T.inkSub }}>{money(l.incTax)}</td>
                  <td style={{ ...td, ...mono, ...r, fontWeight: 600, color: T.ink }}>{money(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment info | totals */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={label}>Payment info</div>
            <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...th, width: 26 }}>#</th><th style={th}>Date</th><th style={th}>Account</th>
                  <th style={{ ...th, ...r }}>Amount</th><th style={th}>Mode</th><th style={th}>Note</th>
                </tr></thead>
                <tbody>
                  {(s.payments || []).map((p: any, i: number) => (
                    <tr key={p.id || i}>
                      <td style={{ ...td, color: T.inkMute }}>{i + 1}</td>
                      <td style={{ ...td, ...mono, color: T.inkSub }}>{formatDate(String(p.paidOn || p.createdAt || '').slice(0, 10))}</td>
                      <td style={{ ...td, color: T.inkSub }}>{(p.paymentAccount && p.paymentAccount.name) || '—'}</td>
                      <td style={{ ...td, ...mono, ...r, fontWeight: 600, color: T.ink }}>{money(n2(p.amount))}</td>
                      <td style={{ ...td, color: T.inkSub }}>{title(p.provider)}</td>
                      <td style={{ ...td, color: T.inkSub }}>{p.note || '—'}</td>
                    </tr>
                  ))}
                  {!(s.payments || []).length && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: T.inkMute }}>No payments yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, padding: '8px 0', alignSelf: 'start' }}>
            {totalsRow('Total', money(n2(s.subtotal)))}
            {totalsRow(`Discount (−)${s.discountType === 'pct' && n2(s.discountValue) ? ` ${n2(s.discountValue)}%` : ''}`, money(n2(s.discountAmount)))}
            {totalsRow('Order Tax (+)', money(n2(s.taxAmount)))}
            {totalsRow('Shipping (+)', money(n2(s.shippingCharges)))}
            {n2(s.expensesTotal) > 0 && totalsRow('Additional expenses (+)', money(n2(s.expensesTotal)))}
            {totalsRow('Total Payable', money(n2(s.totalAmount)), { strong: true })}
            {totalsRow('Total paid', money(n2(s.amountPaid)))}
            {totalsRow('Total remaining', money(n2(s.amountDue)), { red: n2(s.amountDue) > 0 })}
          </div>
        </div>

        {/* Notes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={label}>Sell note</div>
            <div style={{ padding: '9px 12px', borderRadius: T.r, background: T.paperAlt, fontSize: 12.5, color: T.inkMid, minHeight: 20, whiteSpace: 'pre-wrap' }}>{s.notes || '—'}</div>
          </div>
          <div>
            <div style={label}>Staff note</div>
            <div style={{ padding: '9px 12px', borderRadius: T.r, background: T.paperAlt, fontSize: 12.5, color: T.inkMid, minHeight: 20, whiteSpace: 'pre-wrap' }}>{s.staffNote || '—'}</div>
          </div>
        </div>

        {/* Activities */}
        <div style={label}>Activities</div>
        <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Date</th><th style={th}>Action</th><th style={th}>By</th><th style={th}>Note</th></tr></thead>
            <tbody>
              {acts.map((a, i) => (
                <tr key={i}>
                  <td style={{ ...td, ...mono, color: T.inkSub, whiteSpace: 'nowrap' }}>{formatDateTime(a.date)}</td>
                  <td style={{ ...td, fontWeight: 600, color: T.ink }}>{a.action}</td>
                  <td style={{ ...td, color: T.inkSub }}>{a.by}</td>
                  <td style={{ ...td, color: T.inkSub }}>{a.note || '—'}</td>
                </tr>
              ))}
              {!acts.length && <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: T.inkMute }}>No records found</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </Modal>
  );
}

// ── Printable documents ──────────────────────────────────────────────────────
const esc = (v: any) => String(v == null ? '' : v).replace(/[&<>]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]));

function docTitle(s: any) {
  // A document that never posted must not print as an invoice.
  return ({ quotation: 'Quotation', proforma: 'Proforma Invoice', draft: 'Draft' } as any)[s.status] || 'Invoice';
}

function bizHeader(biz: any) {
  const b = biz || {};
  return `<div class="biz">
    <div class="biz-name">${esc(b.name || '')}</div>
    ${b.address ? `<div>${esc(b.address)}</div>` : ''}
    ${b.phone ? `<div>${esc(b.phone)}</div>` : ''}
    ${b.taxNumber ? `<div>Tax No: ${esc(b.taxNumber)}</div>` : ''}
  </div>`;
}

function openDoc(titleText: string, body: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titleText)}</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;margin:30px;font-size:13px}
    .top{display:flex;justify-content:space-between;gap:24px;margin-bottom:6px}
    .biz-name{font-size:18px;font-weight:700}
    .doc{text-align:right}.doc h1{font-size:20px;margin:0 0 4px;font-weight:600}
    .meta{display:flex;justify-content:space-between;gap:24px;margin:14px 0 18px}
    .meta b{display:block;margin-bottom:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
    th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
    .r{text-align:right;font-variant-numeric:tabular-nums}
    .totals{width:320px;margin-left:auto}.totals td{border:none;padding:3px 8px}
    .grand{font-weight:700;border-top:1px solid #999 !important}
    .sign{margin-top:70px;font-weight:600}
    @media print{button{display:none}}
  </style></head><body>${body}
  <script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=920,height=720');
  if (w) { w.document.write(html); w.document.close(); }
}

/** Full priced document. Prints as Quotation/Proforma when that is what it is. */
export function printInvoice(s: any, biz: any) {
  const lines = docLines(s);
  const rows = lines.map((l: any) => `<tr>
    <td>${l.i}</td><td>${esc(l.name)}${l.sku ? ` <span style="color:#888">· ${esc(l.sku)}</span>` : ''}</td>
    <td class="r">${l.qty.toFixed(2)}${l.unit ? ' ' + esc(l.unit) : ''}</td>
    <td class="r">${money(l.unitPrice)}</td><td class="r">${money(l.discount)}</td>
    <td class="r">${money(l.tax)}</td><td class="r">${money(l.subtotal)}</td>
  </tr>`).join('');
  const pays = (s.payments || []).length
    ? (s.payments || []).map((p: any, i: number) => `<tr><td>${i + 1}</td><td>${esc(formatDate(String(p.paidOn || p.createdAt || '').slice(0, 10)))}</td><td>${esc(title(p.provider))}</td><td>${esc((p.paymentAccount && p.paymentAccount.name) || '')}</td><td class="r">${money(n2(p.amount))}</td></tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#888">No payments recorded</td></tr>';
  const trow = (k: string, v: number, always = false) => (always || v !== 0) ? `<tr><td>${k}</td><td class="r">${money(v)}</td></tr>` : '';
  openDoc(`${docTitle(s)} ${s.saleNumber || ''}`, `
    <div class="top">${bizHeader(biz)}
      <div class="doc"><h1>${docTitle(s)}</h1>
        <div><b>No.</b> ${esc(s.saleNumber || '')}</div>
        <div><b>Date</b> ${esc(formatDateTime(s.saleDate || s.createdAt))}</div>
      </div>
    </div>
    <div class="meta">
      <div><b>Customer</b>${esc((s.customer && s.customer.name) || 'Walk-In Customer')}<br>${esc(s.customer?.address || '')}<br>${s.customer?.phone ? 'Mobile: ' + esc(s.customer.phone) : ''}</div>
      <div><b>Shipping Address</b>${esc(s.shippingAddress || '—')}</div>
      <div style="text-align:right"><b>Location</b>${esc((s.location && s.location.name) || '')}</div>
    </div>
    <table><thead><tr><th>#</th><th>Product</th><th class="r">Quantity</th><th class="r">Unit Price</th><th class="r">Discount</th><th class="r">Tax</th><th class="r">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="totals">
      ${trow('Total', n2(s.subtotal), true)}
      ${trow('Discount (−)', n2(s.discountAmount))}
      ${trow('Order Tax (+)', n2(s.taxAmount))}
      ${trow('Shipping (+)', n2(s.shippingCharges))}
      ${trow('Additional expenses (+)', n2(s.expensesTotal))}
      <tr class="grand"><td>Total Payable</td><td class="r">${money(n2(s.totalAmount))}</td></tr>
      ${trow('Total paid', n2(s.amountPaid), true)}
      ${trow('Total remaining', n2(s.amountDue), true)}
    </table>
    <b>Payment info</b>
    <table><thead><tr><th>#</th><th>Date</th><th>Mode</th><th>Account</th><th class="r">Amount</th></tr></thead><tbody>${pays}</tbody></table>
    ${s.notes ? `<p><b>Note:</b> ${esc(s.notes)}</p>` : ''}
    <div class="sign">Authorized Signatory</div>`);
}

/** Goods-only document for the warehouse: no prices anywhere on it. */
export function printPackingSlip(s: any, biz: any) {
  const rows = docLines(s).map((l: any) => `<tr>
    <td>${l.i}</td><td>${esc(l.name)}${l.sku ? `, ${esc(l.sku)}` : ''}</td>
    <td class="r">${l.qty.toFixed(2)}${l.unit ? ' ' + esc(l.unit) : ''}</td>
  </tr>`).join('');
  openDoc(`Packing Slip ${s.saleNumber || ''}`, `
    <div class="top">${bizHeader(biz)}
      <div class="doc"><h1>Packing Slip</h1>
        <div><b>Invoice No.</b> ${esc(s.saleNumber || '')}</div>
        <div><b>Date</b> ${esc(formatDateTime(s.saleDate || s.createdAt))}</div>
      </div>
    </div>
    <div class="meta">
      <div><b>Customer</b>${esc((s.customer && s.customer.name) || 'Walk-In Customer')}<br>${esc(s.customer?.address || '')}<br>${s.customer?.phone ? 'Mobile: ' + esc(s.customer.phone) : ''}</div>
      <div><b>Shipping Address</b>${esc(s.shippingAddress || '—')}${s.deliveredTo ? '<br>Delivered to: ' + esc(s.deliveredTo) : ''}</div>
    </div>
    <table><thead><tr><th style="width:36px">#</th><th>Product</th><th class="r" style="width:140px">Quantity</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="sign">Authorized Signatory</div>`);
}
