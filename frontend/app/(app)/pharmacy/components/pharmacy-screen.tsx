'use client';
// ─────────────────────────────────────────────────────────────────
// Pharmacy — expiry-loss prevention dashboard, expiry report with
// pull-expired write-off, drug catalog (add + configure: generic/
// strength/formulation, unit selling, controlled schedule), batch
// receiving (expiry input), prescriptions (create + dispense), and
// fast movers / reorder. A paid add-on. Wired through API.pharmacy.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useS, useEffect: useE, useCallback: useCb } = React;
const FORMULATIONS = ['tablet', 'capsule', 'syrup', 'suspension', 'injection', 'cream', 'ointment', 'drops', 'inhaler', 'suppository', 'other'];
const SCHEDULES = ['none', 'C-II', 'C-III', 'C-IV', 'C-V'];
const expTone: any = { EXPIRED: 'red', URGENT: 'amber', SOON: 'blue', OK: 'gray' };
const rxStatusTone: any = { active: 'green', completed: 'gray', cancelled: 'red', expired: 'amber' };

export function Pharmacy({ T }: { T: Theme }) {
  const [enabled, setEnabled] = useS<any>(null);   // null = loading
  const [tab, setTab] = useS<any>('dashboard');
  const [dash, setDash] = useS<any>(null);
  const [exp, setExp] = useS<any>({ expired: [], urgent_30d: [], soon_90d: [], total_value_at_risk: 0 });
  const [drugs, setDrugs] = useS<any[]>([]);
  const [movers, setMovers] = useS<any[]>([]);
  const [rxList, setRxList] = useS<any[]>([]);
  const [q, setQ] = useS('');
  const [edit, setEdit] = useS<any>(null);
  const [modal, setModal] = useS<any>(null);   // 'newDrug' | 'receiveBatch' | 'newRx'
  const [dispenseRx, setDispenseRx] = useS<any>(null);
  const [show, node] = useToast();

  useE(() => { API.module.list().then((ms: any) => setEnabled(!!(ms.find((m: any) => m.key === 'pharmacy') || {}).enabled)).catch(() => setEnabled(false)); }, []);
  const reloadExpiry = useCb(() => API.pharmacy.expiry().then(setExp).catch(() => {}), []);
  const reloadDrugs = useCb(() => API.pharmacy.drugs(q).then(setDrugs).catch(() => {}), [q]);
  const reloadRx = useCb(() => API.pharmacy.prescriptions().then(setRxList).catch(() => {}), []);
  useE(() => {
    if (!enabled) return;
    API.pharmacy.dashboard().then(setDash).catch(() => {});
    reloadExpiry();
    API.pharmacy.fastMovers().then(setMovers).catch(() => {});
  }, [enabled, reloadExpiry]);
  useE(() => { if (enabled && tab === 'drugs') reloadDrugs(); }, [enabled, tab, reloadDrugs]);
  useE(() => { if (enabled && tab === 'prescriptions') reloadRx(); }, [enabled, tab, reloadRx]);

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
          <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6, marginBottom: 22 }}>Cut expired-stock losses: expiry exposure dashboard, pull-expired write-offs, drug catalog with unit dispensing, batch receiving, prescriptions, and fast-mover reorder. Paid add-on ($15/mo).</div>
          <Btn T={T} kind="accent" onClick={enableModule}>Enable Pharmacy · $15/mo</Btn>
        </div>
      </div>
      {node}
    </div>
  );

  const tabs = [['dashboard', 'Dashboard'], ['expiry', 'Expiry', exp.expired.length + exp.urgent_30d.length], ['drugs', 'Drug catalog'], ['prescriptions', 'Prescriptions'], ['movers', 'Fast movers']];
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: T.inkSub }}>Total value at risk: <b style={{ color: T.redText, fontFamily: T.fMono }}>{money(exp.total_value_at_risk || 0)}</b></div>
              <Btn T={T} kind="accent" onClick={() => setModal('receiveBatch')}>+ Receive batch</Btn>
            </div>
            <Panel T={T} pad={false}>
              <table style={tbl}><thead><tr>{['Drug', 'Batch', 'Status', 'Qty', 'Value', ''].map((h, i) => <th key={i} style={th(T, i > 2)}>{h}</th>)}</tr></thead>
                <tbody>{expiryRows([...exp.expired, ...exp.urgent_30d, ...exp.soon_90d])}{(exp.expired.length + exp.urgent_30d.length + exp.soon_90d.length) === 0 && <tr><td colSpan={6} style={empty(T)}>Nothing expiring within 90 days.</td></tr>}</tbody></table>
            </Panel>
          </>)}

          {tab === 'drugs' && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') reloadDrugs(); }} placeholder="Search by brand or generic name, then Enter…" style={{ flex: 1, minWidth: 240, maxWidth: 420, padding: '9px 12px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none' }} />
              <Btn T={T} kind="accent" onClick={() => setModal('newDrug')}>+ New drug</Btn>
            </div>
            <Panel T={T} pad={false}>
              <table style={tbl}><thead><tr>{['Drug', 'Generic', 'Form', 'Stock', 'Selling', ''].map((h, i) => <th key={i} style={th(T, i > 2)}>{h}</th>)}</tr></thead>
                <tbody>{drugs.map((d: any) => (
                  <tr key={d.id}>
                    <td style={td(T)}><b style={{ color: T.ink }}>{d.name}</b>{d.strength ? <span style={{ color: T.inkMute, fontSize: 11 }}> {d.strength}</span> : ''}{d.isPrescriptionDrug && <Badge T={T} tone="violet" style={{ marginLeft: 6 }}>Rx</Badge>}{d.controlledSchedule && <Badge T={T} tone="red" style={{ marginLeft: 6 }}>{d.controlledSchedule}</Badge>}{d.sellByUnit && <Badge T={T} tone="blue" style={{ marginLeft: 6 }}>unit-sell</Badge>}</td>
                    <td style={td(T)}><span style={{ color: T.inkSub, fontSize: 12.5 }}>{d.genericName || '—'}</span></td>
                    <td style={td(T)}><span style={{ fontSize: 12.5, color: T.inkSub }}>{d.formulation || '—'}</span></td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{d.total_stock}</td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{money(d.sellingPrice)}{d.sellByUnit && d.unitPrice ? <span style={{ fontSize: 10.5, color: T.inkMute }}> · {money(d.unitPrice)}/{d.unitName || 'unit'}</span> : ''}</td>
                    <td style={{ ...td(T), textAlign: 'right' }}><button onClick={() => setEdit(d)} style={mini(T)}>Configure</button></td>
                  </tr>
                ))}{drugs.length === 0 && <tr><td colSpan={6} style={empty(T)}>No drugs yet — use “+ New drug” to add one.</td></tr>}</tbody></table>
            </Panel>
          </>)}

          {tab === 'prescriptions' && (<>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: T.inkSub }}>Clinical records an Rx drug is dispensed against.</div>
              <Btn T={T} kind="accent" onClick={() => setModal('newRx')}>+ New prescription</Btn>
            </div>
            <Panel T={T} pad={false}>
              <table style={tbl}><thead><tr>{['Rx #', 'Patient', 'Drug', 'Qty', 'Refills left', 'Status', ''].map((h, i) => <th key={i} style={th(T, i === 3)}>{h}</th>)}</tr></thead>
                <tbody>{rxList.map((r: any) => {
                  const left = Math.max(0, 1 + (r.refillsAuthorized || 0) - (r.refillsUsed || 0));
                  return (
                    <tr key={r.id}>
                      <td style={td(T)}><span style={{ fontFamily: T.fMono, fontSize: 12 }}>{r.rxNumber}</span></td>
                      <td style={td(T)}><b style={{ color: T.ink }}>{r.patientName}</b></td>
                      <td style={td(T)}>{r.product?.name || '—'}{r.product?.controlledSchedule && <Badge T={T} tone="red" style={{ marginLeft: 6 }}>{r.product.controlledSchedule}</Badge>}</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{r.quantity}</td>
                      <td style={td(T)}><span style={{ fontFamily: T.fMono }}>{left}</span></td>
                      <td style={td(T)}><Badge T={T} tone={rxStatusTone[r.status] || 'gray'}>{r.status}</Badge></td>
                      <td style={{ ...td(T), textAlign: 'right' }}>{r.status === 'active' && left > 0 && <button onClick={() => setDispenseRx(r)} style={mini(T)}>Dispense</button>}</td>
                    </tr>
                  );
                })}{rxList.length === 0 && <tr><td colSpan={7} style={empty(T)}>No prescriptions yet.</td></tr>}</tbody></table>
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

      {edit && <DrugConfig T={T} drug={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); show('Drug updated'); reloadDrugs(); }} />}
      {modal === 'newDrug' && <NewDrugModal T={T} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Drug added'); reloadDrugs(); }} />}
      {modal === 'receiveBatch' && <ReceiveBatchModal T={T} onClose={() => setModal(null)} onSaved={(msg: string) => { setModal(null); show(msg); reloadExpiry(); API.pharmacy.dashboard().then(setDash); }} />}
      {modal === 'newRx' && <NewPrescriptionModal T={T} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Prescription created'); reloadRx(); }} />}
      {dispenseRx && <DispenseModal T={T} rx={dispenseRx} onClose={() => setDispenseRx(null)} onDone={(msg: string) => { setDispenseRx(null); show(msg); reloadRx(); }} />}
      {node}
    </div>
  );
}

// ── Drug picker (search + select) — shared by batch & prescription modals ──
function DrugPicker({ T, selected, onPick }: { T: Theme; selected: any; onPick: (d: any) => void }) {
  const [q, setQ] = useS('');
  const [opts, setOpts] = useS<any[]>([]);
  useE(() => {
    if (selected) return;
    let on = true;
    const id = setTimeout(() => { API.pharmacy.drugs(q).then((ds: any[]) => { if (on) setOpts(ds); }).catch(() => {}); }, 200);
    return () => { on = false; clearTimeout(id); };
  }, [q, selected]);
  if (selected) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paperAlt }}>
      <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{selected.name}{selected.strength ? ` ${selected.strength}` : ''}</span>
      <button onClick={() => onPick(null)} style={mini(T)}>Change</button>
    </div>
  );
  return (
    <div>
      <TextField T={T} value={q} onChange={setQ} placeholder="Search drug by name…" />
      {opts.length > 0 && (
        <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto', border: `1px solid ${T.line}`, borderRadius: T.r }}>
          {opts.slice(0, 20).map((d: any) => (
            <button key={d.id} onClick={() => onPick(d)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: `1px solid ${T.line}`, background: 'transparent', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, color: T.ink }}>
              {d.name}{d.strength ? <span style={{ color: T.inkMute }}> {d.strength}</span> : ''}{d.genericName ? <span style={{ color: T.inkSub, fontSize: 11.5 }}> · {d.genericName}</span> : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrBox({ T, err }: { T: Theme; err: any }) {
  if (!err) return null;
  return <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>;
}

function DrugConfig({ T, drug, onClose, onSaved }: { T: Theme; drug: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useS<any>({
    genericName: drug.genericName || '', strength: drug.strength || '', formulation: drug.formulation || 'tablet',
    manufacturer: drug.manufacturer || '', barcode: drug.barcode || '',
    isPrescriptionDrug: !!drug.isPrescriptionDrug, controlledSchedule: drug.controlledSchedule || 'none',
    reorderPoint: drug.reorderPoint ?? '',
    sellByUnit: !!drug.sellByUnit, packSize: drug.packSize || '', unitPrice: drug.unitPrice || '', unitName: drug.unitName || 'unit',
  });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    setBusy(true); setErr(null);
    try {
      await API.pharmacy.updateDrug(drug.id, {
        genericName: f.genericName || null, strength: f.strength || null, formulation: f.formulation || null,
        manufacturer: f.manufacturer || null, barcode: f.barcode || null,
        isPrescriptionDrug: f.isPrescriptionDrug, controlledSchedule: f.controlledSchedule === 'none' ? null : f.controlledSchedule,
        reorderPoint: f.reorderPoint === '' ? undefined : Number(f.reorderPoint),
        sellByUnit: f.sellByUnit, packSize: f.packSize ? Number(f.packSize) : null,
        unitPrice: f.unitPrice ? Number(f.unitPrice) : null, unitName: f.unitName || null,
      });
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title={`Configure · ${drug.name}`} subtitle="Drug fields, controlled schedule & unit dispensing" width={580} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Generic name" full><TextField T={T} value={f.genericName} onChange={(v: any) => set('genericName', v)} placeholder="e.g. Paracetamol" /></Field>
        <Field T={T} label="Strength"><TextField T={T} value={f.strength} onChange={(v: any) => set('strength', v)} placeholder="e.g. 500mg" /></Field>
        <Field T={T} label="Formulation"><SelectField T={T} value={f.formulation} options={FORMULATIONS} onChange={(v: any) => set('formulation', v)} /></Field>
        <Field T={T} label="Manufacturer"><TextField T={T} value={f.manufacturer} onChange={(v: any) => set('manufacturer', v)} placeholder="optional" /></Field>
        <Field T={T} label="Barcode"><TextField T={T} value={f.barcode} onChange={(v: any) => set('barcode', v)} placeholder="optional" /></Field>
        <Field T={T} label="Controlled schedule"><SelectField T={T} value={f.controlledSchedule} options={SCHEDULES} onChange={(v: any) => set('controlledSchedule', v)} render={(o: any) => o === 'none' ? 'Not controlled' : o} /></Field>
        <Field T={T} label="Reorder point"><TextField T={T} type="number" value={f.reorderPoint} onChange={(v: any) => set('reorderPoint', v)} placeholder="0" /></Field>
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
      <ErrBox T={T} err={err} />
    </Modal>
  );
}

function NewDrugModal({ T, onClose, onSaved }: { T: Theme; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useS<any>({ name: '', genericName: '', strength: '', formulation: 'tablet', manufacturer: '', barcode: '', sellingPrice: '', costPrice: '', isPrescriptionDrug: false, controlledSchedule: 'none', reorderPoint: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.name.trim()) { setErr('Drug name is required.'); return; }
    setBusy(true); setErr(null);
    try {
      await API.pharmacy.createDrug({
        name: f.name.trim(), genericName: f.genericName || null, strength: f.strength || null,
        formulation: f.formulation, manufacturer: f.manufacturer || null, barcode: f.barcode || null,
        sellingPrice: f.sellingPrice ? Number(f.sellingPrice) : 0, costPrice: f.costPrice ? Number(f.costPrice) : 0,
        isPrescriptionDrug: f.isPrescriptionDrug, controlledSchedule: f.controlledSchedule === 'none' ? null : f.controlledSchedule,
        reorderPoint: f.reorderPoint ? Number(f.reorderPoint) : 0,
      });
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not create.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="New drug" subtitle="Add a drug to the catalog" width={580} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Adding…' : 'Add drug'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Name (brand)" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. Panadol" /></Field>
        <Field T={T} label="Generic name"><TextField T={T} value={f.genericName} onChange={(v: any) => set('genericName', v)} placeholder="e.g. Paracetamol" /></Field>
        <Field T={T} label="Strength"><TextField T={T} value={f.strength} onChange={(v: any) => set('strength', v)} placeholder="e.g. 500mg" /></Field>
        <Field T={T} label="Formulation"><SelectField T={T} value={f.formulation} options={FORMULATIONS} onChange={(v: any) => set('formulation', v)} /></Field>
        <Field T={T} label="Manufacturer"><TextField T={T} value={f.manufacturer} onChange={(v: any) => set('manufacturer', v)} placeholder="optional" /></Field>
        <Field T={T} label="Barcode"><TextField T={T} value={f.barcode} onChange={(v: any) => set('barcode', v)} placeholder="optional" /></Field>
        <Field T={T} label="Selling price"><TextField T={T} type="number" value={f.sellingPrice} onChange={(v: any) => set('sellingPrice', v)} placeholder="0.00" /></Field>
        <Field T={T} label="Cost price"><TextField T={T} type="number" value={f.costPrice} onChange={(v: any) => set('costPrice', v)} placeholder="0.00" /></Field>
        <Field T={T} label="Reorder point"><TextField T={T} type="number" value={f.reorderPoint} onChange={(v: any) => set('reorderPoint', v)} placeholder="0" /></Field>
        <Field T={T} label="Controlled schedule"><SelectField T={T} value={f.controlledSchedule} options={SCHEDULES} onChange={(v: any) => set('controlledSchedule', v)} render={(o: any) => o === 'none' ? 'Not controlled' : o} /></Field>
      </FormGrid>
      <div style={{ marginTop: 14 }}>
        <Toggle T={T} on={f.isPrescriptionDrug} onClick={() => set('isPrescriptionDrug', !f.isPrescriptionDrug)} label="Prescription (Rx) drug" />
      </div>
      <ErrBox T={T} err={err} />
    </Modal>
  );
}

function ReceiveBatchModal({ T, onClose, onSaved }: { T: Theme; onClose: () => void; onSaved: (msg: string) => void }) {
  const [drug, setDrug] = useS<any>(null);
  const [locs, setLocs] = useS<any[]>([]); const [locId, setLocId] = useS('');
  const [f, setF] = useS<any>({ batch_number: '', quantity: '', cost_price: '', expiry_date: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  useE(() => { API.location.list().then((ls: any[]) => { setLocs(ls); if (ls && ls[0]) setLocId(String(ls[0].id)); }).catch(() => {}); }, []);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!drug) { setErr('Pick a drug.'); return; }
    if (!locId) { setErr('Pick a location.'); return; }
    if (!f.quantity || Number(f.quantity) <= 0) { setErr('Enter a quantity.'); return; }
    setBusy(true); setErr(null);
    try {
      const r: any = await API.pharmacy.receiveBatch({ product_id: drug.id, location_id: locId, batch_number: f.batch_number || null, quantity: Number(f.quantity), cost_price: f.cost_price ? Number(f.cost_price) : 0, expiry_date: f.expiry_date || null });
      onSaved(r.message || 'Batch received');
    } catch (e: any) { setErr(e.message || 'Could not receive batch.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="Receive batch" subtitle="Take stock in with its expiry date" width={560} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Receiving…' : 'Receive'}</Btn></>}>
      <Field T={T} label="Drug" full><DrugPicker T={T} selected={drug} onPick={setDrug} /></Field>
      <FormGrid style={{ marginTop: 14 }}>
        <Field T={T} label="Location"><SelectField T={T} value={locId} options={locs.map((l: any) => String(l.id))} onChange={setLocId} render={(id: any) => (locs.find((l: any) => String(l.id) === id) || {}).name || id} /></Field>
        <Field T={T} label="Batch number"><TextField T={T} value={f.batch_number} onChange={(v: any) => set('batch_number', v)} placeholder="optional" /></Field>
        <Field T={T} label="Quantity"><TextField T={T} type="number" value={f.quantity} onChange={(v: any) => set('quantity', v)} placeholder="0" /></Field>
        <Field T={T} label="Cost price (per unit)"><TextField T={T} type="number" value={f.cost_price} onChange={(v: any) => set('cost_price', v)} placeholder="0.00" /></Field>
        <Field T={T} label="Expiry date" full><TextField T={T} type="date" value={f.expiry_date} onChange={(v: any) => set('expiry_date', v)} /></Field>
      </FormGrid>
      <ErrBox T={T} err={err} />
    </Modal>
  );
}

function NewPrescriptionModal({ T, onClose, onSaved }: { T: Theme; onClose: () => void; onSaved: () => void }) {
  const [drug, setDrug] = useS<any>(null);
  const [f, setF] = useS<any>({ patient_name: '', patient_phone: '', prescriber_name: '', prescriber_reg: '', sig: '', quantity: '', refills_authorized: '0' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!drug) { setErr('Pick a drug.'); return; }
    if (!f.patient_name.trim()) { setErr('Patient name is required.'); return; }
    if (!f.prescriber_name.trim()) { setErr('Prescriber name is required.'); return; }
    if (!f.quantity || Number(f.quantity) <= 0) { setErr('Enter a quantity.'); return; }
    setBusy(true); setErr(null);
    try {
      await API.pharmacy.createPrescription({
        product_id: drug.id, patient_name: f.patient_name.trim(), patient_phone: f.patient_phone || null,
        prescriber_name: f.prescriber_name.trim(), prescriber_reg: f.prescriber_reg || null, sig: f.sig || null,
        quantity: Number(f.quantity), refills_authorized: Number(f.refills_authorized || 0),
      });
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not create.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="New prescription" subtitle="Patient, prescriber & drug" width={580} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Create'}</Btn></>}>
      <Field T={T} label="Drug" full><DrugPicker T={T} selected={drug} onPick={setDrug} /></Field>
      <FormGrid style={{ marginTop: 14 }}>
        <Field T={T} label="Patient name"><TextField T={T} value={f.patient_name} onChange={(v: any) => set('patient_name', v)} placeholder="Full name" /></Field>
        <Field T={T} label="Patient phone"><TextField T={T} value={f.patient_phone} onChange={(v: any) => set('patient_phone', v)} placeholder="optional" /></Field>
        <Field T={T} label="Prescriber name"><TextField T={T} value={f.prescriber_name} onChange={(v: any) => set('prescriber_name', v)} placeholder="Dr. …" /></Field>
        <Field T={T} label="Prescriber reg #"><TextField T={T} value={f.prescriber_reg} onChange={(v: any) => set('prescriber_reg', v)} placeholder="optional" /></Field>
        <Field T={T} label="Quantity"><TextField T={T} type="number" value={f.quantity} onChange={(v: any) => set('quantity', v)} placeholder="0" /></Field>
        <Field T={T} label="Refills authorized"><TextField T={T} type="number" value={f.refills_authorized} onChange={(v: any) => set('refills_authorized', v)} placeholder="0" /></Field>
        <Field T={T} label="Directions (sig)" full><TextField T={T} value={f.sig} onChange={(v: any) => set('sig', v)} placeholder="e.g. 1 tablet twice daily after food" /></Field>
      </FormGrid>
      <ErrBox T={T} err={err} />
    </Modal>
  );
}

function DispenseModal({ T, rx, onClose, onDone }: { T: Theme; rx: any; onClose: () => void; onDone: (msg: string) => void }) {
  const controlled = !!(rx.product && rx.product.controlledSchedule);
  const [locs, setLocs] = useS<any[]>([]); const [locId, setLocId] = useS('');
  const [users, setUsers] = useS<any[]>([]); const [verifiedBy, setVerifiedBy] = useS('');
  const [qty, setQty] = useS<any>(String(rx.quantity || ''));
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  useE(() => {
    API.location.list().then((ls: any[]) => { setLocs(ls); if (ls && ls[0]) setLocId(String(ls[0].id)); }).catch(() => {});
    if (controlled) API.user.list().then((us: any[]) => setUsers(us || [])).catch(() => {});
  }, [controlled]);
  async function go() {
    if (!locId) { setErr('Pick a location.'); return; }
    if (controlled && !verifiedBy) { setErr('A second-person verifier is required for controlled substances.'); return; }
    setBusy(true); setErr(null);
    try {
      const r: any = await API.pharmacy.dispensePrescription(rx.id, { location_id: locId, quantity: qty ? Number(qty) : undefined, verified_by: controlled ? verifiedBy : undefined });
      onDone(r.message || 'Dispensed');
    } catch (e: any) { setErr(e.message || 'Could not dispense.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title={`Dispense · ${rx.rxNumber}`} subtitle={`${rx.patientName} · ${rx.product?.name || ''}`} width={520} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={go} disabled={busy}>{busy ? 'Dispensing…' : 'Dispense'}</Btn></>}>
      {controlled && <div style={{ padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, marginBottom: 14 }}>Controlled ({rx.product.controlledSchedule}) — a second-person verifier is required.</div>}
      <FormGrid>
        <Field T={T} label="Location (deduct stock from)"><SelectField T={T} value={locId} options={locs.map((l: any) => String(l.id))} onChange={setLocId} render={(id: any) => (locs.find((l: any) => String(l.id) === id) || {}).name || id} /></Field>
        <Field T={T} label="Quantity"><TextField T={T} type="number" value={qty} onChange={setQty} placeholder={String(rx.quantity || '')} /></Field>
        {controlled && <Field T={T} label="Verified by (2nd person)" full><SelectField T={T} value={verifiedBy} options={['', ...users.map((u: any) => String(u.id))]} onChange={setVerifiedBy} render={(id: any) => id === '' ? 'Select a verifier…' : (users.find((u: any) => String(u.id) === id) || {}).name || id} /></Field>}
      </FormGrid>
      <ErrBox T={T} err={err} />
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
