'use client';
// ─────────────────────────────────────────────────────────────────
// Edit Shipping — logistics only. This dialog cannot touch money,
// stock or the ledger, which is why it is allowed on any sale:
// posted, draft or refunded.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Modal, Field, TextField, SelectField } from '@/components/kit';
import { API } from '@/lib/api';

const { useState, useEffect, useRef } = React;

const SHIP_STATUSES = ['', 'pending', 'packed', 'shipped', 'delivered', 'cancelled'];
const title = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : 'Please Select');

export function EditShippingModal({ T, sale, onClose, onSaved }:
  { T: Theme; sale: any; onClose: () => void; onSaved: (msg: string) => void }) {
  const raw = sale._real || {};
  const [details, setDetails] = useState(raw.shippingDetails || '');
  const [address, setAddress] = useState(raw.shippingAddress || '');
  const [status, setStatus] = useState(raw.shippingStatus || '');
  const [deliveredTo, setDeliveredTo] = useState(raw.deliveredTo || '');
  const [personId, setPersonId] = useState(raw.deliveryPersonId || '');
  const [note, setNote] = useState(raw.shippingNote || '');
  const [doc, setDoc] = useState<any>(raw.shippingDocumentUrl ? { url: raw.shippingDocumentUrl, key: raw.shippingDocumentKey, name: 'Attached document' } : null);
  const [docBusy, setDocBusy] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<any>(null);

  useEffect(() => { API.user.list().then(setUsers).catch(() => {}); }, []);

  async function onPickDoc(e: any) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setDocBusy(true); setErr(null);
    try { const r = await API.upload.file(file); setDoc({ url: r.url, key: r.key, name: file.name }); }
    catch (ex: any) { setErr(ex.message || 'Could not upload the document.'); }
    finally { setDocBusy(false); }
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      await API.sell.updateShipping(sale.id, {
        shipping_details: details, shipping_address: address, shipping_status: status,
        shipping_note: note, delivered_to: deliveredTo, delivery_person_id: personId || null,
        shipping_document_url: doc?.url, shipping_document_key: doc?.key,
      });
      onSaved(`Shipping updated · ${sale.invoice_no}`);
    } catch (e: any) { setErr(e.message || 'Could not update shipping.'); setBusy(false); }
  }

  const ta: React.CSSProperties = { width: '100%', padding: 10, fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' };

  return (
    <Modal T={T} title={`Edit Shipping · ${sale.invoice_no}`} subtitle={sale.customer_name} width={640} onClose={onClose}
      footer={<>
        <div style={{ flex: 1, fontSize: 11.5, color: T.inkMute }}>Logistics only — money, stock and the ledger are untouched.</div>
        <Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Updating…' : 'Update'}</Btn>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field T={T} label="Shipping Details">
          <textarea value={details} onChange={(e: any) => setDetails(e.target.value)} rows={3} placeholder="Shipping Details" style={ta} />
        </Field>
        <Field T={T} label="Shipping Address">
          <textarea value={address} onChange={(e: any) => setAddress(e.target.value)} rows={3} placeholder="Shipping Address" style={ta} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 14, marginTop: 14 }}>
        <Field T={T} label="Shipping Status">
          <SelectField T={T} value={status} options={SHIP_STATUSES} onChange={setStatus} render={(v: any) => title(v)} />
        </Field>
        <Field T={T} label="Delivered To"><TextField T={T} value={deliveredTo} onChange={setDeliveredTo} placeholder="Delivered To" /></Field>
        <Field T={T} label="Delivery Person">
          <SelectField T={T} value={personId} options={['', ...users.map((u: any) => String(u.id))]} onChange={setPersonId}
            render={(v: any) => (v ? (users.find((u: any) => String(u.id) === v) || {}).name : 'Please Select')} />
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field T={T} label="Shipping note">
          <textarea value={note} onChange={(e: any) => setNote(e.target.value)} rows={3} placeholder="Shipping note" style={ta} />
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field T={T} label="Shipping Documents">
          <div>
            <input ref={fileRef} type="file" accept=".pdf,.csv,.zip,.doc,.docx,.jpeg,.jpg,.png" style={{ display: 'none' }} onChange={onPickDoc} />
            {!doc ? (
              <button onClick={() => fileRef.current && fileRef.current.click()} disabled={docBusy}
                style={{ width: '100%', padding: '26px 12px', fontSize: 12.5, color: T.inkMute, background: T.paper, border: `1.5px dashed ${T.line}`, borderRadius: T.r, cursor: docBusy ? 'wait' : 'pointer', fontFamily: T.fBody }}>
                {docBusy ? 'Uploading…' : 'Click to upload a document'}
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 12.5, background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r }}>
                <span>📄</span>
                <a href={doc.url} target="_blank" rel="noreferrer" style={{ flex: 1, color: T.accent.text, fontWeight: 600, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</a>
                <button onClick={() => setDoc(null)} title="Remove" style={{ border: 'none', background: 'none', color: T.redText, cursor: 'pointer' }}>✕</button>
              </div>
            )}
          </div>
        </Field>
      </div>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}
