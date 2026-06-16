'use client';
// ─────────────────────────────────────────────────────────────────
// Stock Adjustments — record loss / damage / expiry (normal or
// abnormal), reducing stock. Plus a Tax Groups manager (combine
// multiple tax rates). Wired through API.stockAdjustment + API.taxRate.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useTheme } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useStateAj, useEffect: useEffectAj } = React;

export default function AdjustmentsPage() {
  const T = useTheme();
  return <Adjustments T={T} />;
}

function Adjustments({ T }: { T: Theme }) {
  const [rows, setRows] = useStateAj<any[]>([]);
  const [loading, setLoading] = useStateAj(true);
  const [locs, setLocs] = useStateAj<any[]>([]);
  const [edit, setEdit] = useStateAj(false);
  const [taxMgr, setTaxMgr] = useStateAj(false);
  const [confirmDel, setConfirmDel] = useStateAj<any>(null);
  const [show, node] = useToast();

  const reload = React.useCallback(() => { setLoading(true); API.stockAdjustment.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, []);
  useEffectAj(() => { reload(); }, [reload]);
  useEffectAj(() => { API.location.list().then(setLocs).catch(() => {}); }, []);

  async function doDelete(a: any) { try { await API.stockAdjustment.remove(a.id); setConfirmDel(null); show('Adjustment deleted'); reload(); } catch (e: any) { setConfirmDel(null); show(e.message); } }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Stock Adjustments" subtitle={`${rows.length} adjustments`}
        right={<><Btn T={T} kind="ghost" onClick={() => setTaxMgr(true)}>％ Tax Groups</Btn><Btn T={T} kind="accent" onClick={() => setEdit(true)}>+ New Adjustment</Btn></>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <StatStrip T={T} stats={[['Adjustments', rows.length], ['Items adjusted', rows.reduce((s: number, r: any) => s + r.item_count, 0)], ['Value lost', money0(rows.reduce((s: number, r: any) => s + r.total_value, 0))]]} />
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{([['Reference', 'l'], ['Location', 'l'], ['Type', 'l'], ['Reason', 'l'], ['Items', 'r'], ['Value', 'r'], ['Date', 'l'], ['', 'r']] as any[]).map(([h, a]: any, i: number) => (
                <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((a: any) => (
                  <tr key={a.id} style={{ transition: 'background .12s' }} onMouseEnter={(e: any) => e.currentTarget.style.background = T.paperAlt} onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.accent.text }}>{a.ref}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{a.location_name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={a.type === 'abnormal' ? 'red' : 'gray'}>{a.type}</Badge></td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink }}>{a.reason || '—'}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>{a.item_count}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.redText } as React.CSSProperties}>−{money(a.total_value)}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub }}>{a.date}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}><button onClick={() => setConfirmDel(a)} style={ajMini(T, true)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>GET /connector/api/stock-adjustment…</div>}
            {!loading && rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>No adjustments recorded.</div>}
          </Panel>
        </div>
      </div>

      {edit && <AdjustmentEditor T={T} locs={locs} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); show('Adjustment saved · stock updated'); reload(); }} />}
      {taxMgr && <TaxGroupManager T={T} onClose={() => setTaxMgr(false)} toast={show} />}
      {confirmDel && (
        <Modal T={T} title="Delete adjustment?" subtitle={confirmDel.ref} width={420} onClose={() => setConfirmDel(null)} onSave={() => doDelete(confirmDel)} saveLabel="Delete">
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>Remove <b style={{ color: T.ink }}>{confirmDel.ref}</b>? Stock levels are not restored automatically.</div>
        </Modal>
      )}
      {node}
    </div>
  );
}

function AdjustmentEditor({ T, locs, onClose, onSaved }: { T: Theme; locs: any[]; onClose: () => void; onSaved: () => void }) {
  const [locId, setLocId] = useStateAj((locs[0] || {}).id || 1);
  const [date, setDate] = useStateAj(new Date().toISOString().slice(0, 10));
  const [type, setType] = useStateAj('normal');
  const [reason, setReason] = useStateAj('');
  const [lines, setLines] = useStateAj<any[]>([{ product_id: '', qty: '' }]);
  const [busy, setBusy] = useStateAj(false);
  const [err, setErr] = useStateAj<string | null>(null);
  // Load the real catalog (works in mock + real mode) so adjustments carry valid product ids.
  const [allProducts, setAllProducts] = useStateAj<any[]>([]);
  useEffectAj(() => { API.product.list().then((r: any) => setAllProducts(r.items || r || [])).catch(() => {}); }, []);
  const products = allProducts.filter((p: any) => p.type !== 'combo' && p.enable_stock !== false);
  const setLine = (i: number, k: string, v: any) => setLines((ls: any[]) => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));

  async function save() {
    setBusy(true); setErr(null);
    try { await API.stockAdjustment.create({ location_id: locId, date, type, reason, lines: lines.filter((l: any) => l.product_id && Number(l.qty) > 0).map((l: any) => ({ product_id: l.product_id, qty: Number(l.qty) })) }); onSaved(); }
    catch (ex: any) { setErr(ex.message || 'Could not save the adjustment.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title="New stock adjustment" subtitle="Record loss, damage or expiry" width={620} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save adjustment'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Location"><SelectField T={T} value={String(locId)} options={locs.map((l: any) => String(l.id))} onChange={(v: any) => setLocId(Number(v))} render={(v: any) => (locs.find((l: any) => String(l.id) === v) || {}).name} /></Field>
        <Field T={T} label="Date"><TextField T={T} type="date" value={date} onChange={setDate} /></Field>
        <Field T={T} label="Adjustment type"><SelectField T={T} value={type} options={['normal', 'abnormal']} onChange={setType} render={(v: any) => v === 'normal' ? 'Normal (expected loss)' : 'Abnormal (theft/damage)'} /></Field>
        <Field T={T} label="Reason"><TextField T={T} value={reason} onChange={setReason} placeholder="e.g. Expired / breakage" /></Field>
      </FormGrid>
      <div style={{ marginTop: 18, marginBottom: 9, fontSize: 12, fontWeight: 700, color: T.inkSub }}>PRODUCTS TO REMOVE</div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 34px', gap: 8, padding: '8px 12px', background: T.paperAlt, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub } as React.CSSProperties}><span>Product</span><span style={{ textAlign: 'right' } as React.CSSProperties}>Qty lost</span><span></span></div>
        {lines.map((l: any, i: number) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 34px', gap: 8, padding: '8px 12px', borderTop: `1px solid ${T.line}`, alignItems: 'center' }}>
            <select value={l.product_id} onChange={(e: any) => setLine(i, 'product_id', e.target.value)} style={{ padding: '8px 10px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none' }}>
              <option value="">Select product…</option>{products.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
            </select>
            <input type="number" value={l.qty} onChange={(e: any) => setLine(i, 'qty', e.target.value)} placeholder="0" style={{ width: '100%', padding: '7px 9px', fontSize: 12.5, fontFamily: T.fMono, textAlign: 'right', color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} />
            <button onClick={() => setLines((ls: any[]) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: lines.length === 1 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: lines.length === 1 ? 0.4 : 1 }}>✕</button>
          </div>
        ))}
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.line}` }}><button onClick={() => setLines((ls: any[]) => [...ls, { product_id: '', qty: '' }])} style={{ background: 'none', border: 'none', color: T.accent.text, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: T.fBody }}>+ Add product</button></div>
      </div>
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
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

function ajMini(T: Theme, danger: boolean): React.CSSProperties { return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${danger ? T.redSoft : T.line}`, background: danger ? T.redSoft : T.paper, color: danger ? T.redText : T.inkMid }; }

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
