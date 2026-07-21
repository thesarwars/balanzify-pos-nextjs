'use client';
// ─────────────────────────────────────────────────────────────────
// Stock Adjustments — the reference list: Date, Reference No,
// Location, Adjustment type (Normal/Abnormal), Total Amount, Total
// amount recovered, Reason, Added By, Actions. Saving an adjustment
// REMOVES the quantities from stock; deleting restores them. Also
// hosts the Tax Groups manager (combine multiple tax rates).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, TextField, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { ActionsMenu } from '../../products/components/list-table';
import { ConfirmModal } from '../../purchase-orders/components/bits';
import { LuEye, LuPencil, LuTrash2 } from 'react-icons/lu';

const { useState: useStateAj, useEffect: useEffectAj } = React;

const TYPE_LABEL: any = { normal: 'Normal', abnormal: 'Abnormal' };

export function AdjustmentsList({ T, flash, onAdd, onEdit }:
  { T: Theme; flash?: React.MutableRefObject<string>; onAdd: () => void; onEdit: (a: any) => void }) {
  const [rows, setRows] = useStateAj<any[]>([]);
  const [loading, setLoading] = useStateAj(true);
  const [search, setSearch] = useStateAj('');
  const [view, setView] = useStateAj<any>(null);
  const [taxMgr, setTaxMgr] = useStateAj(false);
  const [confirmDel, setConfirmDel] = useStateAj<any>(null);
  const [menu, setMenu] = useStateAj<any>(null);
  const [show, node] = useToast();

  const reload = React.useCallback(() => { setLoading(true); API.stockAdjustment.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, []);
  useEffectAj(() => { reload(); }, [reload]);
  useEffectAj(() => { if (flash?.current) { show(flash.current); flash.current = ''; } }, [flash, show]);

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? rows.filter((a: any) => [a.ref, a.location_name, a.reason, a.added_by, TYPE_LABEL[a.type]].some((v) => String(v || '').toLowerCase().includes(needle)))
    : rows;

  async function doDelete(a: any) {
    try { await API.stockAdjustment.remove(a.id); setConfirmDel(null); show('Adjustment deleted — stock restored'); reload(); }
    catch (e: any) { setConfirmDel(null); show(e.message); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '11px 16px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '12px 16px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink, whiteSpace: 'nowrap' };

  const actionsFor = (a: any) => [
    { label: 'View', icon: <LuEye size={14} />, on: () => setView(a) },
    { label: 'Edit', icon: <LuPencil size={14} />, on: () => onEdit(a) },
    { sep: true },
    { label: 'Delete', icon: <LuTrash2 size={14} />, danger: true, on: () => setConfirmDel(a) },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Stock Adjustments" subtitle={`${rows.length} adjustments`}
        right={<><Btn T={T} kind="ghost" onClick={() => setTaxMgr(true)}>％ Tax Groups</Btn><Btn T={T} kind="accent" onClick={onAdd}>+ Add</Btn></>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <StatStrip T={T} stats={[
            ['Adjustments', rows.length],
            ['Abnormal', rows.filter((r: any) => r.type === 'abnormal').length],
            ['Value written off', money0(rows.reduce((s: number, r: any) => s + (r.total_value || 0), 0))],
            ['Recovered', money0(rows.reduce((s: number, r: any) => s + (r.total_recovered || 0), 0))],
          ]} />
          <Panel T={T} pad={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, marginRight: 'auto' }}>All stock adjustments</span>
              <div style={{ width: 200 }}><TextField T={T} value={search} onChange={setSearch} placeholder="Search …" /></div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                <thead><tr>
                  <th style={th}>Date</th><th style={th}>Reference No</th><th style={th}>Location</th><th style={th}>Adjustment type</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total Amount</th><th style={{ ...th, textAlign: 'right' }}>Total amount recovered</th>
                  <th style={th}>Reason</th><th style={th}>Added By</th><th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr></thead>
                <tbody>
                  {visible.map((a: any) => (
                    <tr key={a.id} onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = T.paperAlt)} onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}>
                      <td style={{ ...td, color: T.inkSub }}>{a.date}</td>
                      <td onClick={() => setView(a)} style={{ ...td, fontFamily: T.fMono, fontWeight: 600, color: T.accent.text, cursor: 'pointer' }}>{a.ref}</td>
                      <td style={td}>{a.location_name}</td>
                      <td style={td}><Badge T={T} tone={a.type === 'abnormal' ? 'red' : 'blue'}>{TYPE_LABEL[a.type] || a.type}</Badge></td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 600 }}>{money(a.total_value || 0)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono }}>{money(a.total_recovered || 0)}</td>
                      <td style={{ ...td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', color: T.inkSub }} title={a.reason}>{a.reason || '—'}</td>
                      <td style={{ ...td, color: T.inkSub }}>{a.added_by}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <ActionsMenu T={T} open={menu === a.id} onToggle={() => setMenu(menu === a.id ? null : a.id)} items={actionsFor(a)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading adjustments…</div>}
            {!loading && visible.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>{needle ? 'No adjustments match that search.' : 'No adjustments yet.'}</div>}
          </Panel>
        </div>
      </div>

      {view && <AdjustmentView T={T} adjustment={view} onClose={() => setView(null)} />}
      {taxMgr && <TaxGroupManager T={T} onClose={() => setTaxMgr(false)} toast={show} />}
      {confirmDel && (
        <ConfirmModal T={T} title={`Delete ${confirmDel.ref}?`}
          body="Deleting this adjustment puts the written-off quantities back on the shelf and unwinds its ledger entries. This cannot be undone."
          confirmLabel="Delete" confirmKind="danger"
          onConfirm={() => doDelete(confirmDel)} onClose={() => setConfirmDel(null)} />
      )}
      {node}
    </div>
  );
}

function AdjustmentView({ T, adjustment, onClose }: { T: Theme; adjustment: any; onClose: () => void }) {
  const [data, setData] = useStateAj<any>(null);
  useEffectAj(() => { API.stockAdjustment.get(adjustment.id).then(setData).catch(() => setData(adjustment)); }, [adjustment.id]);
  const a = data || adjustment;
  return (
    <Modal T={T} title={a.ref} subtitle={`${a.location_name} · ${a.date}`} width={540} onClose={onClose} footer={null}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Badge T={T} tone={a.type === 'abnormal' ? 'red' : 'blue'}>{TYPE_LABEL[a.type] || a.type}</Badge>
        <span style={{ fontSize: 12.5, color: T.inkSub }}>{a.item_count} items · {money(a.total_value || 0)}</span>
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 90px 96px', padding: '8px 12px', background: T.paperAlt, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub }}>
          <span>Product</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Unit Price</span><span style={{ textAlign: 'right' }}>Subtotal</span>
        </div>
        {(a.lines || []).map((l: any, i: number) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 90px 96px', padding: '9px 12px', borderTop: `1px solid ${T.line}`, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: T.ink }}>{l.product_name || 'Product'}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{l.qty}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{money(l.unit_price || 0)}</span>
            <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.ink }}>{money(l.qty * (l.unit_price || 0))}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', marginTop: 12, fontSize: 12.5, color: T.inkMid }}>
        <span>Total: <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(a.total_value || 0)}</b></span>
        <span>Recovered: <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(a.total_recovered || 0)}</b></span>
      </div>
      {a.reason && <div style={{ marginTop: 12, padding: '9px 12px', background: T.paperAlt, borderRadius: 8, fontSize: 12.5, color: T.inkMid }}>{a.reason}</div>}
    </Modal>
  );
}

function TaxGroupManager({ T, onClose, toast }: { T: Theme; onClose: () => void; toast: (m: string) => void }) {
  const [rates, setRates] = useStateAj<any[]>([]);
  const [groups, setGroups] = useStateAj<any[]>([]);
  const [name, setName] = useStateAj('');
  const [picked, setPicked] = useStateAj<any[]>([]);
  const [busy, setBusy] = useStateAj(false);
  const reload = () => API.taxRate.groups().then(setGroups).catch(() => {});
  useEffectAj(() => { API.taxRate.list().then((rs: any[]) => setRates(rs.filter((r: any) => r.id !== 0))).catch(() => {}); reload(); }, []);
  const toggle = (id: any) => setPicked((p: any[]) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  async function add() {
    if (!name.trim() || !picked.length) return;
    setBusy(true);
    try { await API.taxRate.createGroup({ name, tax_ids: picked }); setName(''); setPicked([]); reload(); toast('Tax group added'); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }
  async function del(g: any) { try { await API.taxRate.removeGroup(g.id); reload(); toast('Tax group removed'); } catch (e: any) { toast(e.message); } }
  return (
    <Modal T={T} title="Tax Groups" subtitle="Combine multiple tax rates onto one invoice" width={500} onClose={onClose} footer={null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {groups.map((g: any) => (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{g.name}</div><div style={{ fontSize: 11, color: T.inkSub, marginTop: 2 }}>{g.members.join(' + ')}</div></div>
            <Badge T={T} tone="brass">{g.total_rate}%</Badge>
            <button onClick={() => del(g)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
        ))}
        {groups.length === 0 && <div style={{ fontSize: 12.5, color: T.inkMute, padding: '6px 0' }}>No tax groups yet.</div>}
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 6 }}>New group name</div>
        <TextField T={T} value={name} onChange={setName} placeholder="e.g. VAT + Service tax" />
        <div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, margin: '12px 0 7px' }}>Include rates</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {rates.map((r: any) => (
            <button key={r.id} onClick={() => toggle(r.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: 600, background: picked.includes(r.id) ? T.accent.soft : T.paper, border: `1.5px solid ${picked.includes(r.id) ? T.accent.base : T.line}`, color: picked.includes(r.id) ? T.accent.text : T.inkMid }}>{picked.includes(r.id) ? '✓ ' : ''}{r.name}</button>
          ))}
        </div>
        <Btn T={T} kind="accent" onClick={add} disabled={busy} style={{ marginTop: 14 }}>Add tax group</Btn>
      </div>
    </Modal>
  );
}

// ── File-local stat helper (mirrors prototype StatStrip) ─
function StatStrip({ T, stats }: { T: Theme; stats: any[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 150px), 1fr))`, gap: 14, marginBottom: 18 }}>
      {stats.map(([label, value]: any, i: number) => (
        <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '15px 18px', boxShadow: T.sh1 }}>
          <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 } as React.CSSProperties}>{label}</div>
          <div style={{ fontFamily: T.fMono, fontWeight: 500, fontSize: 24, color: T.ink, marginTop: 7, letterSpacing: '-0.8px' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}
