'use client';
// ─────────────────────────────────────────────────────────────────
// Stock Transfer — move stock between locations (the manual's flow).
// Status: pending → in-transit → completed; stock moves on completion,
// and a completed transfer is locked (delete only). Wired through
// API.transfer + API.location.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useTheme } from '@/components/shell';
import { API } from '@/lib/api';
import { PRODUCTS } from '@/lib/data';

const { useState: useStateTr, useEffect: useEffectTr } = React;

export default function TransfersPage() {
  const T = useTheme();
  return <Transfers T={T} />;
}

function Transfers({ T }: { T: Theme }) {
  const [rows, setRows] = useStateTr<any[]>([]);
  const [loading, setLoading] = useStateTr(true);
  const [locs, setLocs] = useStateTr<any[]>([]);
  const [edit, setEdit] = useStateTr(false);
  const [view, setView] = useStateTr<any>(null);
  const [confirmDel, setConfirmDel] = useStateTr<any>(null);
  const [show, node] = useToast();

  const reload = React.useCallback(() => { setLoading(true); API.transfer.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, []);
  useEffectTr(() => { reload(); }, [reload]);
  useEffectTr(() => { API.location.list().then(setLocs).catch(() => {}); }, []);

  const tone: any = { completed: 'green', in_transit: 'blue', pending: 'amber' };
  const label: any = { completed: 'Completed', in_transit: 'In transit', pending: 'Pending' };
  const nextStatus: any = { pending: 'in_transit', in_transit: 'completed' };

  async function advance(t: any) {
    try { await API.transfer.setStatus(t.id, nextStatus[t.status]); show('Status updated'); reload(); }
    catch (e: any) { show(e.message); }
  }
  async function doDelete(t: any) { try { await API.transfer.remove(t.id); setConfirmDel(null); show('Transfer deleted'); reload(); } catch (e: any) { setConfirmDel(null); show(e.message); } }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Stock Transfers" subtitle={`${rows.length} transfers`}
        right={<Btn T={T} kind="accent" onClick={() => setEdit(true)}>+ New Transfer</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <StatStrip T={T} stats={[['Transfers', rows.length], ['In transit', rows.filter((r: any) => r.status === 'in_transit').length], ['Value moved', money0(rows.filter((r: any) => r.status === 'completed').reduce((s: number, r: any) => s + r.total_value, 0))]]} />
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{([['Reference', 'l'], ['From', 'l'], ['To', 'l'], ['Items', 'r'], ['Value', 'r'], ['Date', 'l'], ['Status', 'l'], ['', 'r']] as any[]).map(([h, a]: any, i: number) => (
                <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((t: any) => (
                  <tr key={t.id} style={{ transition: 'background .12s' }} onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = T.paperAlt} onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                    <td onClick={() => setView(t)} style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.accent.text, cursor: 'pointer' }}>{t.ref}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink }}>{t.from_name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink }}>→ {t.to_name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{t.item_count}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{money(t.total_value)}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub }}>{t.date}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={tone[t.status]}>{label[t.status]}</Badge></td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                        {nextStatus[t.status] && <button onClick={() => advance(t)} style={trMini(T, 'accent')}>{t.status === 'pending' ? 'Ship' : 'Complete'}</button>}
                        {t.status !== 'completed' && <button onClick={() => setConfirmDel(t)} style={trMini(T, 'danger')}>Delete</button>}
                        {t.status === 'completed' && <button onClick={() => setView(t)} style={trMini(T)}>View</button>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>GET /connector/api/stock-transfer…</div>}
            {!loading && rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No transfers yet.</div>}
          </Panel>
        </div>
      </div>

      {edit && <TransferEditor T={T} locs={locs} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); show('Transfer created'); reload(); }} />}
      {view && <TransferView T={T} transfer={view} onClose={() => setView(null)} />}
      {confirmDel && (
        <Modal T={T} title="Delete transfer?" subtitle={confirmDel.ref} width={420} onClose={() => setConfirmDel(null)} onSave={() => doDelete(confirmDel)} saveLabel="Delete">
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>Remove transfer <b style={{ color: T.ink }}>{confirmDel.ref}</b>? Completed transfers can be deleted but not edited.</div>
        </Modal>
      )}
      {node}
    </div>
  );
}

function TransferEditor({ T, locs, onClose, onSaved }: { T: Theme; locs: any[]; onClose: () => void; onSaved: () => void }) {
  const [from, setFrom] = useStateTr((locs[0] || {}).id || 1);
  const [to, setTo] = useStateTr((locs[1] || {}).id || 2);
  const [date, setDate] = useStateTr(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useStateTr('pending');
  const [lines, setLines] = useStateTr<any[]>([{ product_id: '', qty: '' }]);
  const [busy, setBusy] = useStateTr(false);
  const [err, setErr] = useStateTr<string | null>(null);
  const products = PRODUCTS.filter((p: any) => p.type !== 'combo' && p.enable_stock !== false);
  const setLine = (i: number, k: string, v: any) => setLines((ls: any[]) => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));

  async function save() {
    setBusy(true); setErr(null);
    try {
      const payload = { from_location_id: from, to_location_id: to, date, status, lines: lines.filter((l: any) => l.product_id && Number(l.qty) > 0).map((l: any) => { const p = products.find((p: any) => p.id === l.product_id); return { product_id: l.product_id, qty: Number(l.qty), unit_cost: p ? p.cost : 0 }; }) };
      await API.transfer.create(payload); onSaved();
    } catch (ex: any) { setErr(ex.message || 'Could not save the transfer.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title="New stock transfer" subtitle="Move stock between locations" width={640} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Create transfer'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="From location"><SelectField T={T} value={String(from)} options={locs.map((l: any) => String(l.id))} onChange={(v: any) => setFrom(Number(v))} render={(v: any) => (locs.find((l: any) => String(l.id) === v) || {}).name} /></Field>
        <Field T={T} label="To location"><SelectField T={T} value={String(to)} options={locs.map((l: any) => String(l.id))} onChange={(v: any) => setTo(Number(v))} render={(v: any) => (locs.find((l: any) => String(l.id) === v) || {}).name} /></Field>
        <Field T={T} label="Date"><TextField T={T} type="date" value={date} onChange={setDate} /></Field>
        <Field T={T} label="Status"><SelectField T={T} value={status} options={['pending', 'in_transit', 'completed']} onChange={setStatus} render={(v: any) => ({ pending: 'Pending', in_transit: 'In transit', completed: 'Completed' } as any)[v]} /></Field>
      </FormGrid>
      <div style={{ marginTop: 18, marginBottom: 9, fontSize: 12, fontWeight: 700, color: T.inkSub }}>PRODUCTS</div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 34px', gap: 8, padding: '8px 12px', background: T.paperAlt, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub }}><span>Product</span><span style={{ textAlign: 'right' }}>Quantity</span><span></span></div>
        {lines.map((l: any, i: number) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 34px', gap: 8, padding: '8px 12px', borderTop: `1px solid ${T.line}`, alignItems: 'center' }}>
            <select value={l.product_id} onChange={e => setLine(i, 'product_id', e.target.value)} style={{ padding: '8px 10px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none' }}>
              <option value="">Select product…</option>
              {products.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
            </select>
            <input type="number" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)} placeholder="0" style={{ width: '100%', padding: '7px 9px', fontSize: 12.5, fontFamily: T.fMono, textAlign: 'right', color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none', boxSizing: 'border-box' }} />
            <button onClick={() => setLines((ls: any[]) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: lines.length === 1 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: lines.length === 1 ? 0.4 : 1 }}>✕</button>
          </div>
        ))}
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.line}` }}><button onClick={() => setLines((ls: any[]) => [...ls, { product_id: '', qty: '' }])} style={{ background: 'none', border: 'none', color: T.accent.text, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: T.fBody }}>+ Add product</button></div>
      </div>
      <div style={{ fontSize: 11, color: T.inkMute, marginTop: 9, lineHeight: 1.5 }}>Stock moves between the locations when the transfer is marked <b>Completed</b>. Pending / in-transit transfers can still be edited or deleted.</div>
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function TransferView({ T, transfer, onClose }: { T: Theme; transfer: any; onClose: () => void }) {
  const [data, setData] = useStateTr<any>(null);
  useEffectTr(() => { API.transfer.get(transfer.id).then(setData).catch(() => setData(transfer)); }, [transfer.id]);
  const t = data || transfer;
  return (
    <Modal T={T} title={t.ref} subtitle={`${t.from_name} → ${t.to_name} · ${t.date}`} width={500} onClose={onClose} footer={null}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Badge T={T} tone={t.status === 'completed' ? 'green' : t.status === 'in_transit' ? 'blue' : 'amber'}>{({ completed: 'Completed', in_transit: 'In transit', pending: 'Pending' } as any)[t.status]}</Badge>
        <span style={{ fontSize: 12.5, color: T.inkSub }}>{t.item_count} items · {money(t.total_value)}</span>
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px', padding: '8px 12px', background: T.paperAlt, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub }}><span>Product</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Value</span></div>
        {(t.lines || []).map((l: any, i: number) => { const p: any = PRODUCTS.find((x: any) => parseInt(String(x.id).replace(/\D/g, ''), 10) === l.product_id) || {}; return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px', padding: '9px 12px', borderTop: `1px solid ${T.line}`, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: T.ink }}>{p.name || 'Product #' + l.product_id}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{l.qty}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.ink }}>{money(l.qty * l.unit_cost)}</span>
          </div>
        ); })}
      </div>
    </Modal>
  );
}

function trMini(T: Theme, kind?: string): React.CSSProperties {
  const danger = kind === 'danger', accent = kind === 'accent';
  return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${accent ? T.accent.base : danger ? T.redSoft : T.line}`, background: accent ? T.accent.base : danger ? T.redSoft : T.paper, color: accent ? T.accent.on : danger ? T.redText : T.inkMid };
}

// ── File-local stat helper (mirrors prototype StatStrip) ─────────────
function StatStrip({ T, stats }: { T: Theme; stats: any[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 150px), 1fr))`, gap: 14, marginBottom: 18 }}>
      {stats.map(([label, value]: any, i: number) => (
        <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '15px 18px', boxShadow: T.sh1 }}>
          <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>{label}</div>
          <div style={{ fontFamily: T.fMono, fontWeight: 500, fontSize: 24, color: T.ink, marginTop: 7, letterSpacing: '-0.8px' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}
