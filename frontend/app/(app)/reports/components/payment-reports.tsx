'use client';
// ─────────────────────────────────────────────────────────────────
// Payment reports — Purchase Payment, Sell Payment, and the
// Payment by Age pivot. "Age" is how long the money took to arrive:
// days from the document date to the payment date.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting, formatDate } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { ReportTable, type ReportCol } from './report-table';
import { LuChevronDown, LuCalendarDays } from 'react-icons/lu';

const AGES = ['1-15', '15-30', '30-45', '45-60', '60-75', '75-90', '90+'];

// The shared "Filter by date" button used by every report screen.
function PeriodPicker({ T, preset, onPick }: { T: Theme; preset: string; onPick: (k: string) => void }) {
  const [menu, setMenu] = React.useState(false);
  return (
    <>
      <div style={{ position: 'relative', paddingBottom: 2 }}>
        <Btn T={T} kind="accent" onClick={() => setMenu(!menu)}>
          <LuCalendarDays size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          {(DATE_PRESETS.find(([k]) => k === preset) || [, 'Filter by date'])[1]}
          <LuChevronDown size={12} style={{ verticalAlign: -1, marginLeft: 6 }} />
        </Btn>
        {menu && (
          <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 30, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, minWidth: 190, maxHeight: 340, overflowY: 'auto' }}>
            {DATE_PRESETS.map(([k, lbl]) => (
              <button key={k} onClick={() => { setMenu(false); onPick(k); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: T.fBody, fontWeight: preset === k ? 700 : 450, background: preset === k ? T.accent.base : 'transparent', color: preset === k ? T.accent.on : T.ink }}
                onMouseEnter={e => { if (preset !== k) e.currentTarget.style.background = T.paperAlt; }}
                onMouseLeave={e => { if (preset !== k) e.currentTarget.style.background = 'transparent'; }}>
                {lbl}
              </button>
            ))}
          </div>
        )}
      </div>
      {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}
    </>
  );
}

// Shared state + fetch plumbing for the three screens.
function usePaymentReport(fetcher: (params: any) => Promise<any>, extra: Record<string, string> = {}) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [preset, setPreset] = React.useState('this_year');
  const [filters, setFilters] = React.useState<any>(() => {
    const [from, to] = presetRange('this_year', 1)!;
    return { location_id: '', from, to, ...extra };
  });
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const timer = setTimeout(() => {
      const params: any = { from: filters.from, to: filters.to };
      for (const [k, v] of Object.entries(filters)) {
        if (k !== 'from' && k !== 'to' && v) params[k] = v;
      }
      fetcher(params)
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
  const pick = (key: string) => {
    setPreset(key);
    const range = presetRange(key, fyStart);
    if (range) setFilters((p: any) => ({ ...p, from: range[0], to: range[1] }));
  };
  return { preset, pick, filters, setF, data, err, loading };
}

const shell = (T: Theme, filterBar: React.ReactNode, err: string, body: React.ReactNode) => (
  <>
    <div style={{ padding: '16px 20px', background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>{filterBar}</div>
    </div>
    {err ? <Panel T={T}><div style={{ color: T.red, fontSize: 13 }}>{err}</div></Panel> : body}
  </>
);

// ── Purchase Payment ─────────────────────────────────────────────
export function PurchasePaymentReport({ T }: { T: Theme }) {
  const [locs, setLocs] = React.useState<any[]>([]);
  const [suppliers, setSuppliers] = React.useState<any[]>([]);
  const { preset, pick, filters, setF, data, err, loading } = usePaymentReport(API.report.purchasePayments, { supplier_id: '' });

  React.useEffect(() => {
    API.location.list().then(setLocs).catch(() => {});
    API.contact.list({ type: 'supplier' }).then((r: any) => setSuppliers(r || [])).catch(() => {});
  }, []);

  const cols: ReportCol[] = React.useMemo(() => [
    { key: 'ref', label: 'Reference No', value: (r) => r.ref, fixed: true },
    { key: 'paid_on', label: 'Paid on', value: (r) => r.paid_on ? formatDate(r.paid_on) : '' },
    { key: 'amount', label: 'Amount', kind: 'money', total: true, value: (r) => r.amount },
    { key: 'supplier', label: 'Supplier', value: (r) => r.supplier || '' },
    { key: 'payment_method', label: 'Payment Method', value: (r) => r.payment_method || '' },
    { key: 'purchase', label: 'Purchase', value: (r) => r.purchase || '' },
    { key: 'user', label: 'Added By', value: (r) => r.user || '' },
  ], []);

  return shell(T, (
    <>
      <PeriodPicker T={T} preset={preset} onPick={pick} />
      <div style={{ flex: 1, minWidth: 520 }}>
        <FormGrid cols={4}>
          <Field T={T} label="Supplier">
            <SelectField T={T} value={filters.supplier_id} options={['', ...suppliers.map((s: any) => String(s.id))]}
              onChange={(v: any) => setF('supplier_id', v)}
              render={(o: any) => o === '' ? 'All' : (suppliers.find((s: any) => String(s.id) === o) || {}).name || o} />
          </Field>
          <Field T={T} label="Business Location">
            <SelectField T={T} value={filters.location_id} options={['', ...locs.map((l: any) => String(l.id))]}
              onChange={(v: any) => setF('location_id', v)}
              render={(o: any) => o === '' ? 'All' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
          </Field>
          <Field T={T} label="From"><TextField T={T} type="date" value={filters.from} onChange={(v: any) => setF('from', v)} /></Field>
          <Field T={T} label="To"><TextField T={T} type="date" value={filters.to} onChange={(v: any) => setF('to', v)} /></Field>
        </FormGrid>
      </div>
    </>
  ), err, (
    <Panel T={T} pad>
      <div style={{ opacity: loading ? 0.6 : 1 }}>
        <ReportTable T={T} cols={cols} rows={data?.rows || []}
          title="Purchase Payment Report" subtitle={`${filters.from} to ${filters.to}`}
          fileName={`purchase-payments-${filters.from}-to-${filters.to}`}
          empty={loading ? 'Loading…' : 'No data available in table'}
          note={data?.limited ? <span>Showing the most recent 5,000 payments</span> : null} />
      </div>
    </Panel>
  ));
}

// ── Sell Payment ─────────────────────────────────────────────────
export function SellPaymentReport({ T }: { T: Theme }) {
  const [locs, setLocs] = React.useState<any[]>([]);
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [groups, setGroups] = React.useState<any[]>([]);
  const [users, setUsers] = React.useState<any[]>([]);
  const [methods, setMethods] = React.useState<any[]>([]);
  const { preset, pick, filters, setF, data, err, loading } = usePaymentReport(
    API.report.sellPayments, { customer_id: '', customer_group_id: '', user_id: '', payment_method: '', age: '' });

  React.useEffect(() => {
    API.location.list().then(setLocs).catch(() => {});
    API.contact.list({ type: 'customer' }).then((r: any) => setCustomers(r || [])).catch(() => {});
    API.customerGroup.list().then((r: any) => setGroups(Array.isArray(r) ? r : (r?.groups || []))).catch(() => {});
    API.user.list().then((r: any) => setUsers(Array.isArray(r) ? r : (r?.users || []))).catch(() => {});
    API.paymentMethod.list().then((r: any) => setMethods(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const cols: ReportCol[] = React.useMemo(() => [
    { key: 'ref', label: 'Reference No', value: (r) => r.ref, fixed: true },
    { key: 'paid_on', label: 'Paid on', value: (r) => r.paid_on ? formatDate(r.paid_on) : '' },
    { key: 'amount', label: 'Amount', kind: 'money', total: true, value: (r) => r.amount },
    { key: 'age', label: 'Age', value: (r) => `${r.age_days}d (${r.age})` },
    { key: 'customer', label: 'Customer', value: (r) => r.customer || '' },
    { key: 'contact_id', label: 'Contact ID', value: (r) => r.contact_id || '' },
    { key: 'customer_group', label: 'Customer Group', value: (r) => r.customer_group || '' },
    { key: 'payment_method', label: 'Payment Method', value: (r) => r.payment_method || '' },
    { key: 'sell', label: 'Sell', value: (r) => r.sell || '' },
    { key: 'user', label: 'User', value: (r) => r.user || '' },
  ], []);

  return shell(T, (
    <>
      <PeriodPicker T={T} preset={preset} onPick={pick} />
      <div style={{ flex: 1, minWidth: 640 }}>
        <FormGrid cols={4}>
          <Field T={T} label="Customer">
            <SelectField T={T} value={filters.customer_id} options={['', ...customers.map((c: any) => String(c.id))]}
              onChange={(v: any) => setF('customer_id', v)}
              render={(o: any) => o === '' ? 'All' : (customers.find((c: any) => String(c.id) === o) || {}).name || o} />
          </Field>
          <Field T={T} label="Business Location">
            <SelectField T={T} value={filters.location_id} options={['', ...locs.map((l: any) => String(l.id))]}
              onChange={(v: any) => setF('location_id', v)}
              render={(o: any) => o === '' ? 'All' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
          </Field>
          <Field T={T} label="Payment Method">
            <SelectField T={T} value={filters.payment_method} options={['', ...methods.map((m: any) => String(m.key))]}
              onChange={(v: any) => setF('payment_method', v)}
              render={(o: any) => o === '' ? 'All' : (methods.find((m: any) => String(m.key) === o) || {}).label || o} />
          </Field>
          <Field T={T} label="Customer Group">
            <SelectField T={T} value={filters.customer_group_id} options={['', ...groups.map((g: any) => String(g.id))]}
              onChange={(v: any) => setF('customer_group_id', v)}
              render={(o: any) => o === '' ? 'All' : (groups.find((g: any) => String(g.id) === o) || {}).name || o} />
          </Field>
          <Field T={T} label="User">
            <SelectField T={T} value={filters.user_id} options={['', ...users.map((u: any) => String(u.id))]}
              onChange={(v: any) => setF('user_id', v)}
              render={(o: any) => o === '' ? 'All' : (users.find((u: any) => String(u.id) === o) || {}).name || o} />
          </Field>
          <Field T={T} label="Age" hint="Days from sale to payment">
            <SelectField T={T} value={filters.age} options={['', ...AGES]}
              onChange={(v: any) => setF('age', v)} render={(o: any) => o === '' ? 'All' : o} />
          </Field>
          <Field T={T} label="From"><TextField T={T} type="date" value={filters.from} onChange={(v: any) => setF('from', v)} /></Field>
          <Field T={T} label="To"><TextField T={T} type="date" value={filters.to} onChange={(v: any) => setF('to', v)} /></Field>
        </FormGrid>
      </div>
    </>
  ), err, (
    <Panel T={T} pad>
      <div style={{ opacity: loading ? 0.6 : 1 }}>
        <ReportTable T={T} cols={cols} rows={data?.rows || []}
          title="Sell Payment Report" subtitle={`${filters.from} to ${filters.to}`}
          fileName={`sell-payments-${filters.from}-to-${filters.to}`}
          empty={loading ? 'Loading…' : 'No data available in table'}
          note={<span>{data?.limited ? 'Showing the most recent 20,000 payments. ' : ''}Age is how long the payment took to arrive — days from the sale to the payment. A credit sale counts when the money is collected, not when the sale is rung up.</span>} />
      </div>
    </Panel>
  ));
}

// ── Payment by Age (pivot) ───────────────────────────────────────
export function PaymentByAgeReport({ T }: { T: Theme }) {
  const [locs, setLocs] = React.useState<any[]>([]);
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [users, setUsers] = React.useState<any[]>([]);
  const [methods, setMethods] = React.useState<any[]>([]);
  const { preset, pick, filters, setF, data, err, loading } = usePaymentReport(
    API.report.paymentByAge, { customer_id: '', user_id: '', payment_method: '', age: '' });

  React.useEffect(() => {
    API.location.list().then(setLocs).catch(() => {});
    API.contact.list({ type: 'customer' }).then((r: any) => setCustomers(r || [])).catch(() => {});
    API.user.list().then((r: any) => setUsers(Array.isArray(r) ? r : (r?.users || []))).catch(() => {});
    API.paymentMethod.list().then((r: any) => setMethods(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const buckets: string[] = data?.age_buckets || AGES;
  const cols: ReportCol[] = React.useMemo(() => [
    { key: 'customer', label: 'Customer', value: (r) => r.customer || '', fixed: true },
    { key: 'payment_method', label: 'Payment Method', value: (r) => r.payment_method || '' },
    { key: 'user', label: 'User', value: (r) => r.user || '' },
    ...buckets.map((b) => ({ key: `age_${b}`, label: `Age ${b}`, kind: 'money' as const, total: true, value: (r: any) => r[b] || 0 })),
    { key: 'total', label: 'Total', kind: 'money' as const, total: true, value: (r: any) => r.total || 0 },
  ], [buckets.join('|')]);

  return shell(T, (
    <>
      <PeriodPicker T={T} preset={preset} onPick={pick} />
      <div style={{ flex: 1, minWidth: 640 }}>
        <FormGrid cols={4}>
          <Field T={T} label="Customer">
            <SelectField T={T} value={filters.customer_id} options={['', ...customers.map((c: any) => String(c.id))]}
              onChange={(v: any) => setF('customer_id', v)}
              render={(o: any) => o === '' ? 'All' : (customers.find((c: any) => String(c.id) === o) || {}).name || o} />
          </Field>
          <Field T={T} label="Payment Method">
            <SelectField T={T} value={filters.payment_method} options={['', ...methods.map((m: any) => String(m.key))]}
              onChange={(v: any) => setF('payment_method', v)}
              render={(o: any) => o === '' ? 'All' : (methods.find((m: any) => String(m.key) === o) || {}).label || o} />
          </Field>
          <Field T={T} label="Business Location">
            <SelectField T={T} value={filters.location_id} options={['', ...locs.map((l: any) => String(l.id))]}
              onChange={(v: any) => setF('location_id', v)}
              render={(o: any) => o === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
          </Field>
          <Field T={T} label="User">
            <SelectField T={T} value={filters.user_id} options={['', ...users.map((u: any) => String(u.id))]}
              onChange={(v: any) => setF('user_id', v)}
              render={(o: any) => o === '' ? 'All' : (users.find((u: any) => String(u.id) === o) || {}).name || o} />
          </Field>
          <Field T={T} label="Age" hint="Days from sale to payment">
            <SelectField T={T} value={filters.age} options={['', ...AGES]}
              onChange={(v: any) => setF('age', v)} render={(o: any) => o === '' ? 'All' : o} />
          </Field>
          <Field T={T} label="From"><TextField T={T} type="date" value={filters.from} onChange={(v: any) => setF('from', v)} /></Field>
          <Field T={T} label="To"><TextField T={T} type="date" value={filters.to} onChange={(v: any) => setF('to', v)} /></Field>
        </FormGrid>
      </div>
    </>
  ), err, (
    <Panel T={T} pad>
      <div style={{ opacity: loading ? 0.6 : 1 }}>
        <ReportTable T={T} cols={cols} rows={data?.rows || []}
          title="Payment by Age" subtitle={`${filters.from} to ${filters.to}`}
          fileName={`payment-by-age-${filters.from}-to-${filters.to}`}
          empty={loading ? 'Loading…' : 'No data available in table'}
          note={<span>{data?.limited ? 'Showing the most recent 20,000 payments. ' : ''}Buckets are days from the sale to the payment, so this reads as collection lag.</span>} />
      </div>
    </Panel>
  ));
}
