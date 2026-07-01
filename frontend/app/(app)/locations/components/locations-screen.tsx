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
import { Topbar } from '@/components/shell';
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

export function Locations({ T }: { T: any }) {
  const [rows, setRows] = useStateLo<any[]>([]);
  const [loading, setLoading] = useStateLo(true);
  const [refs, setRefs] = useStateLo<any>({ schemes: [], layouts: [], groups: [], methods: [], users: [], accounts: [], products: [] });
  const [edit, setEdit] = useStateLo<any>(null);
  const [schemeMgr, setSchemeMgr] = useStateLo(false);
  const [show, node] = useToast();

  const reload = React.useCallback(() => {
    setLoading(true);
    API.location.list({ all: true }).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  const loadRefs = React.useCallback(() => {
    const asList = (x: any) => (Array.isArray(x) ? x : ((x && (x.items || x.data)) || []));
    // Each ref is loaded defensively — a missing client or failed request must
    // never crash the management screen, it just yields an empty dropdown.
    const safe = (fn: () => Promise<any>) => { try { return Promise.resolve(fn()).catch(() => undefined); } catch { return Promise.resolve(undefined); } };
    Promise.all([
      safe(() => API.invoiceScheme.list()), safe(() => API.invoiceLayout.list()), safe(() => API.priceGroup.list()), safe(() => API.paymentMethod.list()),
      safe(() => API.user.list()), safe(() => API.paymentAccount.list()), safe(() => API.product.list({})),
    ]).then(([schemes, layouts, groups, methods, users, accounts, products]) =>
      setRefs({ schemes: asList(schemes), layouts: asList(layouts), groups: asList(groups), methods: asList(methods), users: asList(users), accounts: asList(accounts), products: asList(products) })
    ).catch(() => {});
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
          <Btn T={T} kind="accent" onClick={() => setEdit({ payment_methods: ['cash'], default_payment: 'cash', type: 'Retail', featured_product_ids: [], payment_accounts: {} })}>+ Add Location</Btn>
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
    name: loc.name || '', type: loc.type || 'Retail',
    manager_id: loc.manager_id || '', location_code: loc.location_code || '',
    landmark: loc.landmark || '', city: loc.city || '', zip_code: loc.zip_code || '',
    state: loc.state || '', country: loc.country || '', mobile: loc.mobile || '',
    alt_contact: loc.alt_contact || '', email: loc.email || '', website: loc.website || '',
    invoice_scheme_id: loc.invoice_scheme_id || '', invoice_layout_id: loc.invoice_layout_id || '', price_group_id: loc.price_group_id || '',
    custom_field1: loc.custom_field1 || '', custom_field2: loc.custom_field2 || '', custom_field3: loc.custom_field3 || '', custom_field4: loc.custom_field4 || '',
    featured_product_ids: Array.isArray(loc.featured_product_ids) ? [...loc.featured_product_ids] : [],
    payment_methods: loc.payment_methods ? [...loc.payment_methods] : ['cash'], default_payment: loc.default_payment || 'cash',
    payment_accounts: loc.payment_accounts ? { ...loc.payment_accounts } : {},
  });
  const [busy, setBusy] = useStateLo(false);
  const [err, setErr] = useStateLo<any>(null);
  const set = (k: any, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const toggleMethod = (key: any) => setF((s: any) => {
    const has = s.payment_methods.includes(key);
    const pm = has ? s.payment_methods.filter((x: any) => x !== key) : [...s.payment_methods, key];
    const dp = has && s.default_payment === key ? (pm[0] || '') : s.default_payment;
    const pa = { ...s.payment_accounts }; if (has) delete pa[key];
    return { ...s, payment_methods: pm, default_payment: dp, payment_accounts: pa };
  });
  const setAccount = (method: any, accId: any) => setF((s: any) => ({ ...s, payment_accounts: { ...s.payment_accounts, [method]: accId || undefined } }));

  const users = refs.users || [], accounts = refs.accounts || [], products = refs.products || [];
  const userName = (id: any) => { const u = users.find((x: any) => x.id === id); return u ? (u.name || u.email || id) : ''; };
  const prodName = (id: any) => { const p = products.find((x: any) => x.id === id); return p ? p.name : id; };
  const addFeatured = (id: any) => { if (id && !f.featured_product_ids.includes(id)) set('featured_product_ids', [...f.featured_product_ids, id]); };
  const removeFeatured = (id: any) => set('featured_product_ids', f.featured_product_ids.filter((x: any) => x !== id));
  const H = ({ children }: any) => <div style={{ marginTop: 18, marginBottom: 10, fontSize: 12, fontWeight: 700, color: T.inkSub, letterSpacing: 0.3 }}>{children}</div>;

  async function save() {
    if (!f.name.trim()) { setErr('Location name is required.'); return; }
    if (!f.payment_methods.length) { setErr('Enable at least one payment method.'); return; }
    setBusy(true); setErr(null);
    try { if (editing) await API.location.update(loc.id, f); else await API.location.create(f); onSaved(); }
    catch (ex: any) { setErr(ex.message || 'Could not save the location.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title={editing ? 'Edit location' : 'New location'} subtitle={editing ? loc.name : 'Add a store, kiosk or warehouse'} width={680} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create location'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Location name" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. Main Store" /></Field>
        <Field T={T} label="Type"><SelectField T={T} value={f.type} options={['Retail', 'Kiosk', 'Warehouse', 'Headquarters']} onChange={(v: any) => set('type', v)} /></Field>
        <Field T={T} label="Manager">
          <SelectField T={T} value={f.manager_id} options={['', ...users.map((u: any) => u.id)]} onChange={(v: any) => set('manager_id', v)} render={(v: any) => (v ? userName(v) : '— No manager —')} />
        </Field>
        <Field T={T} label="Location ID"><TextField T={T} value={f.location_code} onChange={(v: any) => set('location_code', v)} placeholder="Internal code (optional)" /></Field>
      </FormGrid>

      <H>ADDRESS &amp; CONTACT</H>
      <FormGrid>
        <Field T={T} label="Address / landmark" full><TextField T={T} value={f.landmark} onChange={(v: any) => set('landmark', v)} placeholder="Street, district" /></Field>
        <Field T={T} label="City"><TextField T={T} value={f.city} onChange={(v: any) => set('city', v)} placeholder="City" /></Field>
        <Field T={T} label="Zip / postal code"><TextField T={T} value={f.zip_code} onChange={(v: any) => set('zip_code', v)} placeholder="Zip code" /></Field>
        <Field T={T} label="State / region"><TextField T={T} value={f.state} onChange={(v: any) => set('state', v)} placeholder="State" /></Field>
        <Field T={T} label="Country"><TextField T={T} value={f.country} onChange={(v: any) => set('country', v)} placeholder="Country" /></Field>
        <Field T={T} label="Mobile"><TextField T={T} value={f.mobile} onChange={(v: any) => set('mobile', v)} placeholder="+252 …" /></Field>
        <Field T={T} label="Alternate contact"><TextField T={T} value={f.alt_contact} onChange={(v: any) => set('alt_contact', v)} placeholder="Alt number" /></Field>
        <Field T={T} label="Email"><TextField T={T} value={f.email} onChange={(v: any) => set('email', v)} placeholder="branch@business.com" /></Field>
        <Field T={T} label="Website"><TextField T={T} value={f.website} onChange={(v: any) => set('website', v)} placeholder="https://…" /></Field>
      </FormGrid>

      <H>INVOICING &amp; PRICING</H>
      <FormGrid>
        <Field T={T} label="Invoice scheme">
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><SelectField T={T} value={f.invoice_scheme_id} options={['', ...refs.schemes.map((s: any) => s.id)]} onChange={(v: any) => set('invoice_scheme_id', v)} render={(v: any) => { if (!v) return '— None —'; const s = refs.schemes.find((x: any) => x.id === v) || {}; return (s.name || v) + (s.prefix ? ` (${s.prefix})` : ''); }} /></div>
            <button onClick={onNewScheme} title="Manage schemes" style={{ width: 40, borderRadius: T.r, border: `1.5px solid ${T.line}`, background: T.paper, color: T.accent.text, cursor: 'pointer', fontSize: 16 }}>+</button>
          </div>
        </Field>
        <Field T={T} label="Invoice layout"><SelectField T={T} value={f.invoice_layout_id} options={['', ...refs.layouts.map((l: any) => l.id)]} onChange={(v: any) => set('invoice_layout_id', v)} render={(v: any) => (v ? ((refs.layouts.find((x: any) => x.id === v) || {}).name || v) : '— None —')} /></Field>
        <Field T={T} label="Default selling price group" full><SelectField T={T} value={f.price_group_id} options={['', ...refs.groups.map((g: any) => g.id)]} onChange={(v: any) => set('price_group_id', v)} render={(v: any) => (v ? ((refs.groups.find((x: any) => x.id === v) || {}).name || v) : '— Default —')} /></Field>
      </FormGrid>

      <H>PAYMENT METHODS</H>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {refs.methods.map((m: any) => (
          <button key={m.key} onClick={() => toggleMethod(m.key)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 99, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: 600, background: f.payment_methods.includes(m.key) ? T.accent.soft : T.paper, border: `1.5px solid ${f.payment_methods.includes(m.key) ? T.accent.base : T.line}`, color: f.payment_methods.includes(m.key) ? T.accent.text : T.inkMid }}>
            <span style={{ fontSize: 11 }}>{f.payment_methods.includes(m.key) ? '✓' : '+'}</span>{m.label}
          </button>
        ))}
      </div>
      {f.payment_methods.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, color: T.inkSub }}>Default method</span>
            <div style={{ width: 200 }}><SelectField T={T} value={f.default_payment} options={f.payment_methods} onChange={(v: any) => set('default_payment', v)} render={(v: any) => (refs.methods.find((m: any) => m.key === v) || { label: v }).label} /></div>
          </div>
          {accounts.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              {f.payment_methods.map((m: any) => (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 150, fontSize: 12.5, color: T.inkSub }}>{(refs.methods.find((x: any) => x.key === m) || { label: m }).label} account</span>
                  <div style={{ flex: 1 }}><SelectField T={T} value={f.payment_accounts[m] || ''} options={['', ...accounts.map((a: any) => a.id)]} onChange={(v: any) => setAccount(m, v)} render={(v: any) => (v ? ((accounts.find((a: any) => a.id === v) || {}).name || v) : 'No default account')} /></div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <H>POS FEATURED PRODUCTS</H>
      {products.length > 0 ? (
        <>
          <Field T={T} label="Add a product to feature" full>
            <SelectField T={T} value="" options={['', ...products.filter((p: any) => !f.featured_product_ids.includes(p.id)).map((p: any) => p.id)]} onChange={(v: any) => addFeatured(v)} render={(v: any) => (v ? prodName(v) : '— Select a product —')} />
          </Field>
          {f.featured_product_ids.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {f.featured_product_ids.map((id: any) => (
                <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 99, background: T.accent.soft, color: T.accent.text, fontSize: 12, fontWeight: 600 }}>
                  {prodName(id)}<button onClick={() => removeFeatured(id)} style={{ border: 'none', background: 'none', color: T.accent.text, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </>
      ) : <div style={{ fontSize: 12, color: T.inkSub }}>No products yet — add products first to feature them here.</div>}

      <H>CUSTOM FIELDS</H>
      <FormGrid>
        <Field T={T} label="Custom field 1"><TextField T={T} value={f.custom_field1} onChange={(v: any) => set('custom_field1', v)} placeholder="Custom field 1" /></Field>
        <Field T={T} label="Custom field 2"><TextField T={T} value={f.custom_field2} onChange={(v: any) => set('custom_field2', v)} placeholder="Custom field 2" /></Field>
        <Field T={T} label="Custom field 3"><TextField T={T} value={f.custom_field3} onChange={(v: any) => set('custom_field3', v)} placeholder="Custom field 3" /></Field>
        <Field T={T} label="Custom field 4"><TextField T={T} value={f.custom_field4} onChange={(v: any) => set('custom_field4', v)} placeholder="Custom field 4" /></Field>
      </FormGrid>

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
