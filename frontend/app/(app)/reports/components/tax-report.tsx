'use client';
// ─────────────────────────────────────────────────────────────────
// Tax Report — input tax (purchases), output tax (sales) and expense
// tax registers with a column per tax rate, and the overall
// output − input − expense position.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting, formatDate } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { ReportTable, type ReportCol } from './report-table';
import { LuChevronDown, LuCalendarDays, LuArrowDown, LuArrowUp, LuCircleMinus } from 'react-icons/lu';

const TABS: [string, string, any][] = [
  ['input', 'Input Tax ( Purchase )', LuArrowDown],
  ['output', 'Output Tax ( Sales )', LuArrowUp],
  ['expense', 'Expense Tax', LuCircleMinus],
];

// Covers the PaymentMethod enum, expense payment methods and the purchase
// payment_status fallback; anything new degrades to Title Case.
const PM_LABEL: Record<string, string> = {
  cash: 'Cash', zaad: 'Zaad', evc: 'EVC', edahab: 'eDahab', mpesa: 'M-Pesa',
  telebirr: 'Telebirr', cbe_birr: 'CBE Birr', mobile_money: 'Mobile Money',
  visa: 'Visa', mastercard: 'Mastercard', card: 'Card',
  bank: 'Bank Transfer', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
  credit: 'Credit', split: 'Split', paid: 'Paid', due: 'Due', partial: 'Partial', unpaid: 'Unpaid',
};
const pmLabel = (v: any) => {
  if (!v) return '—';
  const k = String(v);
  return PM_LABEL[k] || k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
};

export function TaxReport({ T }: { T: Theme }) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [preset, setPreset] = React.useState('this_year');
  const [locs, setLocs] = React.useState<any[]>([]);
  const [contacts, setContacts] = React.useState<any[]>([]);
  const [filters, setFilters] = React.useState<any>(() => {
    const [from, to] = presetRange('this_year', 1)!;
    return { location_id: '', contact_id: '', from, to };
  });
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [menu, setMenu] = React.useState(false);
  const [tab, setTab] = React.useState('input');

  React.useEffect(() => {
    API.location.list().then(setLocs).catch(() => {});
    // Contact filter spans both sides of the ledger.
    Promise.all([
      API.contact.list({ type: 'customer' }).then((r: any) => (r || []).map((c: any) => ({ ...c, kind: 'Customer' }))).catch(() => []),
      API.contact.list({ type: 'supplier' }).then((r: any) => (r || []).map((c: any) => ({ ...c, kind: 'Supplier' }))).catch(() => []),
    ]).then(([cs, ss]) => setContacts([...cs, ...ss]));
  }, []);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const timer = setTimeout(() => {
      const params: any = { from: filters.from, to: filters.to };
      if (filters.location_id) params.location_id = filters.location_id;
      if (filters.contact_id) params.contact_id = filters.contact_id;
      API.report.tax(params)
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

  const rates: any[] = data?.rates || [];
  const rows: any[] = data?.[tab] || [];

  // Columns: the register's own fields, then one per tax rate. Group rates keep
  // a column so a business that files the group as one line still sees it.
  const cols: ReportCol[] = React.useMemo(() => {
    const base: ReportCol[] = [
      { key: 'date', label: 'Date', value: (r) => r.date ? formatDate(r.date) : '', fixed: true },
      { key: 'ref', label: tab === 'output' ? 'Invoice No.' : 'Reference No', value: (r) => r.ref, fixed: true },
    ];
    if (tab !== 'expense') {
      base.push({ key: 'contact', label: tab === 'input' ? 'Supplier' : 'Customer', value: (r) => r.contact || (tab === 'output' ? 'Walk-In Customer' : '—') });
    }
    base.push(
      { key: 'tax_number', label: 'Tax number', value: (r) => r.tax_number || '' },
      { key: 'total', label: 'Total amount', kind: 'money', total: true, value: (r) => r.total },
      { key: 'payment_method', label: 'Payment Method', value: (r) => pmLabel(r.payment_method) },
    );
    if (tab !== 'expense') base.push({ key: 'discount', label: 'Discount', kind: 'money', total: true, value: (r) => r.discount });
    // A rate earns a column when it is an active, non-group rate, or when it
    // carries money here — so a deactivated rate with history still shows, and
    // group columns (whose tax is split into their components) stay hidden
    // unless a group without components put money in its own column.
    const used = new Set<string>();
    for (const r of rows) for (const [k, v] of Object.entries(r.by_rate || {})) if (v) used.add(k);
    for (const rate of rates) {
      if (!used.has(rate.id) && (!rate.is_active || rate.is_group)) continue;
      base.push({
        key: `rate_${rate.id}`,
        label: `${rate.name}${rate.name.includes('%') ? '' : `@${rate.rate_pct}%`}${rate.is_active ? '' : ' (inactive)'}`,
        kind: 'money', total: true,
        value: (r) => r.by_rate?.[rate.id] || 0,
      });
    }
    // Tax booked without any rate at all (e.g. a hand-entered amount).
    if (used.has('untaxed')) {
      base.push({ key: 'rate_untaxed', label: 'No rate', kind: 'money', total: true, value: (r) => r.by_rate?.untaxed || 0 });
    }
    return base;
  }, [tab, rates, rows]);

  // Computed from the rows the table is actually showing, so it tracks search.
  const methodSummary = (shown: any[]) => {
    const counts: Record<string, number> = {};
    for (const r of shown) if (r.payment_method) counts[r.payment_method] = (counts[r.payment_method] || 0) + 1;
    return Object.entries(counts).map(([k, n]) => `${pmLabel(k)} - ${n}`).join(', ');
  };
  const net = Number(data?.overall?.net_tax || 0);
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
          <div style={{ flex: 1, minWidth: 520 }}>
            <FormGrid cols={4}>
              <Field T={T} label="Business Location">
                <SelectField T={T} value={filters.location_id}
                  options={['', ...locs.map((l: any) => String(l.id))]}
                  onChange={(v: any) => setF('location_id', v)}
                  render={(o: any) => o === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Contact">
                <SelectField T={T} value={filters.contact_id}
                  options={['', ...contacts.map((c: any) => String(c.id))]}
                  onChange={(v: any) => setF('contact_id', v)}
                  render={(o: any) => {
                    if (o === '') return 'All';
                    const c = contacts.find((x: any) => String(x.id) === o);
                    return c ? `${c.name} (${c.kind})` : o;
                  }} />
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
        <>
          <Panel T={T} title="Overall">
            <div style={{ opacity: loading ? 0.6 : 1 }}>
              <div style={{ fontSize: 15.5 }}>
                <span style={{ color: T.inkMid }}>Output Tax − Input Tax − Expense Tax: </span>
                <b style={{ fontFamily: T.fMono, color: net < 0 ? T.red : T.ink }}>{money(net)}</b>
              </div>
              <div style={{ fontSize: 12, color: T.inkMute, marginTop: 8 }}>
                Positive = tax owed to the authority; negative = reclaimable. Output{' '}
                <b style={{ color: T.inkMid }}>{money(data?.totals?.output?.tax || 0)}</b>, input{' '}
                <b style={{ color: T.inkMid }}>{money(data?.totals?.input?.tax || 0)}</b>, expense{' '}
                <b style={{ color: T.inkMid }}>{money(data?.totals?.expense?.tax || 0)}</b>.
              </div>
            </div>
          </Panel>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
              {TABS.map(([id, lbl, Icon]) => (
                <button key={id} onClick={() => setTab(id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>
                  <Icon size={13} />{lbl}
                </button>
              ))}
            </div>
            <Panel T={T} pad>
              <div style={{ opacity: loading ? 0.6 : 1 }}>
                <ReportTable
                  key={tab}
                  T={T} cols={cols} rows={rows}
                  title={`${TABS.find(t => t[0] === tab)?.[1]} — ${periodLabel}`}
                  subtitle={periodLabel}
                  fileName={`tax-${tab}-${filters.from}-to-${filters.to}`}
                  extraTotals={{ payment_method: methodSummary }}
                  empty={loading ? 'Loading…' : 'No data available in table'}
                  note={data?.limited?.[tab] ? <span>Showing the first 5,000 records</span> : null}
                />
              </div>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
