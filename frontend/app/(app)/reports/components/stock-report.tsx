'use client';
// ─────────────────────────────────────────────────────────────────
// Stock Report — current stock valued at purchase and sale price,
// potential profit, and units sold / transferred / adjusted, with a
// closing-stock summary and a Product stock history drill-down.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Field, SelectField, Modal, StatCard } from '@/components/kit';
import { API } from '@/lib/api';
import { ReportTable, type ReportCol } from './report-table';
import { LuHistory } from 'react-icons/lu';

const typeLabel = (t: any) => String(t || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

function StockHistory({ T, sel, onClose }: { T: Theme; sel: any; onClose: () => void }) {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let dead = false;
    setLoading(true);
    API.report.stockHistory({ product_id: sel.product_id, variant_id: sel.variant_id || undefined, location_id: sel.location_id || undefined })
      .then((r: any) => { if (!dead) setData(r); })
      .catch(() => { if (!dead) setData(null); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [sel]);

  const unit = data?.product?.unit || sel.unit || '';
  const qin = data?.quantities_in || {}, qout = data?.quantities_out || {};
  const stat = (label: string, val: any) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}>
      <span style={{ color: T.inkSub }}>{label}</span>
      <b style={{ fontFamily: T.fMono, color: T.ink }}>{Number(val || 0)} {unit}</b>
    </div>
  );
  const col = (title: string, items: [string, any][]) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 4 }}>{title}</div>
      {items.map(([l, v]) => <React.Fragment key={l}>{stat(l, v)}</React.Fragment>)}
    </div>
  );
  const th = (a: 'l' | 'r' = 'l'): React.CSSProperties => ({ textAlign: a === 'r' ? 'right' : 'left', padding: '9px 12px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' });
  const td = (): React.CSSProperties => ({ padding: '8px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 });

  return (
    <Modal T={T} title="Product stock history" subtitle={sel.product} width={900} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, marginBottom: 18 }}>
        {col('Quantities In', [
          ['Total Purchase', qin.total_purchase], ['Opening Stock', qin.opening_stock],
          ['Total Sell Return', qin.total_sell_return], ['Stock Transfers (In)', qin.stock_transfers_in],
          ...(qin.total_received ? [['Received', qin.total_received] as [string, any]] : []),
        ])}
        {col('Quantities Out', [
          ['Total Sold', qout.total_sold], ['Total Stock Adjustment', qout.total_stock_adjustment],
          ['Total Purchase Return', qout.total_purchase_return], ['Stock Transfers (Out)', qout.stock_transfers_out],
          ...(qout.total_issued ? [['Issued', qout.total_issued] as [string, any]] : []),
          ...(qout.total_waste ? [['Waste', qout.total_waste] as [string, any]] : []),
        ])}
        {col('Totals', [['Current stock', data?.current_stock]])}
      </div>
      <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: T.r }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
          <thead><tr>
            <th style={th()}>Type</th><th style={th('r')}>Quantity change</th><th style={th('r')}>New Quantity</th>
            <th style={th()}>Date</th><th style={th()}>Reference</th><th style={th()}>Location</th>
          </tr></thead>
          <tbody>
            {(data?.movements || []).map((m: any) => (
              <tr key={m.id}>
                <td style={td()}>{typeLabel(m.type)}</td>
                <td style={{ ...td(), textAlign: 'right', fontFamily: T.fMono, color: m.quantity >= 0 ? T.greenText : T.redText }}>{m.quantity >= 0 ? '+' : ''}{m.quantity}</td>
                <td style={{ ...td(), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{m.balance_after ?? '—'}</td>
                <td style={{ ...td(), fontSize: 12, color: T.inkSub }}>{m.date ? String(m.date).slice(0, 16).replace('T', ' ') : ''}</td>
                <td style={{ ...td(), fontSize: 12, color: T.inkSub }}>{m.reference_type ? typeLabel(m.reference_type) : (m.notes || '—')}</td>
                <td style={{ ...td(), fontSize: 12, color: T.inkSub }}>{m.location || '—'}</td>
              </tr>
            ))}
            {!loading && !(data?.movements || []).length && (
              <tr><td colSpan={6} style={{ ...td(), textAlign: 'center', color: T.inkMute, padding: 24 }}>No stock history found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div style={{ padding: 10, textAlign: 'center', fontSize: 11.5, color: T.inkMute }}>Loading…</div>}
      {data?.limited && <div style={{ padding: '8px 2px 0', fontSize: 11.5, color: T.inkMute }}>Showing the latest 200 movements.</div>}
    </Modal>
  );
}

export function StockReport({ T }: { T: Theme }) {
  const [locs, setLocs] = React.useState<any[]>([]);
  const [cats, setCats] = React.useState<any[]>([]);
  const [filters, setFilters] = React.useState<any>({ location_id: '', category_id: '' });
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<any>(null);

  React.useEffect(() => {
    API.location.list().then(setLocs).catch(() => {});
    API.category.list().then((r: any) => setCats(Array.isArray(r) ? r : (r?.categories || r?.items || []))).catch(() => {});
  }, []);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const timer = setTimeout(() => {
      const params: any = {};
      if (filters.location_id) params.location_id = filters.location_id;
      if (filters.category_id) params.category_id = filters.category_id;
      API.report.stock(params)
        .then((r: any) => { if (!dead) setData(r); })
        .catch((e: any) => { if (!dead) setErr(e?.message || 'Could not load the report.'); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 250);
    return () => { dead = true; clearTimeout(timer); };
  }, [filters]);

  const setF = (k: string, v: any) => setFilters((p: any) => ({ ...p, [k]: v }));
  const rows: any[] = data?.rows || [];
  const sum = data?.summary || {};
  const customFields: string[] = data?.custom_fields || [];

  const cols: ReportCol[] = React.useMemo(() => {
    const base: ReportCol[] = [
      { key: 'sku', label: 'SKU', value: (r) => r.sku || '', fixed: true },
      { key: 'product', label: 'Product', value: (r) => r.product, fixed: true },
      { key: 'variation', label: 'Variation', value: (r) => r.variation || '' },
      { key: 'category', label: 'Category', value: (r) => r.category || '' },
      { key: 'location', label: 'Location', value: (r) => r.location || '' },
      { key: 'unit_selling_price', label: 'Unit Selling Price', kind: 'money', value: (r) => r.unit_selling_price },
      { key: 'current_stock', label: 'Current stock', kind: 'num', total: true, value: (r) => r.current_stock },
      { key: 'stock_value_purchase', label: 'Current Stock Value (purchase)', kind: 'money', total: true, value: (r) => r.stock_value_purchase },
      { key: 'stock_value_sale', label: 'Current Stock Value (sale)', kind: 'money', total: true, value: (r) => r.stock_value_sale },
      { key: 'potential_profit', label: 'Potential profit', kind: 'money', total: true, value: (r) => r.potential_profit },
      { key: 'total_sold', label: 'Total unit sold', kind: 'num', total: true, value: (r) => r.total_sold },
      { key: 'total_transferred_in', label: 'Total Unit Transferred In', kind: 'num', total: true, value: (r) => r.total_transferred_in },
      { key: 'total_transferred_out', label: 'Total Unit Transferred Out', kind: 'num', total: true, value: (r) => r.total_transferred_out },
      { key: 'total_adjusted', label: 'Total Unit Adjusted', kind: 'num', total: true, value: (r) => r.total_adjusted },
    ];
    customFields.forEach((label, i) => base.push({ key: `cf_${i}`, label, value: (r) => (r.custom && r.custom[i]) || '' }));
    return base;
  }, [customFields]);

  return (
    <>
      {/* summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16, opacity: loading ? 0.6 : 1 }}>
        <StatCard T={T} label="Closing stock (purchase price)" value={money(sum.closing_stock_purchase || 0)} />
        <StatCard T={T} label="Closing stock (sale price)" value={money(sum.closing_stock_sale || 0)} />
        <StatCard T={T} label="Potential profit" value={money(sum.potential_profit || 0)} />
        <StatCard T={T} label="Profit margin %" value={`${sum.profit_margin_pct ?? 0}%`} />
      </div>

      {/* filters */}
      <div style={{ padding: '16px 20px', background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 240 }}>
            <Field T={T} label="Location">
              <SelectField T={T} value={filters.location_id}
                options={['', ...locs.map((l: any) => String(l.id))]}
                onChange={(v: any) => setF('location_id', v)}
                render={(o: any) => o === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
            </Field>
          </div>
          <div style={{ minWidth: 240 }}>
            <Field T={T} label="Category">
              <SelectField T={T} value={filters.category_id}
                options={['', ...cats.map((c: any) => String(c.uid || c.id))]}
                onChange={(v: any) => setF('category_id', v)}
                render={(o: any) => o === '' ? 'All categories' : (cats.find((c: any) => String(c.uid || c.id) === o) || {}).name || o} />
            </Field>
          </div>
        </div>
      </div>

      {err && <Panel T={T}><div style={{ color: T.red, fontSize: 13 }}>{err}</div></Panel>}
      {!err && (
        <Panel T={T} pad>
          <div style={{ opacity: loading ? 0.6 : 1 }}>
            <ReportTable
              T={T} cols={cols} rows={rows}
              title="Stock Report"
              fileName="stock-report"
              empty={loading ? 'Loading…' : 'No data available in table'}
              rowAction={(r) => (
                <Btn T={T} kind="ghost" onClick={() => setSel(r)} style={{ padding: '5px 10px', fontSize: 11.5 }}>
                  <LuHistory size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Stock history
                </Btn>
              )}
            />
          </div>
        </Panel>
      )}
      {sel && <StockHistory T={T} sel={sel} onClose={() => setSel(null)} />}
    </>
  );
}
