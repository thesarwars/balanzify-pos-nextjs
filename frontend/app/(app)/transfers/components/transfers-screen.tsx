'use client';
// ─────────────────────────────────────────────────────────────────
// Stock Transfers — the reference list: Date, Reference No, From,
// To, Status, Shipping Charges, Total Amount, Notes, Actions.
// Status advances Pending → In Transit → Completed; stock leaves
// the source at In Transit and lands at the destination when
// Completed. Wired through API.transfer + API.location.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, TextField, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { ActionsMenu } from '../../products/components/list-table';
import { ConfirmModal } from '../../purchase-orders/components/bits';
import { LuEye, LuPencil, LuTruck, LuBadgeCheck, LuTrash2 } from 'react-icons/lu';

const { useState: useStateTr, useEffect: useEffectTr } = React;

const TONE: any = { completed: 'green', in_transit: 'blue', pending: 'amber' };
const LABEL: any = { completed: 'Completed', in_transit: 'In Transit', pending: 'Pending' };

export function TransfersList({ T, flash, onAdd, onEdit }:
  { T: Theme; flash?: React.MutableRefObject<string>; onAdd: () => void; onEdit: (t: any) => void }) {
  const [rows, setRows] = useStateTr<any[]>([]);
  const [loading, setLoading] = useStateTr(true);
  const [search, setSearch] = useStateTr('');
  const [view, setView] = useStateTr<any>(null);
  const [confirmDel, setConfirmDel] = useStateTr<any>(null);
  const [menu, setMenu] = useStateTr<any>(null);
  const [show, node] = useToast();

  const reload = React.useCallback(() => { setLoading(true); API.transfer.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, []);
  useEffectTr(() => { reload(); }, [reload]);
  useEffectTr(() => { if (flash?.current) { show(flash.current); flash.current = ''; } }, [flash, show]);

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? rows.filter((t: any) => [t.ref, t.from_name, t.to_name, t.notes, LABEL[t.status]].some((v) => String(v || '').toLowerCase().includes(needle)))
    : rows;

  async function advance(t: any, status: string) {
    try { await API.transfer.setStatus(t.id, status); show(`Marked ${LABEL[status]}`); reload(); }
    catch (e: any) { show(e.message); }
  }
  async function doDelete(t: any) {
    try { await API.transfer.remove(t.id); setConfirmDel(null); show('Transfer deleted'); reload(); }
    catch (e: any) { setConfirmDel(null); show(e.message); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '11px 16px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '12px 16px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink, whiteSpace: 'nowrap' };

  const actionsFor = (t: any) => [
    { label: 'View', icon: <LuEye size={14} />, on: () => setView(t) },
    { label: 'Edit', icon: <LuPencil size={14} />, on: () => onEdit(t) },
    ...(t.status === 'pending' ? [{ label: 'Mark In Transit', icon: <LuTruck size={14} />, on: () => advance(t, 'in_transit') }] : []),
    ...(t.status !== 'completed' ? [{ label: 'Mark Completed', icon: <LuBadgeCheck size={14} />, on: () => advance(t, 'completed') }] : []),
    { sep: true },
    { label: 'Delete', icon: <LuTrash2 size={14} />, danger: true, on: () => setConfirmDel(t) },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Stock Transfers" subtitle={`${rows.length} transfers`}
        right={<Btn T={T} kind="accent" onClick={onAdd}>+ Add</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <StatStrip T={T} stats={[
            ['Transfers', rows.length],
            ['In transit', rows.filter((r: any) => r.status === 'in_transit').length],
            ['Value moved', money0(rows.filter((r: any) => r.status === 'completed').reduce((s: number, r: any) => s + (r.total_value || 0), 0))],
          ]} />
          <Panel T={T} pad={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, marginRight: 'auto' }}>All Stock Transfers</span>
              <div style={{ width: 200 }}><TextField T={T} value={search} onChange={setSearch} placeholder="Search …" /></div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>
                  <th style={th}>Date</th><th style={th}>Reference No</th><th style={th}>Location (From)</th><th style={th}>Location (To)</th>
                  <th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Shipping Charges</th><th style={{ ...th, textAlign: 'right' }}>Total Amount</th>
                  <th style={th}>Additional Notes</th><th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr></thead>
                <tbody>
                  {visible.map((t: any) => (
                    <tr key={t.id} onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = T.paperAlt)} onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}>
                      <td style={{ ...td, color: T.inkSub }}>{t.date}</td>
                      <td onClick={() => setView(t)} style={{ ...td, fontFamily: T.fMono, fontWeight: 600, color: T.accent.text, cursor: 'pointer' }}>{t.ref}</td>
                      <td style={td}>{t.from_name}</td>
                      <td style={td}>{t.to_name}</td>
                      <td style={td}><Badge T={T} tone={TONE[t.status] || 'gray'}>{LABEL[t.status] || t.status}</Badge></td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono }}>{money(t.shipping_charges || 0)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 600 }}>{money(t.total_value || 0)}</td>
                      <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', color: T.inkSub }} title={t.notes}>{t.notes || '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <ActionsMenu T={T} open={menu === t.id} onToggle={() => setMenu(menu === t.id ? null : t.id)} items={actionsFor(t)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading transfers…</div>}
            {!loading && visible.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>{needle ? 'No transfers match that search.' : 'No transfers yet.'}</div>}
          </Panel>
        </div>
      </div>

      {view && <TransferView T={T} transfer={view} onClose={() => setView(null)} />}
      {confirmDel && (
        <ConfirmModal T={T} title={`Delete ${confirmDel.ref}?`}
          body={confirmDel.status === 'pending'
            ? 'This transfer holds no stock yet — it will simply be removed.'
            : 'Deleting reverses the stock movement: goods return to the source location. If the destination has already sold them, the delete is refused.'}
          confirmLabel="Delete" confirmKind="danger"
          onConfirm={() => doDelete(confirmDel)} onClose={() => setConfirmDel(null)} />
      )}
      {node}
    </div>
  );
}

function TransferView({ T, transfer, onClose }: { T: Theme; transfer: any; onClose: () => void }) {
  const [data, setData] = useStateTr<any>(null);
  useEffectTr(() => { API.transfer.get(transfer.id).then(setData).catch(() => setData(transfer)); }, [transfer.id]);
  const t = data || transfer;
  const linesTotal = (t.lines || []).reduce((s: number, l: any) => s + l.qty * (l.unit_price ?? l.unit_cost ?? 0), 0);
  return (
    <Modal T={T} title={t.ref} subtitle={`${t.from_name} → ${t.to_name} · ${t.date}`} width={560} onClose={onClose} footer={null}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Badge T={T} tone={TONE[t.status] || 'gray'}>{LABEL[t.status] || t.status}</Badge>
        <span style={{ fontSize: 12.5, color: T.inkSub }}>{t.item_count} items · {money(t.total_value || 0)}</span>
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 90px 96px', padding: '8px 12px', background: T.paperAlt, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub }}>
          <span>Product</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Unit Price</span><span style={{ textAlign: 'right' }}>Subtotal</span>
        </div>
        {(t.lines || []).map((l: any, i: number) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 90px 96px', padding: '9px 12px', borderTop: `1px solid ${T.line}`, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: T.ink }}>{l.product_name || 'Product'}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{l.qty}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{money(l.unit_price ?? l.unit_cost ?? 0)}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.ink }}>{money(l.qty * (l.unit_price ?? l.unit_cost ?? 0))}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', marginTop: 12, fontSize: 12.5, color: T.inkMid }}>
        <span>Subtotal: <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(linesTotal)}</b></span>
        <span>Shipping: <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(t.shipping_charges || 0)}</b></span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Total: <span style={{ fontFamily: T.fMono }}>{money(t.total_value || 0)}</span></span>
      </div>
      {t.notes && <div style={{ marginTop: 12, padding: '9px 12px', background: T.paperAlt, borderRadius: 8, fontSize: 12.5, color: T.inkMid }}>{t.notes}</div>}
    </Modal>
  );
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
