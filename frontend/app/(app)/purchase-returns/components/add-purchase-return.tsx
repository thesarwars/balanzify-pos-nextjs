'use client';
// ─────────────────────────────────────────────────────────────────
// Add Purchase Return — a standalone debit note.
//
// You pick a supplier and a location, then search the products they
// delivered there. Behind the scenes each returned unit is still charged
// back to the purchase LINE it arrived on (oldest first), because that
// line's cost layer is what says the goods cost — so one return can span
// several purchases. The server does that allocation and the reversal.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Modal, Field, TextField, SelectField } from '@/components/kit';
import { money } from '@/lib/theme';
import { todayLocal } from '@/lib/business-settings';
import { API } from '@/lib/api';
import { miniNum } from '../../purchase-orders/components/bits';

const { useState, useEffect, useRef, useMemo, useCallback } = React;

type Line = { product_id: string; name: string; sku: string; returnable: number; unit_cost: number; quantity: string };

export function AddPurchaseReturnModal({ T, suppliers, locations, onClose, onSaved }:
  { T: any; suppliers: any[]; locations: any[]; onClose: () => void; onSaved: () => void }) {
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [doc, setDoc] = useState<any>(null);          // { url, key, name }
  const [docBusy, setDocBusy] = useState(false);
  const docRef = useRef<any>(null);

  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  const [taxes, setTaxes] = useState<any[]>([]);
  const [taxId, setTaxId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = !!supplierId && !!locationId;

  // Rates a purchase may pick, plus tax groups (a group is one rate whose
  // percentage is the sum of its components), so both are one `tax_rate_id`.
  useEffect(() => {
    Promise.all([API.taxRate.list().catch(() => []), API.taxRate.groups().catch(() => [])])
      .then(([rates, groups]: any[]) => setTaxes([...(rates || []), ...(groups || [])]));
  }, []);

  // Changing who/where invalidates every line: the cap and the cost basis are
  // both properties of this supplier's stock at this location.
  useEffect(() => { setLines([]); setResults([]); setQuery(''); }, [supplierId, locationId]);

  // Debounced product search against what is still returnable.
  useEffect(() => {
    if (!ready || !open) return;
    let dead = false;
    setSearching(true);
    const t = setTimeout(() => {
      API.purchaseReturn.returnable({ supplier_id: supplierId, location_id: locationId, search: query.trim() || undefined })
        .then((ps: any[]) => { if (!dead) setResults(ps || []); })
        .catch(() => { if (!dead) setResults([]); })
        .finally(() => { if (!dead) setSearching(false); });
    }, 250);
    return () => { dead = true; clearTimeout(t); };
  }, [ready, open, query, supplierId, locationId]);

  const chosen = useMemo(() => new Set(lines.map((l) => l.product_id)), [lines]);
  const shown = results.filter((p) => !chosen.has(p.product_id)).slice(0, 25);

  const addLine = useCallback((p: any) => {
    setLines((ls) => (ls.some((l) => l.product_id === p.product_id) ? ls : [...ls, {
      product_id: p.product_id, name: p.name, sku: p.sku || '',
      returnable: Number(p.returnable || 0), unit_cost: Number(p.unit_cost || 0), quantity: '1',
    }]));
    setQuery(''); setOpen(false);
  }, []);

  const setQty = (id: string, v: string) => setLines((ls) => ls.map((l) => (l.product_id === id ? { ...l, quantity: v } : l)));
  const dropLine = (id: string) => setLines((ls) => ls.filter((l) => l.product_id !== id));

  const lineTotal = (l: Line) => (Number(l.quantity) || 0) * l.unit_cost;
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const taxPct = Number((taxes.find((t: any) => String(t.id) === taxId) || {}).amount || 0);
  const taxAmount = subtotal * (taxPct / 100);
  const total = subtotal + taxAmount;

  async function onPickDoc(e: any) {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    setDocBusy(true); setErr(null);
    try { const r = await API.upload.file(file); setDoc({ url: r.url, key: r.key, name: file.name }); }
    catch (ex: any) { setErr(ex.message || 'Could not upload the document.'); }
    finally { setDocBusy(false); }
  }
  function onRemoveDoc() { const key = doc && doc.key; setDoc(null); if (key) API.upload.remove(key).catch(() => {}); }

  async function save() {
    if (!supplierId) { setErr('Choose the supplier the goods go back to.'); return; }
    if (!locationId) { setErr('Choose the location the goods leave.'); return; }
    if (!date) { setErr('A return date is required.'); return; }
    const items = lines.filter((l) => Number(l.quantity) > 0).map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) }));
    if (!items.length) { setErr('Add at least one product with a quantity.'); return; }
    for (const l of lines) {
      const q = Number(l.quantity) || 0;
      if (q > l.returnable) { setErr(`Only ${l.returnable} unit(s) of "${l.name}" can still be returned.`); return; }
      if (q > 0 && !Number.isInteger(q)) { setErr(`"${l.name}" must be returned in whole units.`); return; }
    }
    setBusy(true); setErr(null);
    try {
      await API.purchaseReturn.create({
        supplier_id: supplierId, location_id: locationId,
        reference: reference.trim() || undefined, return_date: date,
        document_url: (doc && doc.url) || undefined, document_key: (doc && doc.key) || undefined,
        tax_rate_id: taxId || undefined,
        items,
      });
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not record the return.'); setBusy(false); }
  }

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12, borderBottom: `1px solid ${T.line}` };
  const mono = { fontFamily: T.fMono } as React.CSSProperties;

  return (
    <Modal T={T} title="Add Purchase Return" subtitle="Send received goods back to a supplier" width={860} onClose={onClose}
      footer={<>
        <div style={{ flex: 1, fontSize: 13.5, color: T.inkSub }}>
          Total Amount <b style={{ color: T.ink, fontFamily: T.fMono, marginLeft: 6, fontSize: 16 }}>{money(total)}</b>
        </div>
        <Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Submit'}</Btn>
      </>}>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
        <Field T={T} label="Supplier *">
          <SelectField T={T} value={supplierId} options={['', ...suppliers.map((s: any) => String(s.id))]} onChange={setSupplierId}
            render={(v: any) => (v ? (suppliers.find((s: any) => String(s.id) === v) || {}).name : 'Please Select')} />
        </Field>
        <Field T={T} label="Business Location *">
          <SelectField T={T} value={locationId} options={['', ...locations.map((l: any) => String(l.id))]} onChange={setLocationId}
            render={(v: any) => (v ? (locations.find((l: any) => String(l.id) === v) || {}).name : 'Please Select')} />
        </Field>
        <Field T={T} label="Reference No"><TextField T={T} value={reference} onChange={setReference} placeholder="e.g. DN-2026-001" /></Field>
        <Field T={T} label="Date *"><TextField T={T} type="date" value={date} onChange={setDate} /></Field>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input ref={docRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.csv,.zip" style={{ display: 'none' }} onChange={onPickDoc} />
        {!doc ? (
          <button onClick={() => docRef.current && docRef.current.click()} disabled={docBusy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: T.fBody, color: T.inkMid, background: T.paper, border: `1px dashed ${T.line}`, borderRadius: T.r, cursor: docBusy ? 'wait' : 'pointer' }}>
            📎 {docBusy ? 'Uploading…' : 'Attach Document'}
          </button>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12.5, background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r }}>
            <span>📄</span>
            <a href={doc.url} target="_blank" rel="noreferrer" style={{ color: T.accent.text, fontWeight: 600, textDecoration: 'none', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name || 'Document'}</a>
            <button onClick={onRemoveDoc} title="Remove" style={{ border: 'none', background: 'none', color: T.redText, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>✕</button>
          </div>
        )}
        <span style={{ fontSize: 11, color: T.inkMute }}>Debit note or credit memo (pdf, image, doc)</span>
      </div>

      {/* Search Products */}
      <div style={{ marginTop: 18, position: 'relative' }}>
        <Field T={T} label="Search Products" hint={ready ? 'Only what this supplier delivered here, and only what is still in stock, can be returned.' : 'Choose a supplier and a location first.'}>
          <TextField T={T} value={query} onChange={(v: string) => { setQuery(v); setOpen(true); }} disabled={!ready}
            onFocus={() => ready && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={ready ? 'Enter product name or SKU to add' : 'Select supplier and location'}
            style={!ready ? { background: T.paperAlt, cursor: 'not-allowed' } : undefined} />
        </Field>
        {open && ready && (
          <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: -14, maxHeight: 260, overflowY: 'auto', background: T.paper, border: `1px solid ${T.line}`, borderRadius: T.r, boxShadow: T.shModal }}>
            {searching && <div style={{ padding: 14, fontSize: 12.5, color: T.inkSub, ...mono }}>Searching…</div>}
            {!searching && !shown.length && (
              <div style={{ padding: 14, fontSize: 12.5, color: T.inkMute }}>
                {chosen.size && !query ? 'Everything returnable is already on this return.' : 'Nothing returnable matches that.'}
              </div>
            )}
            {!searching && shown.map((p: any) => (
              <button key={p.product_id} onMouseDown={(e: any) => e.preventDefault()} onClick={() => addLine(p)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 12px', background: 'none', border: 'none', borderTop: `1px solid ${T.line}`, cursor: 'pointer', textAlign: 'left', fontFamily: T.fBody }}
                onMouseEnter={(e: any) => (e.currentTarget.style.background = T.paperAlt)}
                onMouseLeave={(e: any) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.ink }}>{p.name}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: T.inkSub, ...mono }}>{p.sku || '—'}</span>
                </span>
                <span style={{ flexShrink: 0, textAlign: 'right', ...mono }}>
                  <span style={{ display: 'block', fontSize: 12.5, color: T.ink }}>{money(p.unit_cost)}</span>
                  <span style={{ display: 'block', fontSize: 11, color: T.inkMute }}>{p.returnable} returnable</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lines */}
      <div style={{ marginTop: 6, border: `1px solid ${T.line}`, borderRadius: T.r, overflowX: 'auto' }}>
        {lines.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>Product</th>
              <th style={{ ...th, textAlign: 'right', width: 130 }}>Quantity</th>
              <th style={{ ...th, textAlign: 'right' }}>Unit Price</th>
              <th style={{ ...th, textAlign: 'right' }}>Subtotal</th>
              <th style={{ ...th, width: 38 }} />
            </tr></thead>
            <tbody>
              {lines.map((l) => {
                const over = (Number(l.quantity) || 0) > l.returnable;
                return (
                  <tr key={l.product_id}>
                    <td style={{ ...td, whiteSpace: 'normal', fontWeight: 600, color: T.ink }}>
                      {l.name}{l.sku ? <span style={{ color: T.inkMute, fontWeight: 400 }}> · {l.sku}</span> : null}
                      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 400, color: over ? T.redText : T.inkMute }}>{l.returnable} returnable</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input type="number" min={1} max={l.returnable} step={1} value={l.quantity} onChange={(e: any) => setQty(l.product_id, e.target.value)}
                        style={{ ...miniNum(T), width: 112, ...(over ? { borderColor: T.redText, color: T.redText } : null) }} />
                    </td>
                    <td style={{ ...td, ...mono, textAlign: 'right', color: T.inkSub }}>{money(l.unit_cost)}</td>
                    <td style={{ ...td, ...mono, textAlign: 'right', color: T.ink, fontWeight: 600 }}>{money(lineTotal(l))}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button onClick={() => dropLine(l.product_id)} title="Remove" aria-label={`Remove ${l.name}`}
                        style={{ border: 'none', background: 'none', color: T.redText, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 26, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>
            {ready ? 'Search above to add the products you are sending back.' : 'Choose a supplier and a location to begin.'}
          </div>
        )}
      </div>

      {/* Totals */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14, alignItems: 'end' }}>
        <Field T={T} label="Purchase Tax">
          <SelectField T={T} value={taxId} options={['', ...taxes.map((t: any) => String(t.id))]} onChange={setTaxId}
            render={(v: any) => { if (!v) return 'None'; const t = taxes.find((x: any) => String(x.id) === v); return t ? `${t.name} @ ${t.amount}%` : 'None'; }} />
        </Field>
        <div style={{ fontSize: 12.5, color: T.inkMid, lineHeight: 1.9, textAlign: 'right' }}>
          <div>Subtotal <b style={{ ...mono, color: T.ink, marginLeft: 8 }}>{money(subtotal)}</b></div>
          {taxPct > 0 && <div>Purchase Tax ({taxPct}%) <b style={{ ...mono, color: T.ink, marginLeft: 8 }}>{money(taxAmount)}</b></div>}
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Total Amount <b style={{ ...mono, marginLeft: 8 }}>{money(total)}</b></div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: T.inkMute, marginTop: 12, lineHeight: 1.55 }}>
        Unit Price is the average landed cost these units were received at, and each unit is credited back to its own purchase — oldest first — so the amount recorded may differ slightly from this estimate when a product was bought at more than one price.
        {taxPct > 0 && ' Purchase tax is recorded on the document and in the total, but the ledger reverses the goods cost only — exactly as receiving posted it.'}
      </div>

      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}
