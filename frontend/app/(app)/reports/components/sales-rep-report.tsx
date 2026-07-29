'use client';
// ─────────────────────────────────────────────────────────────────
// Sales Representative Report — a net-sale / expense summary and
// three views: sales the rep added, the subset earning commission,
// and expenses booked to them. The existing Commission Agents view
// is kept as a fourth tab (settings + per-rep payout).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid, Badge } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting, formatDateTime, formatDate } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { ReportTable, type ReportCol } from './report-table';
import { LuChevronDown, LuCalendarDays, LuReceipt, LuPercent, LuBanknote, LuUsersRound } from 'react-icons/lu';

const VIEWS: [string, string, any][] = [
  ['sales_added', 'Sales Added', LuReceipt],
  ['sales_commission', 'Sales With Commission', LuPercent],
  ['expenses', 'Expenses', LuBanknote],
  ['agents', 'Commission Agents', LuUsersRound],
];

const STATUS_TONE: Record<string, any> = { paid: 'green', partial: 'amber', due: 'red' };
const statusLabel = (s: string) => s === 'paid' ? 'Paid' : s === 'partial' ? 'Partial' : s === 'due' ? 'Due' : s;

export function SalesRepReport({ T, agentsView }: { T: Theme; agentsView?: React.ReactNode }) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [preset, setPreset] = React.useState('this_year');
  const [view, setView] = React.useState('sales_added');
  const [users, setUsers] = React.useState<any[]>([]);
  const [locs, setLocs] = React.useState<any[]>([]);
  const [filters, setFilters] = React.useState<any>(() => {
    const [from, to] = presetRange('this_year', 1)!;
    return { user_id: '', location_id: '', from, to };
  });
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => {
    API.user.list().then((r: any) => setUsers(Array.isArray(r) ? r : (r?.users || []))).catch(() => {});
    API.location.list().then(setLocs).catch(() => {});
  }, []);

  // Clear rows on view change so the previous view never shows under new columns.
  React.useEffect(() => { setData((d: any) => d ? { ...d, rows: [] } : d); }, [view]);

  React.useEffect(() => {
    if (view === 'agents') return;   // that tab renders the existing component
    let dead = false;
    setLoading(true); setErr('');
    const timer = setTimeout(() => {
      const params: any = { view, from: filters.from, to: filters.to };
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.location_id) params.location_id = filters.location_id;
      API.report.salesRepReport(params)
        .then((r: any) => { if (!dead) setData(r); })
        .catch((e: any) => { if (!dead) setErr(e?.message || 'Could not load the report.'); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 250);
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
  const sum = data?.summary || {};
  const totals = data?.totals || {};

  const cols: ReportCol[] = React.useMemo(() => {
    if (view === 'expenses') return [
      { key: 'date', label: 'Date', value: (r) => r.date ? formatDate(r.date) : '', fixed: true },
      { key: 'ref', label: 'Reference No', value: (r) => r.ref || '' },
      { key: 'category', label: 'Expense Category', value: (r) => r.category || '' },
      { key: 'location', label: 'Location', value: (r) => r.location || '' },
      { key: 'payment_status', label: 'Payment Status', value: (r) => statusLabel(r.payment_status) },
      { key: 'total', label: 'Total amount', kind: 'money', total: true, value: (r) => r.total },
      { key: 'expense_for', label: 'Expense for', value: (r) => r.expense_for || '' },
      { key: 'note', label: 'Expense note', kind: 'text', value: (r) => r.note || '' },
    ];
    const base: ReportCol[] = [
      { key: 'date', label: 'Date', value: (r) => r.date ? formatDateTime(r.date) : '', fixed: true },
      { key: 'invoice', label: 'Invoice No.', value: (r) => r.invoice || '' },
      { key: 'customer', label: 'Customer name', value: (r) => r.customer || '' },
      { key: 'location', label: 'Location', value: (r) => r.location || '' },
      { key: 'rep', label: 'Sales Rep', value: (r) => r.rep || '' },
      { key: 'payment_status', label: 'Payment Status', value: (r) => statusLabel(r.payment_status) },
      { key: 'total', label: 'Total amount', kind: 'money', total: true, value: (r) => r.total },
      { key: 'paid', label: 'Total paid', kind: 'money', total: true, value: (r) => r.paid },
      { key: 'remaining', label: 'Total remaining', kind: 'money', total: true, value: (r) => r.remaining },
    ];
    // The commission view is only meaningful if it shows what is earned.
    if (view === 'sales_commission') base.push(
      { key: 'commission_percent', label: 'Commission %', kind: 'num', value: (r) => r.commission_percent },
      { key: 'commission', label: 'Commission', kind: 'money', total: true, value: (r) => r.commission },
    );
    return base;
  }, [view]);

  // The reference prints the payment-status tally under that column.
  const statusSummary = () => Object.entries(totals.by_status || {})
    .map(([k, n]) => `${statusLabel(k)} - ${n}`).join(', ');

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
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: T.fBody, fontWeight: preset === k ? 700 : 450, background: preset === k ? T.accent.base : 'transparent', color: preset === k ? T.accent.on : T.ink }}
                    onMouseEnter={e => { if (preset !== k) e.currentTarget.style.background = T.paperAlt; }}
                    onMouseLeave={e => { if (preset !== k) e.currentTarget.style.background = 'transparent'; }}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 480 }}>
            <FormGrid cols={4}>
              <Field T={T} label="User">
                <SelectField T={T} value={filters.user_id} options={['', ...users.map((u: any) => String(u.id))]}
                  onChange={(v: any) => setF('user_id', v)}
                  render={(o: any) => o === '' ? 'All Users' : (users.find((u: any) => String(u.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Business Location">
                <SelectField T={T} value={filters.location_id} options={['', ...locs.map((l: any) => String(l.id))]}
                  onChange={(v: any) => setF('location_id', v)}
                  render={(o: any) => o === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="From"><TextField T={T} type="date" value={filters.from} onChange={(v: any) => setF('from', v)} /></Field>
              <Field T={T} label="To"><TextField T={T} type="date" value={filters.to} onChange={(v: any) => setF('to', v)} /></Field>
            </FormGrid>
          </div>
        </div>
      </div>
      {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}

      {/* summary */}
      <Panel T={T} title="Summary">
        <div style={{ opacity: loading ? 0.6 : 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 15 }}>
            <span style={{ color: T.inkMid }}>Total Sale − Total Sales Return: </span>
            <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(sum.total_sale || 0)}</b>
            <span style={{ color: T.inkMid }}> − </span>
            <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(sum.total_sales_return || 0)}</b>
            <span style={{ color: T.inkMid }}> = </span>
            <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(sum.net_sale || 0)}</b>
          </div>
          <div style={{ fontSize: 15 }}>
            <span style={{ color: T.inkMid }}>Total Expense: </span>
            <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(sum.total_expense || 0)}</b>
          </div>
          {(sum.sell_due || 0) > 0 && (
            <div style={{ fontSize: 12.5, color: T.inkSub }}>
              Sell Due <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(sum.sell_due)}</b> still outstanding on these sales.
            </div>
          )}
        </div>
      </Panel>

      {/* view tabs */}
      <div style={{ display: 'flex', gap: 4, margin: '16px 0 14px', background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
        {VIEWS.map(([id, lbl, Icon]) => (
          <button key={id} onClick={() => setView(id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: view === id ? 700 : 500, background: view === id ? T.accent.base : 'transparent', color: view === id ? T.accent.on : T.inkMid }}>
            <Icon size={13} />{lbl}
          </button>
        ))}
      </div>

      {view === 'agents' ? (agentsView || null) : err ? (
        <Panel T={T}><div style={{ color: T.red, fontSize: 13 }}>{err}</div></Panel>
      ) : (
        <Panel T={T} pad>
          <div style={{ opacity: loading ? 0.6 : 1 }}>
            <ReportTable
              key={view}
              T={T} cols={cols} rows={rows}
              title={`Sales Representative — ${VIEWS.find(v => v[0] === view)?.[1]}`}
              subtitle={`${filters.from} to ${filters.to}`}
              fileName={`sales-rep-${view}-${filters.from}-to-${filters.to}`}
              extraTotals={view === 'expenses' ? undefined : { payment_status: () => statusSummary() }}
              empty={loading ? 'Loading…' : 'No data available in table'}
              note={<span>{data?.limited ? 'Showing the first 5,000 rows. ' : ''}A sale&apos;s representative is its cashier — the only person a sale records.</span>} />
          </div>
        </Panel>
      )}
    </>
  );
}
