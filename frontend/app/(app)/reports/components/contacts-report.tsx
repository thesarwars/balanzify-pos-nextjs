'use client';
// ─────────────────────────────────────────────────────────────────
// Supplier & Customer Report — per contact: what they bought and sent
// back, what we bought from them and returned, their opening balance
// and the net due position.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { ReportTable, type ReportCol } from './report-table';
import { LuChevronDown, LuCalendarDays } from 'react-icons/lu';

export function ContactsReport({ T }: { T: Theme }) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [preset, setPreset] = React.useState('this_year');
  const [locs, setLocs] = React.useState<any[]>([]);
  const [groups, setGroups] = React.useState<any[]>([]);
  const [contacts, setContacts] = React.useState<any[]>([]);
  const [filters, setFilters] = React.useState<any>(() => {
    const [from, to] = presetRange('this_year', 1)!;
    return { location_id: '', type: 'all', group_id: '', contact_id: '', from, to };
  });
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => {
    API.location.list().then(setLocs).catch(() => {});
    API.customerGroup.list().then((r: any) => setGroups(Array.isArray(r) ? r : (r?.groups || []))).catch(() => {});
    Promise.all([
      API.contact.list({ type: 'customer' }).then((r: any) => (r || []).map((c: any) => ({ ...c, kind: 'Customer' }))).catch(() => []),
      API.contact.list({ type: 'supplier' }).then((r: any) => (r || []).map((c: any) => ({ ...c, kind: 'Supplier' }))).catch(() => []),
    ]).then(([cs, ss]) => setContacts([...cs, ...ss]));
  }, []);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const timer = setTimeout(() => {
      const params: any = { from: filters.from, to: filters.to, type: filters.type };
      if (filters.location_id) params.location_id = filters.location_id;
      if (filters.group_id) params.group_id = filters.group_id;
      if (filters.contact_id) params.contact_id = filters.contact_id;
      API.report.contacts(params)
        .then((r: any) => { if (!dead) setData(r); })
        .catch((e: any) => { if (!dead) setErr(e?.message || 'Could not load the report.'); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 250);
    return () => { dead = true; clearTimeout(timer); };
  }, [filters]);

  // A customer group only describes customers, so the two filters are kept
  // coherent in BOTH directions rather than returning a silently empty table.
  const setF = (k: string, v: any) => {
    if (k === 'from' || k === 'to') setPreset('custom');
    setFilters((p: any) => ({
      ...p, [k]: v,
      ...(k === 'group_id' && v && p.type === 'supplier' ? { type: 'all' } : {}),
      ...(k === 'type' && v === 'supplier' && p.group_id ? { group_id: '' } : {}),
    }));
  };
  function pickPreset(key: string) {
    setMenu(false);
    setPreset(key);
    const range = presetRange(key, fyStart);
    if (range) setFilters((p: any) => ({ ...p, from: range[0], to: range[1] }));
  }

  const rows: any[] = data?.rows || [];
  const cols: ReportCol[] = React.useMemo(() => [
    { key: 'name', label: 'Contact', value: (r) => r.name, fixed: true },
    { key: 'kind', label: 'Type', value: (r) => r.kind === 'supplier' ? 'Supplier' : 'Customer' },
    { key: 'purchase', label: 'Total Purchase', kind: 'money', total: true, value: (r) => r.purchase },
    { key: 'purchase_return', label: 'Total Purchase Return', kind: 'money', total: true, value: (r) => r.purchase_return },
    { key: 'sale', label: 'Total Sale', kind: 'money', total: true, value: (r) => r.sale },
    { key: 'sell_return', label: 'Total Sell Return', kind: 'money', total: true, value: (r) => r.sell_return },
    { key: 'opening_balance', label: 'Opening Balance', kind: 'money', total: true, value: (r) => r.opening_balance },
    { key: 'due', label: 'Due', kind: 'money', total: true, value: (r) => r.due },
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
          <div style={{ flex: 1, minWidth: 640 }}>
            <FormGrid cols={3}>
              <Field T={T} label="Customer Group Name">
                <SelectField T={T} value={filters.group_id}
                  options={['', ...groups.map((g: any) => String(g.id))]}
                  onChange={(v: any) => setF('group_id', v)}
                  render={(o: any) => o === '' ? 'All' : (groups.find((g: any) => String(g.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Type">
                <SelectField T={T} value={filters.type} options={['all', 'customer', 'supplier']}
                  onChange={(v: any) => setF('type', v)}
                  render={(o: any) => o === 'all' ? 'All' : o === 'customer' ? 'Customer' : 'Supplier'} />
              </Field>
              <Field T={T} label="Location">
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
        <Panel T={T} pad>
          <div style={{ opacity: loading ? 0.6 : 1 }}>
            <ReportTable
              T={T} cols={cols} rows={rows}
              title={`Supplier & Customer Report — ${periodLabel}`}
              subtitle={periodLabel}
              fileName={`contacts-${filters.from}-to-${filters.to}`}
              empty={loading ? 'Loading…' : 'No data available in table'}
              note={<span>Money columns are signed one way: receivable positive, payable negative — so a supplier we owe reads negative. Opening Balance is the balance seeded when the contact was created, not the unpaid remainder.</span>}
            />
          </div>
        </Panel>
      )}
    </>
  );
}
