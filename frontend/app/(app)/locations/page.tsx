'use client';
// ─────────────────────────────────────────────────────────────────
// Locations — the manual's multi-location setup: invoice scheme,
// invoice layout, default selling-price group, per-location payment
// methods, and enable/disable with the "keep one active" rule.
// Wired through API.location + invoiceScheme/Layout/priceGroup.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useTheme } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useStateLo, useEffect: useEffectLo } = React;

// File-local stat strip helper (from the prototype's DataScreen.jsx).
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

export default function LocationsPage() {
  const T = useTheme();
  return <Locations T={T} />;
}

function Locations({ T }: { T: any }) {
  const [rows, setRows] = useStateLo<any[]>([]);
  const [loading, setLoading] = useStateLo(true);
  const [refs, setRefs] = useStateLo<any>({ schemes: [], layouts: [], groups: [], methods: [] });
  const [edit, setEdit] = useStateLo<any>(null);
  const [schemeMgr, setSchemeMgr] = useStateLo(false);
  const [show, node] = useToast();

  const reload = React.useCallback(() => {
    setLoading(true);
    API.location.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  const loadRefs = React.useCallback(() => {
    Promise.all([API.invoiceScheme.list(), API.invoiceLayout.list(), API.priceGroup.list(), API.paymentMethod.list()])
      .then(([schemes, layouts, groups, methods]) => setRefs({ schemes, layouts, groups, methods })).catch(() => {});
  }, []);
  useEffectLo(() => { reload(); }, [reload]);
  useEffectLo(() => { loadRefs(); }, [loadRefs]);

  const active = rows.filter((r: any) => r.status === 'active').length;
  const stockTotal = rows.reduce((s: any, r: any) => s + (r.stock || 0), 0);

  async function toggleStatus(l: any) {
    try { await API.location.setStatus(l.id, l.status === 'active' ? 'inactive' : 'active'); show(l.status === 'active' ? 'Location disabled' : 'Location enabled'); reload(); }
    catch (ex: any) { show(ex.message || 'Could not change status'); }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Business Locations" subtitle={`${rows.length} locations · ${active} active`}
        right={<>
          <Btn T={T} kind="ghost" onClick={() => setSchemeMgr(true)}>◷ Invoice Schemes</Btn>
          <Btn T={T} kind="accent" onClick={() => setEdit({ payment_methods: ['cash'], default_payment: 'cash', invoice_scheme_id: 1, invoice_layout_id: 1, price_group_id: 0, type: 'Retail' })}>+ Add Location</Btn>
        </>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <StatStrip T={T} stats={[['Locations', rows.length], ['Active', active], ['Total stock value', money0(stockTotal)]]} />
          {loading ? (
            <div style={{ padding: 50, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>GET /connector/api/business-location…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
              {rows.map((l: any) => (
                <div key={l.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, boxShadow: T.sh1, overflow: 'hidden', opacity: l.status === 'active' ? 1 : 0.72 }}>
                  <div style={{ padding: '16px 18px', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ fontFamily: T.fDisplay, fontSize: 18, fontWeight: T.dispWeight, color: T.ink }}>{l.name}</span>
                        <Badge T={T} tone={l.status === 'active' ? 'green' : 'gray'}>{l.status}</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: T.inkSub, marginTop: 3 }}>{l.type} · {l.landmark || l.city || '—'}</div>
                    </div>
                    <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: T.accent.soft, color: T.accent.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{l.type === 'Warehouse' ? '▢' : l.type === 'Kiosk' ? '◳' : '⌂'}</span>
                  </div>
                  <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {[['Manager', l.manager || '—'], ['Invoice scheme', l.scheme_name], ['Price group', l.price_group_name], ["Today's sales", money(l.sales || 0)]].map(([k, v]: any) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: T.inkSub }}>{k}</span><span style={{ fontWeight: 600, color: T.ink }}>{v}</span></div>
                    ))}
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
                      {(l.payment_methods || []).map((m: any) => <Badge key={m} T={T} tone={m === l.default_payment ? 'brass' : 'gray'}>{(refs.methods.find((x: any) => x.key === m) || { label: m }).label}{m === l.default_payment ? ' ★' : ''}</Badge>)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, padding: '0 18px 16px' }}>
                    <Btn T={T} kind="ghost" style={{ flex: 1 }} onClick={() => setEdit(l)}>Edit</Btn>
                    <Btn T={T} kind={l.status === 'active' ? 'ghost' : 'accent'} onClick={() => toggleStatus(l)}>{l.status === 'active' ? 'Disable' : 'Enable'}</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {edit && <LocationEditor T={T} loc={edit} refs={refs} onClose={() => setEdit(null)} onNewScheme={() => setSchemeMgr(true)} onSaved={() => { setEdit(null); show(edit.id ? 'Location updated' : 'Location created'); reload(); }} />}
      {schemeMgr && <SchemeManager T={T} schemes={refs.schemes} onClose={() => setSchemeMgr(false)} onChange={loadRefs} toast={show} />}
      {node}
    </div>
  );
}

// ── Location editor ─────────────────────────────────────────────────
function LocationEditor({ T, loc, refs, onClose, onSaved, onNewScheme }: { T: any; loc: any; refs: any; onClose: () => void; onSaved: () => void; onNewScheme: () => void }) {
  const editing = !!loc.id;
  const [f, setF] = useStateLo<any>({
    name: loc.name || '', type: loc.type || 'Retail', landmark: loc.landmark || '', city: loc.city || '', mobile: loc.mobile || '', manager: loc.manager || '',
    invoice_scheme_id: loc.invoice_scheme_id || 1, invoice_layout_id: loc.invoice_layout_id || 1, price_group_id: loc.price_group_id ?? 0,
    payment_methods: loc.payment_methods ? [...loc.payment_methods] : ['cash'], default_payment: loc.default_payment || 'cash',
  });
  const [busy, setBusy] = useStateLo(false);
  const [err, setErr] = useStateLo<any>(null);
  const set = (k: any, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const toggleMethod = (key: any) => setF((s: any) => {
    const has = s.payment_methods.includes(key);
    const pm = has ? s.payment_methods.filter((x: any) => x !== key) : [...s.payment_methods, key];
    const dp = has && s.default_payment === key ? (pm[0] || '') : s.default_payment;
    return { ...s, payment_methods: pm, default_payment: dp };
  });

  async function save() {
    if (!f.name.trim()) { setErr('Location name is required.'); return; }
    if (!f.payment_methods.length) { setErr('Enable at least one payment method.'); return; }
    setBusy(true); setErr(null);
    try { if (editing) await API.location.update(loc.id, f); else await API.location.create(f); onSaved(); }
    catch (ex: any) { setErr(ex.message || 'Could not save the location.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title={editing ? 'Edit location' : 'New location'} subtitle={editing ? loc.name : 'Add a store, kiosk or warehouse'} width={640} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create location'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Location name" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. Main Store" /></Field>
        <Field T={T} label="Type"><SelectField T={T} value={f.type} options={['Retail', 'Kiosk', 'Warehouse', 'Headquarters']} onChange={(v: any) => set('type', v)} /></Field>
        <Field T={T} label="Manager"><TextField T={T} value={f.manager} onChange={(v: any) => set('manager', v)} placeholder="Who runs it" /></Field>
        <Field T={T} label="Address / landmark" full><TextField T={T} value={f.landmark} onChange={(v: any) => set('landmark', v)} placeholder="Street, district" /></Field>
        <Field T={T} label="City"><TextField T={T} value={f.city} onChange={(v: any) => set('city', v)} placeholder="City" /></Field>
        <Field T={T} label="Mobile"><TextField T={T} value={f.mobile} onChange={(v: any) => set('mobile', v)} placeholder="+252 …" /></Field>
      </FormGrid>

      <div style={{ marginTop: 18, marginBottom: 10, fontSize: 12, fontWeight: 700, color: T.inkSub, letterSpacing: 0.3 }}>INVOICING</div>
      <FormGrid>
        <Field T={T} label="Invoice scheme">
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><SelectField T={T} value={String(f.invoice_scheme_id)} options={refs.schemes.map((s: any) => String(s.id))} onChange={(v: any) => set('invoice_scheme_id', Number(v))} render={(v: any) => { const s = refs.schemes.find((x: any) => String(x.id) === v) || {}; return s.name + (s.prefix ? ` (${s.prefix})` : ''); }} /></div>
            <button onClick={onNewScheme} title="Manage schemes" style={{ width: 40, borderRadius: T.r, border: `1.5px solid ${T.line}`, background: T.paper, color: T.accent.text, cursor: 'pointer', fontSize: 16 }}>+</button>
          </div>
        </Field>
        <Field T={T} label="Invoice layout"><SelectField T={T} value={String(f.invoice_layout_id)} options={refs.layouts.map((l: any) => String(l.id))} onChange={(v: any) => set('invoice_layout_id', Number(v))} render={(v: any) => (refs.layouts.find((x: any) => String(x.id) === v) || {}).name} /></Field>
        <Field T={T} label="Default selling price group" full><SelectField T={T} value={String(f.price_group_id)} options={refs.groups.map((g: any) => String(g.id))} onChange={(v: any) => set('price_group_id', Number(v))} render={(v: any) => (refs.groups.find((x: any) => String(x.id) === v) || {}).name} /></Field>
      </FormGrid>

      <div style={{ marginTop: 18, marginBottom: 10, fontSize: 12, fontWeight: 700, color: T.inkSub, letterSpacing: 0.3 }}>PAYMENT METHODS</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {refs.methods.map((m: any) => (
          <button key={m.key} onClick={() => toggleMethod(m.key)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 99, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: 600, background: f.payment_methods.includes(m.key) ? T.accent.soft : T.paper, border: `1.5px solid ${f.payment_methods.includes(m.key) ? T.accent.base : T.line}`, color: f.payment_methods.includes(m.key) ? T.accent.text : T.inkMid }}>
            <span style={{ fontSize: 11 }}>{f.payment_methods.includes(m.key) ? '✓' : '+'}</span>{m.label}
          </button>
        ))}
      </div>
      {f.payment_methods.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12.5, color: T.inkSub }}>Default method</span>
          <div style={{ width: 200 }}><SelectField T={T} value={f.default_payment} options={f.payment_methods} onChange={(v: any) => set('default_payment', v)} render={(v: any) => (refs.methods.find((m: any) => m.key === v) || { label: v }).label} /></div>
        </div>
      )}
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
    </Modal>
  );
}

// ── Invoice scheme manager ──────────────────────────────────────────
function SchemeManager({ T, schemes, onClose, onChange, toast }: { T: any; schemes: any; onClose: () => void; onChange: () => void; toast: (m: string) => void }) {
  const [f, setF] = useStateLo<any>({ name: '', prefix: '', start_number: 1, total_digits: 4 });
  const [busy, setBusy] = useStateLo(false);
  const set = (k: any, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function add() {
    if (!f.name.trim()) return;
    setBusy(true);
    try { await API.invoiceScheme.create(f); setF({ name: '', prefix: '', start_number: 1, total_digits: 4 }); onChange(); toast('Scheme added'); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }
  const sample = (s: any) => (s.prefix ? s.prefix : '') + String(s.start_number).padStart(s.total_digits, '0');
  return (
    <Modal T={T} title="Invoice Schemes" subtitle="Invoice number formats" width={540} onClose={onClose} footer={null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {schemes.map((s: any) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{s.name}{s.is_default && <Badge T={T} tone="gray" style={{ marginLeft: 7 }}>Default</Badge>}</div><div style={{ fontSize: 11, color: T.inkSub, marginTop: 2 }}>Next: <span style={{ fontFamily: T.fMono, color: T.inkMid }}>{sample(s)}</span></div></div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Scheme name</div><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. Branch 2" /></div>
          <div style={{ width: 90 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Prefix</div><TextField T={T} value={f.prefix} onChange={(v: any) => set('prefix', v)} placeholder="INV" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 10 }}>
          <div style={{ width: 110 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Start number</div><TextField T={T} type="number" value={f.start_number} onChange={(v: any) => set('start_number', +v)} /></div>
          <div style={{ width: 90 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Digits</div><TextField T={T} type="number" value={f.total_digits} onChange={(v: any) => set('total_digits', +v)} /></div>
          <div style={{ flex: 1, fontSize: 12, color: T.inkSub }}>Preview <span style={{ fontFamily: T.fMono, color: T.ink, fontWeight: 600 }}>{(f.prefix || '') + String(f.start_number || 0).padStart(f.total_digits || 1, '0')}</span></div>
          <Btn T={T} kind="accent" onClick={add} disabled={busy}>Add</Btn>
        </div>
      </div>
    </Modal>
  );
}
