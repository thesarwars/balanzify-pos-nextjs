'use client';
import React from 'react';
import { money } from '@/lib/theme';
import { todayLocal } from '@/lib/business-settings';
import { Btn, Modal, Field, TextField } from '@/components/kit';
import { API } from '@/lib/api';
import { miniNum } from './bits';

const { useState: useStatePu } = React;

// ── Purchase return ─────────────────────────────────────────────────
// Return received goods to the supplier. Per line you can return up to
// (received − already returned); the backend also caps at what's still in
// stock from this purchase and reverses stock, cost, supplier balance and GL.
export function PurchaseReturnModal({ T, purchase, onClose, onSaved }: { T: any; purchase: any; onClose: () => void; onSaved: () => void }) {
  const p = purchase;
  const remainingOf = (l: any) => Number(l.received_qty || 0) - Number(l.returned_qty || 0);
  const returnable = (p.lines || []).filter((l: any) => remainingOf(l) > 0);
  const [reference, setReference] = useStatePu('');
  const [date, setDate] = useStatePu(todayLocal());
  const [doc, setDoc] = useStatePu<any>(null);        // { url, key, name }
  const [docBusy, setDocBusy] = useStatePu(false);
  const docRef = React.useRef<any>(null);
  const [qtys, setQtys] = useStatePu<any>({});
  const [busy, setBusy] = useStatePu(false);
  const [err, setErr] = useStatePu<any>(null);
  const setQ = (id: any, v: any) => setQtys((m: any) => ({ ...m, [id]: v }));
  const lineTotal = (l: any) => (Number(qtys[l.id]) || 0) * Number(l.unit_cost || 0);
  const total = returnable.reduce((s: any, l: any) => s + lineTotal(l), 0);

  async function save() {
    const items = returnable.filter((l: any) => Number(qtys[l.id]) > 0).map((l: any) => ({ po_item_id: l.id, quantity: Number(qtys[l.id]) }));
    if (!items.length) { setErr('Enter a return quantity for at least one line.'); return; }
    for (const l of returnable) { const q = Number(qtys[l.id]) || 0; if (q > remainingOf(l)) { setErr(`Return qty for "${l.product_name}" exceeds the ${remainingOf(l)} returnable.`); return; } }
    setBusy(true); setErr(null);
    try {
      await API.purchaseOrder.createReturn(p.id, {
        reference: reference.trim() || undefined,
        return_date: date || undefined,
        document_url: (doc && doc.url) || undefined, document_key: (doc && doc.key) || undefined,
        items,
      });
      onSaved();
    }
    catch (e: any) { setErr(e.message || 'Could not record the return.'); setBusy(false); }
  }

  async function onPickDoc(e: any) {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    setDocBusy(true); setErr(null);
    try { const r = await API.upload.file(file); setDoc({ url: r.url, key: r.key, name: file.name }); }
    catch (ex: any) { setErr(ex.message || 'Could not upload the document.'); }
    finally { setDocBusy(false); }
  }
  function onRemoveDoc() { const key = doc && doc.key; setDoc(null); if (key) API.upload.remove(key).catch(() => {}); }

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12, borderBottom: `1px solid ${T.line}` };
  const mono = { fontFamily: T.fMono } as React.CSSProperties;

  return (
    <Modal T={T} title="Purchase return" subtitle={p.ref_no} width={760} onClose={onClose}
      footer={<>
        <div style={{ flex: 1, fontSize: 13.5, color: T.inkSub }}>Est. return total <b style={{ color: T.ink, fontFamily: T.fMono, marginLeft: 6, fontSize: 15 }}>{money(total)}</b></div>
        <Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save return'}</Btn>
      </>}>
      <div style={{ fontSize: 12.5, color: T.inkMid, marginBottom: 12, lineHeight: 1.6 }}>
        <b style={{ color: T.inkSub }}>Parent purchase:</b> {p.ref_no} · {p.supplier_name}{p.location_name && p.location_name !== '—' ? ' · ' + p.location_name : ''} · {p.date}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field T={T} label="Reference No"><TextField T={T} value={reference} onChange={setReference} placeholder="Optional — e.g. DN-2026-001" /></Field>
        <Field T={T} label="Date"><TextField T={T} type="date" value={date} onChange={setDate} /></Field>
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input ref={docRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.csv,.zip" style={{ display: 'none' }} onChange={onPickDoc} />
        {!doc ? (
          <button onClick={() => docRef.current && docRef.current.click()} disabled={docBusy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: T.fBody, color: T.inkMid, background: T.paper, border: `1px dashed ${T.line}`, borderRadius: T.r, cursor: docBusy ? 'wait' : 'pointer' }}>
            📎 {docBusy ? 'Uploading…' : 'Attach document'}
          </button>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12.5, background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r }}>
            <span>📄</span>
            <a href={doc.url} target="_blank" rel="noreferrer" style={{ color: T.accent.text, fontWeight: 600, textDecoration: 'none', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name || 'Document'}</a>
            <button onClick={onRemoveDoc} title="Remove" style={{ border: 'none', background: 'none', color: T.redText, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>✕</button>
          </div>
        )}
        <span style={{ fontSize: 11, color: T.inkMute }}>Debit note or credit memo (pdf, image, doc)</span>
      </div>
      <div style={{ marginTop: 14, border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto' }}>
        {returnable.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left', width: 26 }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Product</th>
              <th style={{ ...th, textAlign: 'right' }}>Unit cost</th>
              <th style={{ ...th, textAlign: 'right' }}>Received</th>
              <th style={{ ...th, textAlign: 'right' }}>Returnable</th>
              <th style={{ ...th, textAlign: 'right', width: 110 }}>Return qty</th>
              <th style={{ ...th, textAlign: 'right' }}>Subtotal</th>
            </tr></thead>
            <tbody>
              {returnable.map((l: any, i: number) => (
                <tr key={l.id}>
                  <td style={{ ...td, color: T.inkMute }}>{i + 1}</td>
                  <td style={{ ...td, whiteSpace: 'normal', fontWeight: 600, color: T.ink }}>{l.product_name}{l.sku ? <span style={{ color: T.inkMute, fontWeight: 400 }}> · {l.sku}</span> : null}</td>
                  <td style={{ ...td, ...mono, textAlign: 'right', color: T.inkSub }}>{money(l.unit_cost)}</td>
                  <td style={{ ...td, ...mono, textAlign: 'right', color: T.inkSub }}>{l.received_qty}{l.unit_name ? ` ${l.unit_name}` : ''}</td>
                  <td style={{ ...td, ...mono, textAlign: 'right', color: T.inkMid }}>{remainingOf(l)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <input type="number" min={0} max={remainingOf(l)} value={qtys[l.id] || ''} onChange={(e: any) => setQ(l.id, e.target.value)} placeholder="0" style={{ ...miniNum(T), width: 96 }} />
                  </td>
                  <td style={{ ...td, ...mono, textAlign: 'right', color: T.ink, fontWeight: 600 }}>{money(lineTotal(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div style={{ padding: 22, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>Nothing on this purchase is available to return.</div>}
      </div>
      <div style={{ fontSize: 11, color: T.inkMute, marginTop: 10, lineHeight: 1.5 }}>The estimate uses the supplier price; the recorded amount is the actual landed cost the goods were received at. You can only return units still in stock from this purchase — if some were already sold, the return is capped to what remains and the rest is declined.</div>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}
