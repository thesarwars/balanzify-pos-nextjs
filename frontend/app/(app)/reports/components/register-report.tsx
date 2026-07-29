'use client';
// ─────────────────────────────────────────────────────────────────
// Register Report — one row per cash-register session, with the money
// taken broken down by the payment methods this business actually
// uses (a column each), plus the till's opening/closing reconciliation.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid, Badge } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting, formatDateTime } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { ReportTable, type ReportCol } from './report-table';
import { LuChevronDown, LuCalendarDays } from 'react-icons/lu';

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash', zaad: 'Zaad', evc: 'EVC', edahab: 'eDahab', mpesa: 'M-Pesa',
  telebirr: 'Telebirr', cbe_birr: 'CBE Birr', mobile_money: 'Mobile Money',
  visa: 'Visa', mastercard: 'Mastercard', card: 'Card', stripe: 'Card (Stripe)',
  bank: 'Bank Transfer', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
};
const methodLabel = (m: string) =>
  METHOD_LABEL[m] || m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function RegisterReport({ T }: { T: Theme }) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [preset, setPreset] = React.useState('this_year');
  const [users, setUsers] = React.useState<any[]>([]);
  const [locs, setLocs] = React.useState<any[]>([]);
  const [filters, setFilters] = React.useState<any>(() => {
    const [from, to] = presetRange('this_year', 1)!;
    return { user_id: '', status: '', location_id: '', from, to };
  });
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => {
    API.user.list().then((r: any) => setUsers(Array.isArray(r) ? r : (r?.users || []))).catch(() => {});
    API.location.list().then(setLocs).catch(() => {});
  }, []);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const timer = setTimeout(() => {
      const params: any = { from: filters.from, to: filters.to };
      for (const k of ['user_id', 'status', 'location_id']) if (filters[k]) params[k] = filters[k];
      API.report.registerReport(params)
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
  const methods: string[] = data?.methods || [];
  const cols: ReportCol[] = React.useMemo(() => [
    { key: 'open_time', label: 'Open Time', value: (r) => r.open_time ? formatDateTime(r.open_time) : '', fixed: true },
    { key: 'close_time', label: 'Close Time', value: (r) => r.close_time ? formatDateTime(r.close_time) : '—' },
    { key: 'location', label: 'Location', value: (r) => r.location || '' },
    { key: 'user', label: 'User', value: (r) => r.user ? `${r.user}${r.user_email ? ` (${r.user_email})` : ''}` : '' },
    { key: 'status', label: 'Status', value: (r) => r.status === 'open' ? 'Open' : 'Closed' },
    // One column per method the business actually took money with.
    ...methods.map((m) => ({
      key: `m_${m}`, label: `Total ${methodLabel(m)}`, kind: 'money' as const, total: true,
      value: (r: any) => r.by_method?.[m] || 0,
    })),
    { key: 'total_taken', label: 'Total Taken', kind: 'money' as const, total: true, value: (r: any) => r.total_taken },
    { key: 'opening_float', label: 'Opening Float', kind: 'money' as const, value: (r: any) => r.opening_float },
    { key: 'expected_cash', label: 'Expected Cash', kind: 'money' as const, value: (r: any) => r.expected_cash ?? 0 },
    { key: 'actual_cash', label: 'Actual Cash', kind: 'money' as const, value: (r: any) => r.actual_cash ?? 0 },
    { key: 'variance', label: 'Variance', kind: 'money' as const, total: true, value: (r: any) => r.variance ?? 0 },
    { key: 'transactions', label: 'Transactions', kind: 'num' as const, total: true, value: (r: any) => r.transactions },
  ], [methods.join('|')]);

  const open = rows.filter(r => r.status === 'open').length;

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
          <div style={{ flex: 1, minWidth: 520 }}>
            <FormGrid cols={4}>
              <Field T={T} label="User">
                <SelectField T={T} value={filters.user_id} options={['', ...users.map((u: any) => String(u.id))]}
                  onChange={(v: any) => setF('user_id', v)}
                  render={(o: any) => o === '' ? 'All Users' : (users.find((u: any) => String(u.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Status">
                <SelectField T={T} value={filters.status} options={['', 'open', 'closed']}
                  onChange={(v: any) => setF('status', v)}
                  render={(o: any) => o === '' ? 'All' : o === 'open' ? 'Open' : 'Closed'} />
              </Field>
              <Field T={T} label="From"><TextField T={T} type="date" value={filters.from} onChange={(v: any) => setF('from', v)} /></Field>
              <Field T={T} label="To"><TextField T={T} type="date" value={filters.to} onChange={(v: any) => setF('to', v)} /></Field>
            </FormGrid>
          </div>
        </div>
      </div>
      {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}

      {err && <Panel T={T}><div style={{ color: T.red, fontSize: 13 }}>{err}</div></Panel>}
      {!err && (
        <Panel T={T} pad>
          <div style={{ opacity: loading ? 0.6 : 1 }}>
            {open > 0 && (
              <div style={{ marginBottom: 10 }}>
                <Badge T={T} tone="amber">{open} register{open === 1 ? '' : 's'} still open</Badge>
              </div>
            )}
            <ReportTable
              T={T} cols={cols} rows={rows}
              title="Register Report" subtitle={`${filters.from} to ${filters.to}`}
              fileName={`registers-${filters.from}-to-${filters.to}`}
              empty={loading ? 'Loading…' : 'No data available in table'}
              note={<span>{data?.limited ? 'Showing the most recent 5,000 sessions. ' : ''}Money taken is the settled tenders rung up in each session; an on-account (credit) sale is not money in the till.</span>} />
          </div>
        </Panel>
      )}
    </>
  );
}
