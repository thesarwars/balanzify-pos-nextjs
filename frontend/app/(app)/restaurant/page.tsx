'use client';
// ─────────────────────────────────────────────────────────────────
// Restaurant suite — Tables, Service Staff, Modifiers, Kitchen.
// A paid add-on: shows a locked state unless the Restaurant module
// is enabled in Plan & Modules. Wired through API.restaurant.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useTheme } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useStateRs, useEffect: useEffectRs } = React;

export default function RestaurantPage() {
  const T = useTheme();
  return <Restaurant T={T} />;
}

function Restaurant({ T }: { T: Theme }) {
  const [enabled, setEnabled] = useStateRs<any>(null);   // null = loading
  const [tab, setTab] = useStateRs<any>('tables');
  const [tables, setTables] = useStateRs<any>([]);
  const [staff, setStaff] = useStateRs<any>([]);
  const [modifiers, setModifiers] = useStateRs<any>([]);
  const [kitchen, setKitchen] = useStateRs<any>([]);
  const [svcTypes, setSvcTypes] = useStateRs<any>([]);
  const [locs, setLocs] = useStateRs<any>([]);
  const [modal, setModal] = useStateRs<any>(null);
  const [show, node] = useToast();

  const reloadSvc = React.useCallback(() => { API.serviceType.list({ all: true }).then(setSvcTypes).catch(() => {}); }, []);
  const reloadAll = React.useCallback(() => {
    API.restaurant.tables().then(setTables).catch(() => {});
    API.restaurant.staff().then(setStaff).catch(() => {});
    API.restaurant.modifiers().then(setModifiers).catch(() => {});
    API.restaurant.kitchen().then(setKitchen).catch(() => {});
    reloadSvc();
  }, [reloadSvc]);
  useEffectRs(() => {
    API.module.list().then((ms: any) => { const on = (ms.find((m: any) => m.key === 'restaurant') || {}).enabled; setEnabled(!!on); }).catch(() => setEnabled(false));
    API.location.list().then(setLocs).catch(() => {});
  }, []);
  useEffectRs(() => { if (enabled) reloadAll(); }, [enabled, reloadAll]);

  async function enableModule() { await API.module.setEnabled('restaurant', true); setEnabled(true); show('Restaurant module enabled'); }

  if (enabled === false) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.paperAlt }}>
        <Topbar T={T} title="Restaurant" subtitle="Add-on module" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 380 }}>
            <div style={{ width: 76, height: 76, borderRadius: 20, background: T.accent.soft, color: T.accent.base, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, margin: '0 auto 20px' }}>♨</div>
            <div style={{ fontFamily: T.fDisplay, fontSize: 24, fontWeight: T.dispWeight, color: T.ink, marginBottom: 8 }}>Restaurant module</div>
            <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6, marginBottom: 22 }}>Tables, service staff, modifiers and a live kitchen display. This is a paid add-on ($19/mo) — enable it to start.</div>
            <Btn T={T} kind="accent" onClick={enableModule}>Enable Restaurant · $19/mo</Btn>
          </div>
        </div>
        {node}
      </div>
    );
  }
  if (enabled === null) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paperAlt, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>;

  const tabs = [['tables', 'Tables', tables.length], ['staff', 'Service Staff', staff.length], ['modifiers', 'Modifiers', modifiers.length], ['kitchen', 'Kitchen', kitchen.filter((k: any) => k.status !== 'served').length], ['servicetypes', 'Service Types', svcTypes.length]];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Restaurant" subtitle="Tables · staff · modifiers · kitchen"
        right={tab === 'tables' ? <Btn T={T} kind="accent" onClick={() => setModal('table')}>+ Add Table</Btn>
          : tab === 'staff' ? <Btn T={T} kind="accent" onClick={() => setModal('staff')}>+ Add Staff</Btn>
          : tab === 'modifiers' ? <Btn T={T} kind="accent" onClick={() => setModal('modifier')}>+ Add Modifier Set</Btn>
          : tab === 'servicetypes' ? <Btn T={T} kind="accent" onClick={() => setModal('servicetype')}>+ Add Service Type</Btn> : null} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
            {tabs.map(([id, lbl, n]: any) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl} <span style={{ opacity: 0.7 }}>· {n}</span></button>
            ))}
          </div>

          {/* TABLES */}
          {tab === 'tables' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
              {tables.map((t: any) => {
                const occ = t.status === 'occupied';
                return (
                  <div key={t.id} style={{ background: occ ? T.accent.soft : T.card, border: `1.5px solid ${occ ? T.accent.base : T.line}`, borderRadius: T.rLg, padding: 18, textAlign: 'center', boxShadow: T.sh1 }}>
                    <div style={{ fontSize: 26, color: occ ? T.accent.base : T.inkMute, marginBottom: 6 }}>◳</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: T.inkSub, marginBottom: 10 }}>{t.seats} seats · {t.location_name}</div>
                    <button onClick={() => API.restaurant.setTable(t.id, { status: occ ? 'free' : 'occupied' }).then(() => API.restaurant.tables().then(setTables))} style={{ width: '100%', padding: '6px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 11.5, fontWeight: 700, background: occ ? T.accent.base : T.green, color: '#fff' }}>{occ ? 'Occupied' : 'Free'}</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* SERVICE STAFF */}
          {tab === 'staff' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['Staff', 'l'], ['Location', 'l'], ['PIN', 'l'], ['', 'r']].map(([h, a]: any, i: any) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {staff.map((s: any) => (
                    <tr key={s.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{s.name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{s.location_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 13, color: T.ink, letterSpacing: 2 }}>•••• <span style={{ color: T.inkMute, fontSize: 11 }}>({s.pin})</span></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}><button onClick={() => API.restaurant.removeStaff(s.id).then(() => API.restaurant.staff().then(setStaff))} style={rsMini(T, true)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {/* MODIFIERS */}
          {tab === 'modifiers' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {modifiers.map((m: any) => (
                <div key={m.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: 18, boxShadow: T.sh1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{m.name}</span>
                    <button onClick={() => API.restaurant.removeModifier(m.id).then(() => API.restaurant.modifiers().then(setModifiers))} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                  {m.options.map((o: any, i: any) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? `1px solid ${T.line}` : 'none', fontSize: 12.5 }}>
                      <span style={{ color: T.inkMid }}>{o.name}</span><span style={{ fontFamily: T.fMono, color: o.price ? T.ink : T.inkMute }}>{o.price ? '+' + money(o.price) : 'free'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* KITCHEN */}
          {tab === 'kitchen' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {kitchen.filter((k: any) => k.status !== 'served').length === 0 && <div style={{ gridColumn: '1/-1', padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No active kitchen orders.</div>}
              {kitchen.filter((k: any) => k.status !== 'served').map((o: any) => {
                const ready = o.status === 'ready';
                return (
                  <div key={o.id} style={{ background: T.card, border: `1.5px solid ${ready ? T.green : T.amber}55`, borderRadius: T.rLg, overflow: 'hidden', boxShadow: T.sh1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: ready ? T.greenSoft : T.amberSoft }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: ready ? T.greenText : T.amberText }}>{o.table}</span>
                      <span style={{ fontSize: 11, fontFamily: T.fMono, color: ready ? T.greenText : T.amberText }}>{o.time}</span>
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      {o.items.map((it: any, i: any) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', color: T.ink }}><span>{it.name}</span><span style={{ fontFamily: T.fMono, fontWeight: 700 }}>×{it.qty}</span></div>)}
                      <div style={{ fontSize: 11, color: T.inkSub, marginTop: 8 }}>Server: {o.staff}</div>
                      <button onClick={() => API.restaurant.setKitchen(o.id, ready ? 'served' : 'ready').then(() => API.restaurant.kitchen().then(setKitchen))} style={{ width: '100%', marginTop: 10, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: 700, background: ready ? T.green : T.accent.base, color: '#fff' }}>{ready ? 'Mark served' : 'Mark ready'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SERVICE TYPES */}
          {tab === 'servicetypes' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['Service type', 'l'], ['Packing charge', 'l'], ['Status', 'l'], ['', 'r']].map(([h, a]: any, i: any) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {svcTypes.map((s: any) => (
                    <tr key={s.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{s.name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub, fontFamily: T.fMono }}>{s.packing_charge ? (s.packing_charge_type === 'percentage' ? s.packing_charge + '%' : money(s.packing_charge)) : '—'}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><button onClick={() => API.serviceType.update(s.id, { enabled: !s.enabled }).then(reloadSvc)} style={{ cursor: 'pointer', border: 'none', background: 'none', fontSize: 12.5, fontWeight: 600, color: s.enabled ? T.greenText : T.inkMute }}>{s.enabled ? '● Enabled' : '○ Disabled'}</button></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}><button onClick={() => API.serviceType.remove(s.id).then(reloadSvc)} style={rsMini(T, true)}>Remove</button></td>
                    </tr>
                  ))}
                  {svcTypes.length === 0 && <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No service types.</td></tr>}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      </div>

      {modal === 'servicetype' && <RsAdd T={T} title="Add service type" fields={[['name', 'Name', 'text'], ['packing_charge', 'Packing charge', 'number']]} onClose={() => setModal(null)} onSave={async (f: any) => { await API.serviceType.create({ name: f.name, packing_charge: f.packing_charge, packing_charge_type: 'fixed' }); setModal(null); show('Service type added'); reloadSvc(); }} />}
      {modal === 'table' && <RsAdd T={T} title="Add table" fields={[['name', 'Table name', 'text'], ['seats', 'Seats', 'number']]} extra={{ loc: locs }} onClose={() => setModal(null)} onSave={async (f: any) => { await API.restaurant.addTable({ name: f.name, seats: f.seats, location_id: f.location_id }); setModal(null); show('Table added'); API.restaurant.tables().then(setTables); }} />}
      {modal === 'staff' && <RsAdd T={T} title="Add service staff" fields={[['name', 'Name', 'text'], ['pin', 'PIN (4 digits)', 'text']]} extra={{ loc: locs }} onClose={() => setModal(null)} onSave={async (f: any) => { await API.restaurant.addStaff({ name: f.name, pin: f.pin, location_id: f.location_id }); setModal(null); show('Staff added'); API.restaurant.staff().then(setStaff); }} />}
      {modal === 'modifier' && <ModifierAdd T={T} onClose={() => setModal(null)} onSave={async (body: any) => { await API.restaurant.addModifier(body); setModal(null); show('Modifier set added'); API.restaurant.modifiers().then(setModifiers); }} />}
      {node}
    </div>
  );
}

function RsAdd({ T, title, fields, extra, onClose, onSave }: { T: Theme; title: string; fields: any; extra?: any; onClose: () => void; onSave: (f: any) => any }) {
  const [f, setF] = useStateRs<any>({ location_id: (extra && extra.loc && extra.loc[0] || {}).id || 1 });
  const [busy, setBusy] = useStateRs(false);
  return (
    <Modal T={T} title={title} width={420} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { setBusy(true); try { await onSave(f); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid>
        {fields.map(([k, lbl, type]: any) => <Field key={k} T={T} label={lbl} full><TextField T={T} type={type} value={f[k] || ''} onChange={(v: any) => setF((s: any) => ({ ...s, [k]: v }))} /></Field>)}
        {extra && extra.loc && <Field T={T} label="Location" full><SelectField T={T} value={String(f.location_id)} options={extra.loc.map((l: any) => String(l.id))} onChange={(v: any) => setF((s: any) => ({ ...s, location_id: Number(v) }))} render={(v: any) => (extra.loc.find((l: any) => String(l.id) === v) || {}).name} /></Field>}
      </FormGrid>
    </Modal>
  );
}

function ModifierAdd({ T, onClose, onSave }: { T: Theme; onClose: () => void; onSave: (body: any) => any }) {
  const [name, setName] = useStateRs('');
  const [opts, setOpts] = useStateRs<any>([{ name: '', price: '' }]);
  const [busy, setBusy] = useStateRs(false);
  const setOpt = (i: any, k: any, v: any) => setOpts((o: any) => o.map((x: any, j: any) => j === i ? { ...x, [k]: v } : x));
  return (
    <Modal T={T} title="Add modifier set" subtitle="e.g. Add-ons, Spice level" width={460} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { if (!name.trim()) return; setBusy(true); try { await onSave({ name, options: opts }); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <Field T={T} label="Set name" full><TextField T={T} value={name} onChange={setName} placeholder="e.g. Add-ons" /></Field>
      <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: T.inkSub, marginBottom: 8 }}>OPTIONS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {opts.map((o: any, i: any) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <input value={o.name} onChange={e => setOpt(i, 'name', e.target.value)} placeholder="Option name" style={{ flex: 1, padding: '8px 10px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none' }} />
            <input type="number" value={o.price} onChange={e => setOpt(i, 'price', e.target.value)} placeholder="0.00" style={{ width: 80, padding: '8px 10px', fontSize: 12.5, fontFamily: T.fMono, textAlign: 'right', color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none' }} />
          </div>
        ))}
        <button onClick={() => setOpts((o: any) => [...o, { name: '', price: '' }])} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: T.accent.text, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: T.fBody }}>+ Add option</button>
      </div>
    </Modal>
  );
}

function rsMini(T: any, danger: any): React.CSSProperties { return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${danger ? T.redSoft : T.line}`, background: danger ? T.redSoft : T.paper, color: danger ? T.redText : T.inkMid }; }
