'use client';
// ─────────────────────────────────────────────────────────────────
// Pharmacy — expiry-loss prevention dashboard, expiry report with
// pull-expired write-off, drug catalog config (generic/strength/
// formulation + unit selling), fast movers / reorder. A paid add-on:
// shows an enable prompt unless the Pharmacy module is on.
// Wired through API.pharmacy.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useS, useEffect: useE, useCallback: useCb } = React;
const FORMULATIONS = ['tablet', 'capsule', 'syrup', 'suspension', 'injection', 'cream', 'ointment', 'drops', 'inhaler', 'suppository', 'other'];
const expTone: any = { EXPIRED: 'red', URGENT: 'amber', SOON: 'blue', OK: 'gray' };

export function Pharmacy({ T }: { T: Theme }) {
  const [enabled, setEnabled] = useS<any>(null);   // null = loading
  const [tab, setTab] = useS<any>('dashboard');
  const [dash, setDash] = useS<any>(null);
  const [exp, setExp] = useS<any>({ expired: [], urgent_30d: [], soon_90d: [], total_value_at_risk: 0 });
  const [drugs, setDrugs] = useS<any[]>([]);
  const [movers, setMovers] = useS<any[]>([]);
  const [q, setQ] = useS('');
  const [edit, setEdit] = useS<any>(null);
  const [show, node] = useToast();

  useE(() => { API.module.list().then((ms: any) => setEnabled(!!(ms.find((m: any) => m.key === 'pharmacy') || {}).enabled)).catch(() => setEnabled(false)); }, []);
  const reloadExpiry = useCb(() => API.pharmacy.expiry().then(setExp).catch(() => {}), []);
  const reloadDrugs = useCb(() => API.pharmacy.drugs(q).then(setDrugs).catch(() => {}), [q]);
  useE(() => {
    if (!enabled) return;
    API.pharmacy.dashboard().then(setDash).catch(() => {});
    reloadExpiry();
    API.pharmacy.fastMovers().then(setMovers).catch(() => {});
  }, [enabled, reloadExpiry]);
  useE(() => { if (enabled && tab === 'drugs') reloadDrugs(); }, [enabled, tab, reloadDrugs]);

  async function enableModule() { try { await API.module.setEnabled('pharmacy', true); setEnabled(true); show('Pharmacy module enabled'); } catch (e: any) { show(e.message); } }
  async function pull(b: any) { try { const r: any = await API.pharmacy.pullExpired(b.batch_id); show(r.message || 'Batch pulled'); reloadExpiry(); API.pharmacy.dashboard().then(setDash); } catch (e: any) { show(e.message); } }

  if (enabled === null) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paperAlt, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>;
  if (enabled === false) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.paperAlt }}>
      <Topbar T={T} title="Pharmacy" subtitle="Expiry-loss prevention & dispensing" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ width: 76, height: 76, borderRadius: 20, background: T.accent.soft, color: T.accent.base, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, margin: '0 auto 20px' }}>✚</div>
          <div style={{ fontFamily: T.fDisplay, fontSize: 24, fontWeight: T.dispWeight, color: T.ink, marginBottom: 8 }}>Pharmacy module</div>
          <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6, marginBottom: 22 }}>Cut expired-stock losses: expiry exposure dashboard, pull-expired write-offs, drug catalog with unit dispensing, and fast-mover reorder. Paid add-on ($15/mo).</div>
          <Btn T={T} kind="accent" onClick={enableModule}>Enable Pharmacy · $15/mo</Btn>
        </div>
      </div>
      {node}
    </div>
  );

  const tabs = [['dashboard', 'Dashboard'], ['expiry', 'Expiry', exp.expired.length + exp.urgent_30d.length], ['drugs', 'Drug catalog'], ['movers', 'Fast movers']];
  const ex = dash?.expiry_exposure || {};

  const expiryRows = (rows: any[]) => rows.map((b: any) => (
    <tr key={b.batch_id}>
      <td style={td(T)}><b style={{ color: T.ink }}>{b.product}</b>{b.generic ? <span style={{ color: T.inkSub }}> · {b.generic}</span> : ''}{b.strength ? <span style={{ color: T.inkMute, fontSize: 11 }}> {b.strength}</span> : ''}</td>
      <td style={td(T)}><span style={{ fontFamily: T.fMono, fontSize: 12 }}>{b.batch_number || '—'}</span></td>
      <td style={td(T)}><Badge T={T} tone={expTone[b.status]}>{b.status}{b.days_left >= 0 ? ` · ${b.days_left}d` : ''}</Badge></td>
      <td style={{ ...td(T), textAlign: 'right' }}>{b.quantity_remaining}</td>
      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: T.redText }}>{money(b.value_at_cost)}</td>
      <td style={{ ...td(T), textAlign: 'right' }}>{b.status === 'EXPIRED' && <button onClick={() => pull(b)} style={mini(T, true)}>Pull / write off</button>}</td>
    </tr>
  ));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Pharmacy" subtitle="Expiry-loss prevention & dispensing" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
            {tabs.map(([id, lbl, n]: any) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl}{n ? <span style={{ opacity: 0.7 }}> · {n}</span> : ''}</button>
            ))}
          </div>

          {tab === 'dashboard' && (<>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
              {[['Expired batches', ex.expired_batches ?? 0, ex.expired_batches ? T.red : T.green], ['Value at risk', money0(ex.expired_value_at_cost || 0), T.red], ['Expiring ≤30d', ex.expiring_30_days ?? 0, T.amber], ['Expiring ≤90d', ex.expiring_90_days ?? 0, T.blue], ["Today's sales", dash?.today?.sales ?? 0, T.accent.base], ["Today's revenue", money0(dash?.today?.revenue || 0), T.green]].map(([k, v, c]: any, i: number) => (
                <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '15px 18px', boxShadow: T.sh1, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c }} />
                  <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>{k}</div>
                  <div style={{ fontFamily: T.fMono, fontWeight: 500, fontSize: 24, color: T.ink, marginTop: 7 }}>{v}</div>
                </div>
              ))}
            </div>
            {ex.action_needed && <div style={{ padding: '12px 18px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 13, fontWeight: 600, marginBottom: 18 }}>⚠ {ex.action_needed}</div>}
            <Panel T={T} title="Expired — on shelves now" pad={false}>
              <table style={tbl}><thead><tr>{['Drug', 'Batch', 'Status', 'Qty', 'Value', ''].map((h, i) => <th key={i} style={th(T, i > 2)}>{h}</th>)}</tr></thead>
                <tbody>{expiryRows(exp.expired)}{exp.expired.length === 0 && <tr><td colSpan={6} style={empty(T)}>No expired stock 🎉</td></tr>}</tbody></table>
            </Panel>
          </>)}

          {tab === 'expiry' && (<>
            <div style={{ fontSize: 13, color: T.inkSub, marginBottom: 12 }}>Total value at risk: <b style={{ color: T.redText, fontFamily: T.fMono }}>{money(exp.total_value_at_risk || 0)}</b></div>
            <Panel T={T} pad={false}>
              <table style={tbl}><thead><tr>{['Drug', 'Batch', 'Status', 'Qty', 'Value', ''].map((h, i) => <th key={i} style={th(T, i > 2)}>{h}</th>)}</tr></thead>
                <tbody>{expiryRows([...exp.expired, ...exp.urgent_30d, ...exp.soon_90d])}{(exp.expired.length + exp.urgent_30d.length + exp.soon_90d.length) === 0 && <tr><td colSpan={6} style={empty(T)}>Nothing expiring within 90 days.</td></tr>}</tbody></table>
            </Panel>
          </>)}

          {tab === 'drugs' && (<>
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') reloadDrugs(); }} placeholder="Search by brand or generic name, then Enter…" style={{ width: '100%', maxWidth: 420, padding: '9px 12px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', marginBottom: 14 }} />
            <Panel T={T} pad={false}>
              <table style={tbl}><thead><tr>{['Drug', 'Generic', 'Form', 'Stock', 'Selling', ''].map((h, i) => <th key={i} style={th(T, i > 2)}>{h}</th>)}</tr></thead>
                <tbody>{drugs.map((d: any) => (
                  <tr key={d.id}>
                    <td style={td(T)}><b style={{ color: T.ink }}>{d.name}</b>{d.strength ? <span style={{ color: T.inkMute, fontSize: 11 }}> {d.strength}</span> : ''}{d.isPrescriptionDrug && <Badge T={T} tone="violet" style={{ marginLeft: 6 }}>Rx</Badge>}{d.sellByUnit && <Badge T={T} tone="blue" style={{ marginLeft: 6 }}>unit-sell</Badge>}</td>
                    <td style={td(T)}><span style={{ color: T.inkSub, fontSize: 12.5 }}>{d.genericName || '—'}</span></td>
                    <td style={td(T)}><span style={{ fontSize: 12.5, color: T.inkSub }}>{d.formulation || '—'}</span></td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{d.total_stock}</td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{money(d.sellingPrice)}{d.sellByUnit && d.unitPrice ? <span style={{ fontSize: 10.5, color: T.inkMute }}> · {money(d.unitPrice)}/{d.unitName || 'unit'}</span> : ''}</td>
                    <td style={{ ...td(T), textAlign: 'right' }}><button onClick={() => setEdit(d)} style={mini(T)}>Configure</button></td>
                  </tr>
                ))}{drugs.length === 0 && <tr><td colSpan={6} style={empty(T)}>No drugs found.</td></tr>}</tbody></table>
            </Panel>
          </>)}

          {tab === 'movers' && (
            <Panel T={T} pad={false}>
              <table style={tbl}><thead><tr>{['Drug', 'Sold', 'Daily velocity', 'On hand', 'Days left', 'Reorder'].map((h, i) => <th key={i} style={th(T, i > 0)}>{h}</th>)}</tr></thead>
                <tbody>{movers.map((m: any) => (
                  <tr key={m.id}>
                    <td style={td(T)}><b style={{ color: T.ink }}>{m.name}</b>{m.generic_name ? <span style={{ color: T.inkSub }}> · {m.generic_name}</span> : ''}</td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{m.qty_sold}</td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{Number(m.daily_velocity).toFixed(1)}/day</td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{m.stock_on_hand}</td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: m.reorder_urgency ? T.redText : T.inkSub }}>{m.days_of_stock_left == null ? '∞' : m.days_of_stock_left + 'd'}</td>
                    <td style={{ ...td(T), textAlign: 'right' }}>{m.reorder_urgency ? <Badge T={T} tone="red">Reorder now</Badge> : <span style={{ fontSize: 12, color: T.inkMute }}>OK</span>}</td>
                  </tr>
                ))}{movers.length === 0 && <tr><td colSpan={6} style={empty(T)}>No sales data yet.</td></tr>}</tbody></table>
            </Panel>
          )}
        </div>
      </div>
      {edit && <DrugConfig T={T} drug={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); show('Drug updated'); reloadDrugs(); }} toast={show} />}
      {node}
    </div>
  );
}

function DrugConfig({ T, drug, onClose, onSaved, toast }: { T: Theme; drug: any; onClose: () => void; onSaved: () => void; toast: (m: string) => void }) {
  const [f, setF] = useS<any>({
    genericName: drug.genericName || '', strength: drug.strength || '', formulation: drug.formulation || 'tablet',
    manufacturer: drug.manufacturer || '', isPrescriptionDrug: !!drug.isPrescriptionDrug,
    sellByUnit: !!drug.sellByUnit, packSize: drug.packSize || '', unitPrice: drug.unitPrice || '', unitName: drug.unitName || 'unit',
  });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    setBusy(true); setErr(null);
    try {
      await API.pharmacy.updateDrug(drug.id, {
        genericName: f.genericName || null, strength: f.strength || null, formulation: f.formulation || null,
        manufacturer: f.manufacturer || null, isPrescriptionDrug: f.isPrescriptionDrug,
        sellByUnit: f.sellByUnit, packSize: f.packSize ? Number(f.packSize) : null,
        unitPrice: f.unitPrice ? Number(f.unitPrice) : null, unitName: f.unitName || null,
      });
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title={`Configure · ${drug.name}`} subtitle="Drug fields & unit dispensing" width={560} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Generic name" full><TextField T={T} value={f.genericName} onChange={(v: any) => set('genericName', v)} placeholder="e.g. Paracetamol" /></Field>
        <Field T={T} label="Strength"><TextField T={T} value={f.strength} onChange={(v: any) => set('strength', v)} placeholder="e.g. 500mg" /></Field>
        <Field T={T} label="Formulation"><SelectField T={T} value={f.formulation} options={FORMULATIONS} onChange={(v: any) => set('formulation', v)} /></Field>
        <Field T={T} label="Manufacturer" full><TextField T={T} value={f.manufacturer} onChange={(v: any) => set('manufacturer', v)} placeholder="optional" /></Field>
      </FormGrid>
      <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
        <Toggle T={T} on={f.isPrescriptionDrug} onClick={() => set('isPrescriptionDrug', !f.isPrescriptionDrug)} label="Prescription (Rx) drug" />
        <Toggle T={T} on={f.sellByUnit} onClick={() => set('sellByUnit', !f.sellByUnit)} label="Sell by unit (partial packs)" />
      </div>
      {f.sellByUnit && (
        <FormGrid style={{ marginTop: 14 }}>
          <Field T={T} label="Pack size (units/pack)"><TextField T={T} type="number" value={f.packSize} onChange={(v: any) => set('packSize', v)} placeholder="e.g. 10" /></Field>
          <Field T={T} label="Unit price"><TextField T={T} type="number" value={f.unitPrice} onChange={(v: any) => set('unitPrice', v)} placeholder="0.00" /></Field>
          <Field T={T} label="Unit name"><TextField T={T} value={f.unitName} onChange={(v: any) => set('unitName', v)} placeholder="tablet" /></Field>
        </FormGrid>
      )}
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function Toggle({ T, on, onClick, label }: any) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <span style={{ width: 38, height: 22, borderRadius: 99, background: on ? T.accent.base : T.lineMid, position: 'relative', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.inkMid }}>{label}</span>
    </button>
  );
}

const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th = (T: Theme, right?: boolean): React.CSSProperties => ({ textAlign: right ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` });
const td = (T: Theme): React.CSSProperties => ({ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: T.inkMid });
const empty = (T: Theme): React.CSSProperties => ({ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 });
function mini(T: Theme, danger?: boolean): React.CSSProperties { return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${danger ? T.redSoft : T.line}`, background: danger ? T.redSoft : T.paper, color: danger ? T.redText : T.inkMid }; }
