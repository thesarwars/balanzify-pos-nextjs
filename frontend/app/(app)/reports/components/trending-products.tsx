'use client';
// ─────────────────────────────────────────────────────────────────
// Trending Products — the top N products by units sold, as a bar
// chart, with location / category / sub-category / brand / unit /
// product-type filters. (No chart library in the app — inline bars.)
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { LuChevronDown, LuCalendarDays } from 'react-icons/lu';

export function TrendingProductsReport({ T }: { T: Theme }) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [preset, setPreset] = React.useState('this_year');
  const [locs, setLocs] = React.useState<any[]>([]);
  const [cats, setCats] = React.useState<any[]>([]);
  const [brands, setBrands] = React.useState<any[]>([]);
  const [units, setUnits] = React.useState<any[]>([]);
  // Draft filters apply on the button, matching the reference's Apply Filters.
  const initial = () => {
    const [from, to] = presetRange('this_year', 1)!;
    return { location_id: '', category_id: '', sub_category_id: '', brand_id: '', unit: '', product_type: 'all', count: '5', from, to };
  };
  const [draft, setDraft] = React.useState<any>(initial);
  const [applied, setApplied] = React.useState<any>(initial);
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => {
    API.location.list().then(setLocs).catch(() => {});
    API.category.list().then((r: any) => setCats(Array.isArray(r) ? r : (r?.categories || []))).catch(() => {});
    API.brand.list().then((r: any) => setBrands(Array.isArray(r) ? r : (r?.brands || []))).catch(() => {});
    API.unit.list().then((r: any) => setUnits(Array.isArray(r) ? r : (r?.units || []))).catch(() => {});
  }, []);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const f = applied;
    const params: any = { from: f.from, to: f.to };
    if (f.location_id) params.location_id = f.location_id;
    if (f.category_id) params.category_id = f.category_id;
    if (f.sub_category_id) params.sub_category_id = f.sub_category_id;
    if (f.brand_id) params.brand_id = f.brand_id;
    if (f.unit) params.unit = f.unit;
    if (f.product_type && f.product_type !== 'all') params.product_type = f.product_type;
    if (f.count) params.count = f.count;
    API.report.trendingProducts(params)
      .then((r: any) => { if (!dead) setData(r); })
      .catch((e: any) => { if (!dead) setErr(e?.message || 'Could not load the report.'); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [applied]);

  const setF = (k: string, v: any) => {
    if (k === 'from' || k === 'to') setPreset('custom');
    // Picking a top-level category clears a now-inconsistent sub-category.
    setDraft((p: any) => ({ ...p, [k]: v, ...(k === 'category_id' ? { sub_category_id: '' } : {}) }));
  };
  function pickPreset(key: string) {
    setMenu(false);
    setPreset(key);
    const range = presetRange(key, fyStart);
    if (range) setDraft((p: any) => ({ ...p, from: range[0], to: range[1] }));
  }

  // Sub-categories = children of the chosen top-level category.
  const parents = cats.filter((c: any) => !c.parent_id);
  const children = cats.filter((c: any) => draft.category_id && String(c.parent_id) === String(draft.category_id));

  const rows: any[] = data?.rows || [];
  const max = Math.max(1, ...rows.map((r: any) => r.units_sold || 0));

  return (
    <>
      {/* filters */}
      <div style={{ padding: '16px 20px', background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ position: 'relative', paddingBottom: 2 }}>
            <Btn T={T} kind="accent" onClick={() => setMenu(!menu)}>
              <LuCalendarDays size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
              {(DATE_PRESETS.find(([k]) => k === preset) || [, 'Filter by date'])[1]}
              <LuChevronDown size={12} style={{ verticalAlign: -1, marginLeft: 6 }} />
            </Btn>
            {menu && (
              <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 30, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, minWidth: 190, maxHeight: 340, overflowY: 'auto' }}>
                {DATE_PRESETS.map(([k, lbl]) => (
                  <button key={k} onClick={() => pickPreset(k)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: T.fBody, fontWeight: preset === k ? 700 : 450, background: preset === k ? T.accent.base : 'transparent', color: preset === k ? T.accent.on : T.ink }}>{lbl}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 640 }}>
            <FormGrid cols={4}>
              <Field T={T} label="Location">
                <SelectField T={T} value={draft.location_id} options={['', ...locs.map((l: any) => String(l.id))]}
                  onChange={(v: any) => setF('location_id', v)}
                  render={(o: any) => o === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Category">
                <SelectField T={T} value={draft.category_id} options={['', ...parents.map((c: any) => String(c.uid || c.id))]}
                  onChange={(v: any) => setF('category_id', v)}
                  render={(o: any) => o === '' ? 'All' : (parents.find((c: any) => String(c.uid || c.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Sub category">
                <SelectField T={T} value={draft.sub_category_id} options={['', ...children.map((c: any) => String(c.uid || c.id))]}
                  onChange={(v: any) => setF('sub_category_id', v)}
                  render={(o: any) => o === '' ? 'All' : (children.find((c: any) => String(c.uid || c.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Brand">
                <SelectField T={T} value={draft.brand_id} options={['', ...brands.map((b: any) => String(b.id))]}
                  onChange={(v: any) => setF('brand_id', v)}
                  render={(o: any) => o === '' ? 'All' : (brands.find((b: any) => String(b.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Unit">
                <SelectField T={T} value={draft.unit} options={['', ...units.map((u: any) => String(u.short_name || u.actual_name))]}
                  onChange={(v: any) => setF('unit', v)}
                  render={(o: any) => o === '' ? 'All' : o} />
              </Field>
              <Field T={T} label="Number of products">
                <TextField T={T} type="number" value={draft.count} onChange={(v: any) => setF('count', v)} placeholder="5" />
              </Field>
              <Field T={T} label="Product Type">
                <SelectField T={T} value={draft.product_type} options={['all', 'single', 'variable']}
                  onChange={(v: any) => setF('product_type', v)}
                  render={(o: any) => o === 'all' ? 'All' : o === 'single' ? 'Single' : 'Variable'} />
              </Field>
            </FormGrid>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn T={T} kind="accent" onClick={() => setApplied({ ...draft })}>Apply Filters</Btn>
        </div>
      </div>

      {err && <Panel T={T}><div style={{ color: T.red, fontSize: 13 }}>{err}</div></Panel>}
      {!err && (
        <Panel T={T} title="Top Trending Products">
          <div style={{ opacity: loading ? 0.6 : 1 }}>
            {rows.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>
                {loading ? 'Loading…' : 'No sales in this period for the chosen filters.'}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 300, padding: '20px 8px 0', overflowX: 'auto' }}>
                {rows.map((r: any) => (
                  <div key={r.product_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 90, flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontFamily: T.fMono, fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{r.units_sold}</div>
                    <div title={`${r.units_sold} sold`}
                      style={{ width: '100%', maxWidth: 88, height: `${Math.max(2, (r.units_sold / max) * 210)}px`, background: `linear-gradient(180deg, ${T.accent.bright}, ${T.accent.base})`, borderRadius: '6px 6px 0 0' }} />
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 8, textAlign: 'center', lineHeight: 1.35, maxWidth: 120 }}>
                      {r.name}{r.sku ? <><br /><span style={{ color: T.inkMute, fontFamily: T.fMono }}>{r.sku}{r.unit ? ` (${r.unit})` : ''}</span></> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ textAlign: 'center', fontSize: 12, color: T.inkSub, marginTop: 14 }}>● Total unit sold</div>
          </div>
        </Panel>
      )}
    </>
  );
}
