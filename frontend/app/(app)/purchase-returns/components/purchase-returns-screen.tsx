'use client';
// ─────────────────────────────────────────────────────────────────
// Purchase Returns — every return, across every purchase.
//
// You record a return against a supplier and a location, not against one
// purchase. The cost basis still comes from a purchase LINE — the server
// charges each returned unit back to the line it arrived on, oldest first —
// so a return may span several purchases, and then has no single parent.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Panel, Modal, Field, TextField, SelectField, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { money, money0 } from '@/lib/theme';
import { formatDate } from '@/lib/business-settings';
import { API } from '@/lib/api';
import { AddPurchaseReturnModal } from './add-purchase-return';

const { useState, useEffect, useCallback } = React;

export function PurchaseReturns({ T }: { T: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({ count: 0, grand_total: 0 });
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [locs, setLocs] = useState<any[]>([]);
  const [filters, setFilters] = useState<any>({ supplier_id: '', location_id: '', from: '', to: '', search: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<any>(null);
  const [show, node] = useToast();

  // Bumped to force a reload after a return is recorded, without touching filters.
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Debounced, and the last response to arrive is ignored unless it is the last
  // one asked for — otherwise typing "abc" can leave the grid showing "a".
  useEffect(() => {
    let dead = false;
    setLoading(true);
    const t = setTimeout(() => {
      API.purchaseReturn.list(filters)
        .then((r: any) => { if (dead) return; setRows(r.rows || []); setTotals(r.totals || { count: 0, grand_total: 0 }); })
        .catch(() => { if (dead) return; setRows([]); setTotals({ count: 0, grand_total: 0 }); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 250);
    return () => { dead = true; clearTimeout(t); };
  }, [filters, nonce]);
  useEffect(() => {
    API.contact.list({ type: 'supplier' }).then(setSuppliers).catch(() => {});
    API.location.list().then(setLocs).catch(() => {});
  }, []);

  const setF = (k: string, v: any) => setFilters((p: any) => ({ ...p, [k]: v }));
  const clear = () => setFilters({ supplier_id: '', location_id: '', from: '', to: '', search: '' });
  const active = Object.values(filters).filter(Boolean).length;

  const th: React.CSSProperties = { textAlign: 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Purchase Returns" subtitle={`${totals.count} return${totals.count === 1 ? '' : 's'} · ${money0(totals.grand_total)} returned`}
        right={<Btn T={T} kind="accent" onClick={() => setAdding(true)}>+ Add</Btn>} />

      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Filters */}
          <Panel T={T} pad={false}>
            <button onClick={() => setShowFilters((v) => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.fBody } as React.CSSProperties}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>▼ Filters {active > 0 && <span style={{ color: T.accent.text }}>({active})</span>}</span>
              <span style={{ fontSize: 11, color: T.inkSub, transform: showFilters ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
            </button>
            {showFilters && (
              <div style={{ padding: '0 18px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
                <Field T={T} label="Supplier"><SelectField T={T} value={filters.supplier_id} options={['', ...suppliers.map((s: any) => String(s.id))]} onChange={(v: any) => setF('supplier_id', v)} render={(v: any) => (v ? (suppliers.find((s: any) => String(s.id) === v) || {}).name : 'All suppliers')} /></Field>
                <Field T={T} label="Location"><SelectField T={T} value={filters.location_id} options={['', ...locs.map((l: any) => String(l.id))]} onChange={(v: any) => setF('location_id', v)} render={(v: any) => (v ? (locs.find((l: any) => String(l.id) === v) || {}).name : 'All locations')} /></Field>
                <Field T={T} label="From"><TextField T={T} type="date" value={filters.from} onChange={(v: any) => setF('from', v)} /></Field>
                <Field T={T} label="To"><TextField T={T} type="date" value={filters.to} onChange={(v: any) => setF('to', v)} /></Field>
                <Field T={T} label="Search"><TextField T={T} value={filters.search} onChange={(v: any) => setF('search', v)} placeholder="Reference, purchase, supplier…" /></Field>
                <div><Btn T={T} kind="ghost" onClick={clear} disabled={!active}>Clear</Btn></div>
              </div>
            )}
          </Panel>

          {/* List */}
          <Panel T={T} pad={false}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 14.5, fontWeight: 700, color: T.ink }}>All purchase returns</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>
                  <th style={th}>Date</th><th style={th}>Return No</th><th style={th}>Reference</th>
                  <th style={th}>Parent purchase</th><th style={th}>Location</th><th style={th}>Supplier</th>
                  <th style={{ ...th, textAlign: 'right' }}>Items</th><th style={{ ...th, textAlign: 'right' }}>Grand total</th>
                  <th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr></thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} onClick={() => setView(r)} style={{ cursor: 'pointer' }}
                      onMouseEnter={(e: any) => (e.currentTarget.style.background = T.paperAlt)}
                      onMouseLeave={(e: any) => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ ...td, fontFamily: T.fMono, color: T.inkMid }}>{formatDate(r.date)}</td>
                      <td style={{ ...td, fontFamily: T.fMono, fontWeight: 600, color: T.accent.text }}>{r.number}</td>
                      <td style={{ ...td, color: T.inkSub }}>{r.reference || '—'}</td>
                      <td style={{ ...td, fontFamily: T.fMono, color: T.inkSub }}>{r.parent_ref || '—'}</td>
                      <td style={{ ...td, color: T.inkSub }}>{r.location_name}</td>
                      <td style={{ ...td, color: T.ink, fontWeight: 600 }}>{r.supplier_name}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, color: T.inkSub } as React.CSSProperties}>{r.item_count}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 600, color: T.redText } as React.CSSProperties}>−{money(r.total)}</td>
                      <td style={{ ...td, textAlign: 'right' } as React.CSSProperties} onClick={(e: any) => e.stopPropagation()}>
                        <Btn T={T} kind="ghost" onClick={() => setView(r)}>View</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot><tr>
                    <td colSpan={7} style={{ ...td, textAlign: 'right', fontWeight: 700, color: T.ink, background: T.paperAlt } as React.CSSProperties}>Total:</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 700, color: T.redText, background: T.paperAlt } as React.CSSProperties}>−{money(totals.grand_total)}</td>
                    <td style={{ ...td, background: T.paperAlt }} />
                  </tr></tfoot>
                )}
              </table>
            </div>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>Loading…</div>}
            {!loading && !rows.length && (
              <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13, lineHeight: 1.6 } as React.CSSProperties}>
                {active ? 'No purchase returns match these filters.' : 'No purchase returns yet. Add one to send received goods back to a supplier.'}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {adding && <AddPurchaseReturnModal T={T} suppliers={suppliers} locations={locs} onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); show('Purchase return recorded · stock updated'); reload(); }} />}
      {view && <ReturnView T={T} row={view} onClose={() => setView(null)} />}
      {node}
    </div>
  );
}

function ReturnView({ T, row, onClose }: { T: any; row: any; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { API.purchaseReturn.get(row.id).then(setData).catch(() => setData(row)); }, [row.id]);
  const r = data || row;
  const th: React.CSSProperties = { textAlign: 'left', padding: '9px 11px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` };
  const td: React.CSSProperties = { padding: '8px 11px', fontSize: 12.5, borderBottom: `1px solid ${T.line}` };

  const parents: string[] = r.parent_refs && r.parent_refs.length ? r.parent_refs : (r.parent_ref ? [r.parent_ref] : []);

  return (
    <Modal T={T} title={`Purchase return · ${r.number}`} subtitle={parents.length ? `${r.supplier_name} · against ${parents.join(', ')}` : r.supplier_name} width={680} onClose={onClose}
      footer={<><div style={{ flex: 1, fontSize: 13.5, color: T.inkSub }}>Returned <b style={{ color: T.redText, fontFamily: T.fMono, marginLeft: 6, fontSize: 15 }}>−{money(r.total)}</b></div><Btn T={T} kind="accent" onClick={onClose}>Close</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5, color: T.inkMid, marginBottom: 14 }}>
        <div><b style={{ color: T.inkSub }}>Date:</b> {formatDate(r.date)}</div>
        <div><b style={{ color: T.inkSub }}>Reference:</b> {r.reference || '—'}</div>
        <div><b style={{ color: T.inkSub }}>Location:</b> {r.location_name}</div>
        <div><b style={{ color: T.inkSub }}>Recorded by:</b> {r.by || '—'}</div>
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Product</th><th style={th}>SKU</th><th style={th}>Purchase</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Unit cost</th><th style={{ ...th, textAlign: 'right' }}>Subtotal</th></tr></thead>
          <tbody>
            {(r.items || []).map((it: any, i: number) => (
              <tr key={i}>
                <td style={{ ...td, fontWeight: 600, color: T.ink }}>{it.product_name}</td>
                <td style={{ ...td, fontFamily: T.fMono, color: T.inkSub }}>{it.sku || '—'}</td>
                <td style={{ ...td, fontFamily: T.fMono, color: T.inkSub }}>{it.parent_ref || '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, color: T.inkSub } as React.CSSProperties}>{it.quantity}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, color: T.inkSub } as React.CSSProperties}>{money(it.unit_price)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 600, color: T.ink } as React.CSSProperties}>{money(it.total_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12.5, color: T.inkMid, lineHeight: 1.9, textAlign: 'right' }}>
        <div>Subtotal <b style={{ fontFamily: T.fMono, color: T.ink, marginLeft: 8 }}>{money(r.subtotal)}</b></div>
        {r.tax > 0 && <div>Purchase tax <b style={{ fontFamily: T.fMono, color: T.ink, marginLeft: 8 }}>{money(r.tax)}</b></div>}
        <div style={{ fontWeight: 700, color: T.ink }}>Total <b style={{ fontFamily: T.fMono, marginLeft: 8 }}>{money(r.total)}</b></div>
      </div>
      {r.tax > 0 && (
        <div style={{ fontSize: 11, color: T.inkMute, marginTop: 6, lineHeight: 1.55, textAlign: 'right' }}>
          The ledger reversed the {money(r.subtotal)} goods cost — purchase tax was never posted when the goods were received.
        </div>
      )}
      {(r.document_url || r.notes) && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: T.inkMid, lineHeight: 1.6 }}>
          {r.notes && <div><b style={{ color: T.inkSub }}>Notes:</b> {r.notes}</div>}
          {r.document_url && <a href={r.document_url} target="_blank" rel="noreferrer" style={{ color: T.accent.text, fontWeight: 600, textDecoration: 'none' }}>📄 View attached document</a>}
        </div>
      )}
    </Modal>
  );
}
