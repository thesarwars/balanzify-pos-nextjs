'use client';
// ─────────────────────────────────────────────────────────────────
// Purchase & Sale Product — what was bought against what was sold,
// grouped by Category, Brand or Supplier. Filters apply on Search.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { ReportTable, type ReportCol } from './report-table';
import { LuChevronDown, LuCalendarDays, LuNetwork, LuTag, LuTruck, LuSearch } from 'react-icons/lu';

const TABS: [string, string, any][] = [
  ['category', 'Category', LuNetwork],
  ['brand', 'Brand', LuTag],
  ['supplier', 'Supplier', LuTruck],
];
const DEFAULT_PRESET = 'last3m';

export function PurchaseSaleProductReport({ T }: { T: Theme }) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [group, setGroup] = React.useState('category');
  const [preset, setPreset] = React.useState(DEFAULT_PRESET);
  const [locs, setLocs] = React.useState<any[]>([]);
  const [cats, setCats] = React.useState<any[]>([]);
  const [brands, setBrands] = React.useState<any[]>([]);
  const [suppliers, setSuppliers] = React.useState<any[]>([]);
  const blank = () => {
    const [from, to] = presetRange(DEFAULT_PRESET, 1)!;
    return { filter_id: '', location_id: '', from, to };
  };
  // Draft vs applied: the reference only runs the report on Search.
  const [draft, setDraft] = React.useState<any>(blank);
  const [applied, setApplied] = React.useState<any>(blank);
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => {
    API.location.list().then(setLocs).catch(() => {});
    API.category.list().then((r: any) => setCats(Array.isArray(r) ? r : (r?.categories || []))).catch(() => {});
    API.brand.list().then((r: any) => setBrands(Array.isArray(r) ? r : (r?.brands || []))).catch(() => {});
    API.contact.list({ type: 'supplier' }).then((r: any) => setSuppliers(r || [])).catch(() => {});
  }, []);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr(''); setData(null);
    const f = applied;
    const params: any = { group, from: f.from, to: f.to };
    if (f.location_id) params.location_id = f.location_id;
    // The id filter is named for whichever grouping is active.
    if (f.filter_id) params[group === 'category' ? 'category_id' : group === 'brand' ? 'brand_id' : 'supplier_id'] = f.filter_id;
    API.report.purchaseSaleProduct(params)
      .then((r: any) => { if (!dead) setData(r); })
      .catch((e: any) => { if (!dead) setErr(e?.message || 'Could not load the report.'); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [applied, group]);

  const setF = (k: string, v: any) => {
    if (k === 'from' || k === 'to') setPreset('custom');
    setDraft((p: any) => ({ ...p, [k]: v }));
  };
  function pickPreset(key: string) {
    setMenu(false);
    setPreset(key);
    const range = presetRange(key, fyStart);
    if (range) setDraft((p: any) => ({ ...p, from: range[0], to: range[1] }));
  }
  // Switching tab changes what the id filter means, so reset it and re-run.
  function pickTab(g: string) {
    if (g === group) return;   // clicking the active tab must not wipe filters
    setGroup(g);
    setDraft((p: any) => ({ ...p, filter_id: '' }));
    setApplied((p: any) => ({ ...p, filter_id: '' }));
  }

  const options = group === 'category' ? cats.filter((c: any) => !c.parent_id) : group === 'brand' ? brands : suppliers;
  const optId = (o: any) => String(group === 'category' ? (o.uid || o.id) : o.id);

  const rows: any[] = data?.rows || [];
  const cols: ReportCol[] = React.useMemo(() => [
    { key: 'label', label: group === 'category' ? 'Category' : group === 'brand' ? 'Brand' : 'Supplier', value: (r) => r.label, fixed: true },
    { key: 'purchase_quantity', label: 'Total Purchase Quantity', kind: 'num', total: true, value: (r) => r.purchase_quantity },
    { key: 'purchase_value', label: 'Total Purchase', kind: 'money', total: true, value: (r) => r.purchase_value },
    { key: 'sold_quantity', label: 'Total Sold Quantity', kind: 'num', total: true, value: (r) => r.sold_quantity },
    { key: 'sale_value', label: 'Total Sale', kind: 'money', total: true, value: (r) => r.sale_value },
    { key: 'difference', label: 'Sale − Purchase', kind: 'money', total: true, value: (r) => r.difference },
  ], [group]);

  const periodLabel = `${applied.from} to ${applied.to}`;

  return (
    <>
      {/* group tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
        {TABS.map(([id, lbl, Icon]) => (
          <button key={id} onClick={() => pickTab(id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: group === id ? 700 : 500, background: group === id ? T.accent.base : 'transparent', color: group === id ? T.accent.on : T.inkMid }}>
            <Icon size={13} />{lbl}
          </button>
        ))}
      </div>

      {/* filters */}
      <div style={{ padding: '16px 20px', background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', paddingBottom: 2 }}>
            <Btn T={T} kind="accent" onClick={() => setMenu(!menu)}>
              <LuCalendarDays size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
              {(DATE_PRESETS.find(([k]) => k === preset) || [, 'Period'])[1]}
              <LuChevronDown size={12} style={{ verticalAlign: -1, marginLeft: 6 }} />
            </Btn>
            {menu && (
              <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 30, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, minWidth: 190, maxHeight: 340, overflowY: 'auto' }}>
                {DATE_PRESETS.map(([k, lbl]) => (
                  <button key={k} onClick={() => pickPreset(k)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: T.fBody, fontWeight: preset === k ? 700 : 450, background: preset === k ? T.accent.base : 'transparent', color: preset === k ? T.accent.on : T.ink }}
                    onMouseEnter={e => { if (preset !== k) e.currentTarget.style.background = T.paperAlt; }}
                    onMouseLeave={e => { if (preset !== k) e.currentTarget.style.background = 'transparent'; }}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 560 }}>
            <FormGrid cols={4}>
              <Field T={T} label={group === 'category' ? 'Category' : group === 'brand' ? 'Brand' : 'Supplier'}>
                <SelectField T={T} value={draft.filter_id} options={['', ...options.map(optId)]}
                  onChange={(v: any) => setF('filter_id', v)}
                  render={(o: any) => o === '' ? 'All' : (options.find((x: any) => optId(x) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Business Location">
                <SelectField T={T} value={draft.location_id} options={['', ...locs.map((l: any) => String(l.id))]}
                  onChange={(v: any) => setF('location_id', v)}
                  render={(o: any) => o === '' ? 'All' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="From"><TextField T={T} type="date" value={draft.from} onChange={(v: any) => setF('from', v)} /></Field>
              <Field T={T} label="To"><TextField T={T} type="date" value={draft.to} onChange={(v: any) => setF('to', v)} /></Field>
            </FormGrid>
          </div>
          <div style={{ paddingBottom: 2 }}>
            <Btn T={T} kind="accent" onClick={() => setApplied({ ...draft })}>
              <LuSearch size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Search
            </Btn>
          </div>
        </div>
      </div>
      {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}

      {err && <Panel T={T}><div style={{ color: T.red, fontSize: 13 }}>{err}</div></Panel>}
      {!err && (
        <Panel T={T} pad>
          <div style={{ opacity: loading ? 0.6 : 1 }}>
            <ReportTable
              key={group}
              T={T} cols={cols} rows={rows}
              title={`Purchase & Sale Product — by ${group}`}
              subtitle={periodLabel}
              fileName={`purchase-sale-product-${group}-${applied.from}-to-${applied.to}`}
              empty={loading ? 'Loading…' : 'No data available in table'}
              note={group === 'supplier'
                ? <span>A sale has no supplier of its own, so each product&apos;s sales count under its preferred supplier (else its most recent purchase).</span>
                : null}
            />
          </div>
        </Panel>
      )}
    </>
  );
}
