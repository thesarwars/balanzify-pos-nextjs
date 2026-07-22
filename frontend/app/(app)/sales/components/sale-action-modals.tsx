'use client';
// ─────────────────────────────────────────────────────────────────
// Row-action dialogs for a sale: View Payments, Invoice URL, and
// Send Notification (email).
//
// Notification {tags} are substituted on the SERVER from the sale
// row itself, so the message can never claim amounts the record
// does not hold. The tag list below shows only tags the server
// actually fills — no advertised-but-dead placeholders.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Badge, Modal, Field, TextField } from '@/components/kit';
import { money } from '@/lib/theme';
import { formatDate, formatDateTime, toLocalYmd } from '@/lib/business-settings';
import { API } from '@/lib/api';
import { getSetting } from '@/lib/business-settings';

const { useState, useEffect } = React;

const title = (s: any) => (s ? String(s)[0].toUpperCase() + String(s).slice(1).replace(/_/g, ' ') : '');
const n2 = (v: any) => Number(v) || 0;
const NON_POSTING = ['draft', 'quotation', 'proforma'];

// A non-posting document owes nothing (amountDue = 0) yet was never paid, so it
// has NO payment status — deriving one from the money alone would call it "Paid".
function payState(s: any): '' | 'paid' | 'partial' | 'due' {
  if (NON_POSTING.includes(s.status)) return '';
  return n2(s.amountDue) <= 0 ? 'paid' : n2(s.amountPaid) > 0 ? 'partial' : 'due';
}

// ── View Payments ────────────────────────────────────────────────────────────
export function ViewPaymentsModal({ T, sale, onClose, onNotify }:
  { T: Theme; sale: any; onClose: () => void; onNotify: (template: 'payment') => void }) {
  const [s, setS] = useState<any>(null);
  const [biz, setBiz] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    API.sell.get(sale.id).then(setS).catch((e: any) => setErr(e.message || 'Could not load the sale.'));
    API.business.get().then(setBiz).catch(() => {});
  }, [sale.id]);

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap', textAlign: 'left' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12, borderBottom: `1px solid ${T.line}` };
  const mono = { fontFamily: T.fMono } as React.CSSProperties;
  const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 4 };

  function printPayments() {
    if (!s) return;
    const esc = (v: any) => String(v == null ? '' : v).replace(/[&<>]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]));
    // Format the LOCAL calendar day, matching the on-screen table. Slicing the
    // raw ISO string would print the UTC day and disagree with the screen by one.
    const payDay = (p: any) => { const d = p.paidOn || p.createdAt; return d ? formatDate(toLocalYmd(new Date(d))) : ''; };
    const rows = (s.payments || []).map((p: any, i: number) =>
      `<tr><td>${i + 1}</td><td>${esc(payDay(p))}</td><td>${esc(p.providerReference || '')}</td><td class="r">${money(n2(p.amount))}</td><td>${esc(title(p.provider))}</td><td>${esc((p.paymentAccount && p.paymentAccount.name) || '')}</td><td>${esc(p.note || '')}</td></tr>`).join('')
      || '<tr><td colspan="7" style="text-align:center;color:#888">No payments recorded</td></tr>';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payments ${esc(s.saleNumber)}</title>
    <style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#222;margin:30px;font-size:13px}
    h1{font-size:18px;margin:0 0 4px} .sub{color:#666;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
    th{background:#f3f4f6;font-size:11px;text-transform:uppercase}.r{text-align:right;font-variant-numeric:tabular-nums}</style></head><body>
    <h1>Payments — ${esc(s.saleNumber)}</h1>
    <div class="sub">${esc((s.customer && s.customer.name) || 'Walk-In Customer')} · Total ${money(n2(s.totalAmount))} · Paid ${money(n2(s.amountPaid))} · Due ${money(n2(s.amountDue))}</div>
    <table><thead><tr><th>#</th><th>Date</th><th>Reference No</th><th class="r">Amount</th><th>Payment Method</th><th>Payment Account</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>
    <script>window.onload=function(){setTimeout(function(){window.print()},200)}</script></body></html>`;
    const w = window.open('', '_blank', 'width=920,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <Modal T={T} title={`View Payments · ${sale.invoice_no}`} subtitle={sale.customer_name} width={780} onClose={onClose}
      footer={<>
        <div style={{ flex: 1 }} />
        {s && <Btn T={T} kind="ghost" onClick={() => onNotify('payment')}>✉ Send Payment Received Notification</Btn>}
        {s && <Btn T={T} kind="ghost" onClick={printPayments}>⎙ Print</Btn>}
        <Btn T={T} kind="accent" onClick={onClose}>Close</Btn>
      </>}>
      {!s && !err && <div style={{ padding: 36, textAlign: 'center', ...mono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>}
      {err && <div style={{ padding: '11px 14px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
      {s && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 16, marginBottom: 16, fontSize: 12.5, color: T.inkMid, lineHeight: 1.6 }}>
          <div>
            <div style={label}>Customer</div>
            <div style={{ fontWeight: 700, color: T.ink }}>{(s.customer && s.customer.name) || 'Walk-In Customer'}</div>
            {s.customer?.address && <div style={{ whiteSpace: 'pre-wrap' }}>{s.customer.address}</div>}
            {s.customer?.phone && <div>Mobile: {s.customer.phone}</div>}
          </div>
          <div>
            <div style={label}>Business</div>
            <div style={{ fontWeight: 700, color: T.ink }}>{(biz && biz.name) || '—'}</div>
            {biz?.address && <div style={{ whiteSpace: 'pre-wrap' }}>{biz.address}</div>}
            {biz?.taxNumber && <div>Tax No: {biz.taxNumber}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div><b style={{ color: T.inkSub }}>Invoice No.:</b> <span style={mono}>{s.saleNumber}</span></div>
            <div><b style={{ color: T.inkSub }}>Date:</b> {s.saleDate || s.createdAt ? formatDate(toLocalYmd(new Date(s.saleDate || s.createdAt))) : ''}</div>
            <div><b style={{ color: T.inkSub }}>Payment Status:</b>{' '}
              {payState(s)
                ? <Badge T={T} tone={({ paid: 'green', partial: 'amber', due: 'red' } as any)[payState(s)]}>{title(payState(s))}</Badge>
                : <span style={{ color: T.inkMute }}>{title(s.status)}</span>}
            </div>
          </div>
        </div>

        <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr>
              <th style={th}>Date</th><th style={th}>Reference No</th><th style={{ ...th, textAlign: 'right' }}>Amount</th>
              <th style={th}>Payment Method</th><th style={th}>Payment Note</th><th style={th}>Payment Account</th>
            </tr></thead>
            <tbody>
              {(s.payments || []).map((p: any, i: number) => (
                <tr key={p.id || i}>
                  <td style={{ ...td, ...mono, color: T.inkSub, whiteSpace: 'nowrap' }}>{formatDateTime(p.paidOn || p.createdAt)}</td>
                  <td style={{ ...td, ...mono, color: T.inkSub }}>{p.providerReference || '—'}</td>
                  <td style={{ ...td, ...mono, textAlign: 'right', fontWeight: 600, color: T.ink }}>{money(n2(p.amount))}</td>
                  <td style={{ ...td, color: T.inkSub }}>{title(p.provider)}</td>
                  <td style={{ ...td, color: T.inkSub }}>{p.note || '—'}</td>
                  <td style={{ ...td, color: T.inkSub }}>{(p.paymentAccount && p.paymentAccount.name) || '—'}</td>
                </tr>
              ))}
              {!(s.payments || []).length && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: T.inkMute }}>No payments recorded</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: T.inkMute, lineHeight: 1.5 }}>
          Payments here are on the books — each one posted to the ledger when it was taken, so they can be viewed and printed but not edited or deleted from this screen.
        </div>
      </>}
    </Modal>
  );
}

// ── Invoice URL ──────────────────────────────────────────────────────────────
export function InvoiceUrlModal({ T, sale, onClose }: { T: Theme; sale: any; onClose: () => void }) {
  const url = API.sell.publicInvoiceUrl(sale.receipt_token || '');
  const [copied, setCopied] = useState(false);
  return (
    <Modal T={T} title={`Invoice URL · ${sale.invoice_no}`} width={560} onClose={onClose}
      footer={<>
        <div style={{ flex: 1 }} />
        <Btn T={T} kind="ghost" onClick={onClose}>Close</Btn>
        {url && <Btn T={T} kind="accent" onClick={() => window.open(url, '_blank')}>View</Btn>}
      </>}>
      {url ? (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={url} onFocus={(e: any) => e.target.select()}
              style={{ flex: 1, padding: '10px 13px', fontSize: 12.5, fontFamily: T.fMono, color: T.ink, background: T.paperAlt, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none' }} />
            <Btn T={T} kind="ghost" onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }}>
              {copied ? '✓ Copied' : 'Copy'}
            </Btn>
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: T.inkMute }}>Link to view the invoice without login. Anyone holding the link can open it.</div>
        </>
      ) : (
        <div style={{ padding: '12px 14px', borderRadius: T.r, background: T.amberSoft, color: T.amberText, fontSize: 12.5, lineHeight: 1.55 }}>
          This sale has no public link token yet. Newly created sales get one automatically.
        </div>
      )}
    </Modal>
  );
}

// ── Send Notification ────────────────────────────────────────────────────────
// Only tags the server actually substitutes are advertised.
const TAGS = ['business_name', 'invoice_number', 'invoice_url', 'total_amount', 'paid_amount', 'received_amount', 'due_amount', 'contact_name', 'location_name', 'location_address', 'sale_date'];

// Stored templates (Notification Templates screen) override the built-ins.
const storedTpl = (key: string) => (getSetting('notification_templates', {}) as any)?.[key] || null;
const TEMPLATES = {
  sale: {
    subject: 'Thank you from {business_name}',
    body: 'Dear {contact_name},\n\nYour invoice number is {invoice_number}\nTotal amount: {total_amount}\nPaid amount: {received_amount}\n\nView it here: {invoice_url}\n\nThank you for shopping with us.',
  },
  payment: {
    subject: 'Payment received — {invoice_number}',
    body: 'Dear {contact_name},\n\nWe have received a payment against invoice {invoice_number}.\nPaid so far: {paid_amount}\nBalance due: {due_amount}\n\nThank you.',
  },
};

export function SendNotificationModal({ T, sale, template = 'sale', onClose, onSent }:
  { T: Theme; sale: any; template?: 'sale' | 'payment'; onClose: () => void; onSent: (msg: string) => void }) {
  const tpl = TEMPLATES[template];
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Prefill the recipient with the customer's email, when they have one.
  useEffect(() => {
    API.sell.get(sale.id).then((s: any) => { if (s?.customer?.email) setTo((v) => v || s.customer.email); }).catch(() => {});
  }, [sale.id]);

  async function send() {
    if (!to.trim()) { setErr('A recipient email is required.'); return; }
    setBusy(true); setErr(null);
    try {
      await API.sell.notify(sale.id, { to: to.trim(), cc: cc.trim() || undefined, bcc: bcc.trim() || undefined, subject, body });
      onSent(`Notification sent to ${to.trim()}`);
    } catch (e: any) { setErr(e.message || 'Could not send the email.'); setBusy(false); }
  }

  const ta: React.CSSProperties = { width: '100%', padding: 10, fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' };

  return (
    <Modal T={T} title={template === 'payment' ? `Send Notification — Payment Received · ${sale.invoice_no}` : `Send Notification — New Sale · ${sale.invoice_no}`}
      subtitle={sale.customer_name} width={640} onClose={onClose}
      footer={<>
        <div style={{ flex: 1 }} />
        <Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn T={T} kind="accent" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send Email'}</Btn>
      </>}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 6 }}>Available tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TAGS.map((t) => (
            <code key={t} onClick={() => setBody((b) => b + `{${t}}`)} title="Click to append to the body"
              style={{ padding: '3px 8px', fontSize: 11, fontFamily: T.fMono, background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: 6, color: T.inkMid, cursor: 'pointer' }}>
              {'{'}{t}{'}'}
            </code>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: T.inkMute }}>Tags are filled in on the server from this sale's own record.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field T={T} label="To *" full><TextField T={T} type="email" value={to} onChange={setTo} placeholder="customer@example.com" /></Field>
        <Field T={T} label="CC"><TextField T={T} type="email" value={cc} onChange={setCc} placeholder="CC" /></Field>
        <Field T={T} label="BCC"><TextField T={T} type="email" value={bcc} onChange={setBcc} placeholder="BCC" /></Field>
        <Field T={T} label="Email Subject" full><TextField T={T} value={subject} onChange={setSubject} /></Field>
        <Field T={T} label="Email Body" full>
          <textarea value={body} onChange={(e: any) => setBody(e.target.value)} rows={8} style={ta} />
        </Field>
      </div>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}
