'use client';
// ─────────────────────────────────────────────────────────────────
// Product Sell Report — sold line items in five views (Detailed,
// Detailed with purchase, Grouped by Date, By Category, By Brand),
// sharing one filter set. Quantities and money are net of refunds.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting, formatDate, formatDateTime } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { ReportTable, type ReportCol } from './report-table';
import { LuChevronDown, LuCalendarDays, LuList, LuLayoutList, LuCalendar, LuTags, LuTag } from 'react-icons/lu';

const VIEWS: [string, string, any][] = [
  ['detailed', 'Detailed', LuList],
  ['detailed_purchase', 'Detailed (With purchase)', LuLayoutList],
  ['grouped_date', 'Grouped (By Date)', LuCalendar],
  ['by_category', 'By Category', LuTags],
  ['by_brand', 'By Brand', LuTag],
];

export function ProductSellReport({ T }: { T: Theme }) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [preset, setPreset] = React.useState('this_year');
  const [view, setView] = React.useState('detailed');
  const [locs, setLocs] = React.useState<any[]>([]);
  const [cats, setCats] = React.useState<any[]>([]);
  const [brands, setBrands] = React.useState<any[]>([]);
  const [groups, setGroups] = React.useState<any[]>([]);
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [filters, setFilters] = React.useState<any>(() => {
    const [from, to] = presetRange('this_year', 1)!;
    return { search: '', customer_id: '', customer_group_id: '', location_id: '', category_id: '', brand_id: '', from, to, time_from: '', time_to: '' };
  });
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => {
    API.location.list().then(setLocs).catch(() => {});
    API.category.list().then((r: any) => setCats(Array.isArray(r) ? r : (r?.categories || []))).catch(() => {});
    API.brand.list().then((r: any) => setBrands(Array.isArray(r) ? r : (r?.brands || []))).catch(() => {});
    API.customerGroup.list().then((r: any) => setGroups(Array.isArray(r) ? r : (r?.groups || []))).catch(() => {});
    API.contact.list({ type: 'customer' }).then((r: any) => setCustomers(r || [])).catch(() => {});
  }, []);

  // Clear rows the instant the view changes so the table never shows the
  // previous view's data under the new view's columns while refetching.
  React.useEffect(() => { setData(null); }, [view]);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const timer = setTimeout(() => {
      const params: any = { view, from: filters.from, to: filters.to };
      for (const k of ['search', 'customer_id', 'customer_group_id', 'location_id', 'category_id', 'brand_id', 'time_from', 'time_to']) {
        if (filters[k]) params[k] = filters[k];
      }
      API.report.productSell(params)
        .then((r: any) => { if (!dead) setData(r); })
        .catch((e: any) => { if (!dead) setErr(e?.message || 'Could not load the report.'); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 300);
    return () => { dead = true; clearTimeout(timer); };
  }, [filters, view]);

  const setF = (k: string, v: any) => {
    if (k === 'from' || k === 'to') setPreset('custom');
    setFilters((p: any) => ({ ...p, [k]: v }));
  };
  function pickPreset(key: string) {
    setMenu(false);
    setPreset(key);
    const range = presetRange(key, fyStart);
    if (range) setFilters((p: any) => ({ ...p, from: range[0], to: range[1] }));
  }

  const rows: any[] = data?.rows || [];
  const totals = data?.totals || {};

  const cols: ReportCol[] = React.useMemo(() => {
    const qty = (r: any) => `${r.quantity} ${r.unit || ''}`.trim();
    if (view === 'detailed') return [
      { key: 'product', label: 'Product', value: (r) => r.product, fixed: true },
      { key: 'sku', label: 'SKU', value: (r) => r.sku || '' },
      { key: 'customer', label: 'Customer name', value: (r) => r.customer || '' },
      { key: 'contact_id', label: 'Contact ID', value: (r) => r.contact_id || '' },
      { key: 'contact_number', label: 'Contact Number', value: (r) => r.contact_number || '' },
      { key: 'email', label: 'Email', value: (r) => r.email || '' },
      { key: 'invoice', label: 'Invoice No.', value: (r) => r.invoice || '' },
      { key: 'date', label: 'Date', value: (r) => r.date ? formatDateTime(r.date) : '' },
      { key: 'quantity', label: 'Quantity', kind: 'num', total: true, value: (r) => r.quantity, display: qty },
      { key: 'unit_price', label: 'Unit Price', kind: 'money', value: (r) => r.unit_price },
      { key: 'discount', label: 'Discount', kind: 'money', value: (r) => r.discount },
      { key: 'tax', label: 'Tax', kind: 'money', value: (r) => r.tax, display: (r: any) => `${money(r.tax)}${r.tax_name ? ` (${r.tax_name})` : ''}` },
      { key: 'price_inc_tax', label: 'Price inc. tax', kind: 'money', value: (r) => r.price_inc_tax },
      { key: 'total', label: 'Total', kind: 'money', total: true, value: (r) => r.total },
      { key: 'payment_method', label: 'Payment Method', value: (r) => r.payment_method || '' },
    ];
    if (view === 'detailed_purchase') return [
      { key: 'product', label: 'Product', value: (r) => r.product, fixed: true },
      { key: 'sku', label: 'SKU', value: (r) => r.sku || '' },
      { key: 'customer', label: 'Customer name', value: (r) => r.customer || '' },
      { key: 'contact_number', label: 'Contact Number', value: (r) => r.contact_number || '' },
      { key: 'email', label: 'Email', value: (r) => r.email || '' },
      { key: 'invoice', label: 'Invoice No.', value: (r) => r.invoice || '' },
      { key: 'date', label: 'Date', value: (r) => r.date ? formatDateTime(r.date) : '' },
      { key: 'purchase_ref', label: 'Purchase ref no.', value: (r) => r.purchase_ref || '' },
      { key: 'supplier', label: 'Supplier Name', value: (r) => r.supplier || '' },
      { key: 'quantity', label: 'Quantity', kind: 'num', total: true, value: (r) => r.quantity, display: qty },
    ];
    if (view === 'grouped_date') return [
      { key: 'label', label: 'Product', value: (r) => r.label, fixed: true },
      { key: 'sku', label: 'SKU', value: (r) => r.sku || '' },
      { key: 'date', label: 'Date', value: (r) => r.date ? formatDate(r.date) : '' },
      { key: 'current_stock', label: 'Current stock', kind: 'num', value: (r) => r.current_stock },
      { key: 'units_sold', label: 'Total unit sold', kind: 'num', total: true, value: (r) => r.units_sold },
      { key: 'total', label: 'Total', kind: 'money', total: true, value: (r) => r.total },
    ];
    // by_category / by_brand
    return [
      { key: 'label', label: view === 'by_category' ? 'Category' : 'Brand', value: (r) => r.label, fixed: true },
      { key: 'current_stock', label: 'Current stock', kind: 'num', total: true, value: (r) => r.current_stock },
      { key: 'units_sold', label: 'Total unit sold', kind: 'num', total: true, value: (r) => r.units_sold },
      { key: 'total', label: 'Total', kind: 'money', total: true, value: (r) => r.total },
    ];
  }, [view]);

  const periodLabel = `${filters.from} to ${filters.to}`;

  return (
    <>
      {/* filters */}
      <div style={{ padding: '16px 20px', background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
              <Field T={T} label="Search Product">
                <TextField T={T} value={filters.search} onChange={(v: any) => setF('search', v)} placeholder="Name / SKU / barcode" />
              </Field>
              <Field T={T} label="Customer">
                <SelectField T={T} value={filters.customer_id} options={['', ...customers.map((c: any) => String(c.id))]}
                  onChange={(v: any) => setF('customer_id', v)}
                  render={(o: any) => o === '' ? 'None' : (customers.find((c: any) => String(c.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Customer Group Name">
                <SelectField T={T} value={filters.customer_group_id} options={['', ...groups.map((g: any) => String(g.id))]}
                  onChange={(v: any) => setF('customer_group_id', v)}
                  render={(o: any) => o === '' ? 'All' : (groups.find((g: any) => String(g.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Business Location">
                <SelectField T={T} value={filters.location_id} options={['', ...locs.map((l: any) => String(l.id))]}
                  onChange={(v: any) => setF('location_id', v)}
                  render={(o: any) => o === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Category">
                <SelectField T={T} value={filters.category_id} options={['', ...cats.filter((c: any) => !c.parent_id).map((c: any) => String(c.uid || c.id))]}
                  onChange={(v: any) => setF('category_id', v)}
                  render={(o: any) => o === '' ? 'All' : (cats.find((c: any) => String(c.uid || c.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Brand">
                <SelectField T={T} value={filters.brand_id} options={['', ...brands.map((b: any) => String(b.id))]}
                  onChange={(v: any) => setF('brand_id', v)}
                  render={(o: any) => o === '' ? 'All' : (brands.find((b: any) => String(b.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="From"><TextField T={T} type="date" value={filters.from} onChange={(v: any) => setF('from', v)} /></Field>
              <Field T={T} label="To"><TextField T={T} type="date" value={filters.to} onChange={(v: any) => setF('to', v)} /></Field>
            </FormGrid>
          </div>
        </div>
      </div>
      {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}

      {/* view tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
        {VIEWS.map(([id, lbl, Icon]) => (
          <button key={id} onClick={() => setView(id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: view === id ? 700 : 500, background: view === id ? T.accent.base : 'transparent', color: view === id ? T.accent.on : T.inkMid }}>
            <Icon size={13} />{lbl}
          </button>
        ))}
      </div>

      {err && <Panel T={T}><div style={{ color: T.red, fontSize: 13 }}>{err}</div></Panel>}
      {!err && (
        <Panel T={T} pad>
          <div style={{ opacity: loading ? 0.6 : 1 }}>
            <ReportTable
              key={view}
              T={T} cols={cols} rows={rows}
              title={`Product Sell Report — ${VIEWS.find(v => v[0] === view)?.[1]}`}
              subtitle={periodLabel}
              fileName={`product-sell-${view}-${filters.from}-to-${filters.to}`}
              extraTotals={view === 'detailed' ? { quantity: () => `${totals.quantity ?? 0}`, tax: () => money(totals.tax || 0) } : undefined}
              empty={loading ? 'Loading…' : 'No data available in table'}
              note={data?.limited ? <span>Showing the first 5,000 rows</span> : null}
            />
          </div>
        </Panel>
      )}
    </>
  );
}
