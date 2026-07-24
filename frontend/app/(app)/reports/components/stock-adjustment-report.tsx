'use client';
// ─────────────────────────────────────────────────────────────────
// Stock Adjustment Report — normal / abnormal / recovered totals and
// the adjustment-document list for a location + date range.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid, StatCard } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting, formatDate } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { ReportTable, type ReportCol } from './report-table';
import { LuChevronDown, LuCalendarDays } from 'react-icons/lu';

export function StockAdjustmentReport({ T }: { T: Theme }) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [preset, setPreset] = React.useState('this_year');
  const [locs, setLocs] = React.useState<any[]>([]);
  const [filters, setFilters] = React.useState<any>(() => {
    const [from, to] = presetRange('this_year', 1)!;
    return { location_id: '', from, to };
  });
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => { API.location.list().then(setLocs).catch(() => {}); }, []);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const timer = setTimeout(() => {
      const params: any = { from: filters.from, to: filters.to };
      if (filters.location_id) params.location_id = filters.location_id;
      API.report.stockAdjustment(params)
        .then((r: any) => { if (!dead) setData(r); })
        .catch((e: any) => { if (!dead) setErr(e?.message || 'Could not load the report.'); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 250);
    return () => { dead = true; clearTimeout(timer); };
  }, [filters]);

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
  const sum = data?.summary || {};
  const cols: ReportCol[] = React.useMemo(() => [
    { key: 'date', label: 'Date', value: (r) => r.date ? formatDate(r.date) : '', fixed: true },
    { key: 'ref', label: 'Reference No', value: (r) => r.ref, fixed: true },
    { key: 'location', label: 'Location', value: (r) => r.location || '' },
    { key: 'type', label: 'Adjustment type', value: (r) => r.type === 'abnormal' ? 'Abnormal' : 'Normal' },
    { key: 'total_amount', label: 'Total Amount', kind: 'money', total: true, value: (r) => r.total_amount },
    { key: 'total_recovered', label: 'Total amount recovered', kind: 'money', total: true, value: (r) => r.total_recovered },
    { key: 'reason', label: 'Reason', value: (r) => r.reason || '' },
    { key: 'added_by', label: 'Added By', value: (r) => r.added_by || '' },
  ], []);
  const periodLabel = `${filters.from} to ${filters.to}`;

  return (
    <>
      {/* filters */}
      <div style={{ padding: '16px 20px', background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: T.fBody, fontWeight: preset === k ? 700 : 450, background: preset === k ? T.accent.base : 'transparent', color: preset === k ? T.accent.on : T.ink }}
                    onMouseEnter={e => { if (preset !== k) e.currentTarget.style.background = T.paperAlt; }}
                    onMouseLeave={e => { if (preset !== k) e.currentTarget.style.background = 'transparent'; }}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ minWidth: 240 }}>
            <Field T={T} label="Location">
              <SelectField T={T} value={filters.location_id}
                options={['', ...locs.map((l: any) => String(l.id))]}
                onChange={(v: any) => setF('location_id', v)}
                render={(o: any) => o === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
            </Field>
          </div>
          <div style={{ minWidth: 160 }}><Field T={T} label="From"><TextField T={T} type="date" value={filters.from} onChange={(v: any) => setF('from', v)} /></Field></div>
          <div style={{ minWidth: 160 }}><Field T={T} label="To"><TextField T={T} type="date" value={filters.to} onChange={(v: any) => setF('to', v)} /></Field></div>
        </div>
      </div>
      {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}

      {err && <Panel T={T}><div style={{ color: T.red, fontSize: 13 }}>{err}</div></Panel>}
      {!err && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16, opacity: loading ? 0.6 : 1 }}>
            <StatCard T={T} label="Total Normal" value={money(sum.total_normal || 0)} />
            <StatCard T={T} label="Total Abnormal" value={money(sum.total_abnormal || 0)} />
            <StatCard T={T} label="Total Stock Adjustment" value={money(sum.total_adjustment || 0)} />
            <StatCard T={T} label="Total Amount Recovered" value={money(sum.total_recovered || 0)} />
          </div>
          <Panel T={T} pad>
            <div style={{ opacity: loading ? 0.6 : 1 }}>
              <ReportTable
                T={T} cols={cols} rows={rows}
                title={`Stock Adjustment Report — ${periodLabel}`}
                subtitle={periodLabel}
                fileName={`stock-adjustments-${filters.from}-to-${filters.to}`}
                empty={loading ? 'Loading…' : 'No data available in table'}
              />
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
