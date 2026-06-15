'use client';
// ─────────────────────────────────────────────────────────────────
// Discounts — by brand / category / location, with priority and a
// date range (the manual's Add/Edit Discount). Wired through
// API.discount + brand/category/location reference data.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useTheme } from '@/components/shell';
import { API } from '@/lib/api';
import { CATEGORIES } from '@/lib/data';

const { useState: useStateDc, useEffect: useEffectDc } = React;

export default function DiscountsPage() {
  const T = useTheme();
  return <Discounts T={T} />;
}

function Discounts({ T }: { T: Theme }) {
  const [rows, setRows] = useStateDc<any[]>([]);
  const [loading, setLoading] = useStateDc(true);
  const [refs, setRefs] = useStateDc<any>({ brands: [], locs: [] });
  const [edit, setEdit] = useStateDc<any>(null);
  const [confirmDel, setConfirmDel] = useStateDc<any>(null);
  const [show, node] = useToast();
  const cats = CATEGORIES.filter((c: any) => c.id !== 'all');

  const reload = React.useCallback(() => { setLoading(true); API.discount.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, []);
  useEffectDc(() => { reload(); }, [reload]);
  useEffectDc(() => { Promise.all([API.brand.list(), API.location.list()]).then(([brands, locs]: any) => setRefs({ brands, locs })).catch(() => {}); }, []);

  const now = new Date().toISOString().slice(0, 10);
  const live = (d: any) => d.is_active && (!d.ends_at || d.ends_at >= now) && (!d.starts_at || d.starts_at <= now);

  async function toggleActive(d: any) { try { await API.discount.update(d.id, { is_active: !d.is_active }); reload(); } catch (e: any) { show(e.message); } }
  async function doDelete(d: any) { try { await API.discount.remove(d.id); setConfirmDel(null); show('Discount deleted'); reload(); } catch (e: any) { setConfirmDel(null); show(e.message); } }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Discounts" subtitle={`${rows.length} discount rules`}
        right={<Btn T={T} kind="accent" onClick={() => setEdit({ type: 'percentage', priority: 1, is_active: true, apply_price_groups: true })}>+ Add Discount</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <StatStrip T={T} stats={[['Rules', rows.length], ['Active now', rows.filter(live).length], ['Percentage', rows.filter((d: any) => d.type === 'percentage').length]]} />
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[['Discount', 'l'], ['Applies to', 'l'], ['Location', 'l'], ['Value', 'r'], ['Priority', 'r'], ['Period', 'l'], ['Status', 'l'], ['', 'r']].map(([h, a]: any, i: number) => (
                <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((d: any) => (
                  <tr key={d.id} style={{ transition: 'background .12s' }} onMouseEnter={(e: any) => e.currentTarget.style.background = T.paperAlt} onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{d.name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}>
                      <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
                        {d.category_name && <Badge T={T} tone="gray">{d.category_name}</Badge>}
                        {d.brand_name && <Badge T={T} tone="blue">{d.brand_name}</Badge>}
                        {!d.category_name && !d.brand_name && <span style={{ fontSize: 12, color: T.inkMute }}>All products</span>}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{d.location_name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.accent.text } as React.CSSProperties}>{d.type === 'percentage' ? d.value + '%' : money(d.value)}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>{d.priority}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 11.5, color: T.inkSub, fontFamily: T.fMono }}>{d.starts_at || '—'} → {d.ends_at || '—'}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={live(d) ? 'green' : 'gray'}>{live(d) ? 'Active' : d.is_active ? 'Scheduled' : 'Off'}</Badge></td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}>
                      <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => toggleActive(d)} style={dcMini(T)}>{d.is_active ? 'Disable' : 'Enable'}</button>
                        <button onClick={() => setEdit(d)} style={dcMini(T)}>Edit</button>
                        <button onClick={() => setConfirmDel(d)} style={dcMini(T, true)}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>GET /connector/api/discount…</div>}
            {!loading && rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>No discount rules yet.</div>}
          </Panel>
        </div>
      </div>

      {edit && <DiscountEditor T={T} discount={edit} brands={refs.brands} locs={refs.locs} cats={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); show(edit.id ? 'Discount updated' : 'Discount created'); reload(); }} />}
      {confirmDel && (
        <Modal T={T} title="Delete discount?" subtitle={confirmDel.name} width={420} onClose={() => setConfirmDel(null)} onSave={() => doDelete(confirmDel)} saveLabel="Delete">
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>Remove the discount rule <b style={{ color: T.ink }}>{confirmDel.name}</b>?</div>
        </Modal>
      )}
      {node}
    </div>
  );
}

function DiscountEditor({ T, discount, brands, locs, cats, onClose, onSaved }: { T: Theme; discount: any; brands: any[]; locs: any[]; cats: any[]; onClose: () => void; onSaved: () => void }) {
  const editing = !!discount.id;
  const [f, setF] = useStateDc<any>({
    name: discount.name || '', brand_id: discount.brand_id || '', category: discount.category || '', location_id: discount.location_id || '',
    priority: discount.priority || 1, type: discount.type || 'percentage', value: discount.value != null ? String(discount.value) : '',
    starts_at: discount.starts_at || '', ends_at: discount.ends_at || '',
    apply_price_groups: discount.apply_price_groups !== false, apply_customer_groups: !!discount.apply_customer_groups, is_active: discount.is_active !== false,
  });
  const [busy, setBusy] = useStateDc(false);
  const [err, setErr] = useStateDc<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.name.trim()) { setErr('Discount name is required.'); return; }
    setBusy(true); setErr(null);
    const body = { ...f, brand_id: f.brand_id ? Number(f.brand_id) : null, location_id: f.location_id ? Number(f.location_id) : null, category: f.category || null, value: Number(f.value || 0), priority: Number(f.priority || 1) };
    try { if (editing) await API.discount.update(discount.id, body); else await API.discount.create(body); onSaved(); }
    catch (ex: any) { setErr(ex.message || 'Could not save the discount.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title={editing ? 'Edit discount' : 'New discount'} subtitle="By brand, category & location" width={620} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create discount'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Name" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. Weekend Grocery" /></Field>
        <Field T={T} label="Category"><SelectField T={T} value={f.category} options={['', ...cats.map((c: any) => c.id)]} onChange={(v: any) => set('category', v)} render={(v: any) => v ? (cats.find((c: any) => c.id === v) || {}).name : 'All categories'} /></Field>
        <Field T={T} label="Brand"><SelectField T={T} value={String(f.brand_id)} options={['', ...brands.map((b: any) => String(b.id))]} onChange={(v: any) => set('brand_id', v)} render={(v: any) => v ? (brands.find((b: any) => String(b.id) === v) || {}).name : 'All brands'} /></Field>
        <Field T={T} label="Location"><SelectField T={T} value={String(f.location_id)} options={['', ...locs.map((l: any) => String(l.id))]} onChange={(v: any) => set('location_id', v)} render={(v: any) => v ? (locs.find((l: any) => String(l.id) === v) || {}).name : 'All locations'} /></Field>
        <Field T={T} label="Priority" hint="Higher wins on a tie"><TextField T={T} type="number" value={f.priority} onChange={(v: any) => set('priority', v)} /></Field>
        <Field T={T} label="Discount type"><SelectField T={T} value={f.type} options={['percentage', 'fixed']} onChange={(v: any) => set('type', v)} render={(v: any) => v === 'percentage' ? 'Percentage (%)' : 'Fixed ($)'} /></Field>
        <Field T={T} label={f.type === 'percentage' ? 'Value (%)' : 'Value ($)'}><TextField T={T} type="number" value={f.value} onChange={(v: any) => set('value', v)} placeholder="0" /></Field>
        <Field T={T} label="Starts"><TextField T={T} type="date" value={f.starts_at} onChange={(v: any) => set('starts_at', v)} /></Field>
        <Field T={T} label="Ends"><TextField T={T} type="date" value={f.ends_at} onChange={(v: any) => set('ends_at', v)} /></Field>
      </FormGrid>
      <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
        <DcToggle T={T} on={f.apply_price_groups} onChange={(v: any) => set('apply_price_groups', v)} label="Apply to price groups" />
        <DcToggle T={T} on={f.apply_customer_groups} onChange={(v: any) => set('apply_customer_groups', v)} label="Apply to customer groups" />
        <DcToggle T={T} on={f.is_active} onChange={(v: any) => set('is_active', v)} label="Active" />
      </div>
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function DcToggle({ T, on, onChange, label }: { T: Theme; on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <span style={{ width: 40, height: 23, borderRadius: 99, background: on ? T.accent.base : T.lineMid, position: 'relative', flexShrink: 0, transition: 'background .18s' } as React.CSSProperties}>
        <span style={{ position: 'absolute', top: 2.5, left: on ? 19 : 2.5, width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' } as React.CSSProperties} />
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.inkMid }}>{label}</span>
    </button>
  );
}

function dcMini(T: Theme, danger?: boolean): React.CSSProperties { return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${danger ? T.redSoft : T.line}`, background: danger ? T.redSoft : T.paper, color: danger ? T.redText : T.inkMid }; }

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
