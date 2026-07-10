'use client';
import React from 'react';
import { money } from '@/lib/theme';
import { Btn, Badge, Modal } from '@/components/kit';
import { API } from '@/lib/api';
import { Row } from './bits';

const { useState: useStatePu, useEffect: useEffectPu } = React;

// ── Purchase detail ─────────────────────────────────────────────────
export function PurchaseView({ T, purchase, onClose, onEdit }: { T: any; purchase: any; onClose: () => void; onEdit?: (p: any) => void }) {
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

      {/* Purchase returns */}
      {Array.isArray(p.returns) && p.returns.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 } as React.CSSProperties}>Returns</div>
          <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead><tr>
                <th style={th}>Date</th><th style={th}>Return #</th><th style={th}>Reference</th><th style={th}>Items</th><th style={{ ...th, textAlign: 'right' }}>Amount</th>
              </tr></thead>
              <tbody>
                {p.returns.map((r: any, i: number) => (
                  <tr key={r.id || i}>
                    <td style={{ ...td, ...mono, color: T.inkMid }}>{r.date || '—'}</td>
                    <td style={{ ...td, ...mono, color: T.inkSub }}>{r.number || '—'}</td>
                    <td style={{ ...td, color: T.inkSub }}>{r.reference || '—'}</td>
                    <td style={{ ...td, color: T.inkSub }}>{(r.items || []).reduce((s: number, it: any) => s + Number(it.quantity || 0), 0)}</td>
                    <td style={{ ...td, ...mono, textAlign: 'right', fontWeight: 600, color: T.redText }}>−{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

// Print a purchase — opens a clean, self-contained page and triggers the browser print dialog.
export function printPurchase(p: any) {
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
