'use client';
// ─────────────────────────────────────────────────────────────────
// Expense Report — total expense per category as a bar chart and a
// table, for a location + category + date range.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { ReportTable, type ReportCol } from './report-table';
import { LuChevronDown, LuCalendarDays, LuSearch } from 'react-icons/lu';

export function ExpenseReport({ T }: { T: Theme }) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [preset, setPreset] = React.useState('this_year');
  const [locs, setLocs] = React.useState<any[]>([]);
  const [cats, setCats] = React.useState<any[]>([]);
  const blank = () => {
    const [from, to] = presetRange('this_year', 1)!;
    return { location_id: '', category_id: '', from, to };
  };
  // The reference runs this report on Apply Filters.
  const [draft, setDraft] = React.useState<any>(blank);
  const [applied, setApplied] = React.useState<any>(blank);
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => {
    API.location.list().then(setLocs).catch(() => {});
    API.expense.categories().then((r: any) => setCats(Array.isArray(r) ? r : (r?.categories || []))).catch(() => {});
  }, []);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const params: any = { from: applied.from, to: applied.to };
    if (applied.location_id) params.location_id = applied.location_id;
    if (applied.category_id) params.category_id = applied.category_id;
    API.report.expenses(params)
      .then((r: any) => { if (!dead) setData(r); })
      .catch((e: any) => { if (!dead) setErr(e?.message || 'Could not load the report.'); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [applied]);

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

  const rows: any[] = data?.rows || [];
  // Bars scale to the largest magnitude so a refund-heavy category still reads.
  const max = Math.max(1, ...rows.map((r: any) => Math.abs(r.total || 0)));
  const cols: ReportCol[] = React.useMemo(() => [
    { key: 'label', label: 'Expense Categories', value: (r) => r.label, fixed: true },
    { key: 'count', label: 'Expenses', kind: 'num', total: true, value: (r) => r.count },
    { key: 'total', label: 'Total Expense', kind: 'money', total: true, value: (r) => r.total },
  ], []);

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
              <Field T={T} label="Business Location">
                <SelectField T={T} value={draft.location_id} options={['', ...locs.map((l: any) => String(l.id))]}
                  onChange={(v: any) => setF('location_id', v)}
                  render={(o: any) => o === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Category">
                <SelectField T={T} value={draft.category_id} options={['', ...cats.filter((c: any) => !c.parent_id).map((c: any) => String(c.id))]}
                  onChange={(v: any) => setF('category_id', v)}
                  render={(o: any) => o === '' ? 'All' : (cats.find((c: any) => String(c.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="From"><TextField T={T} type="date" value={draft.from} onChange={(v: any) => setF('from', v)} /></Field>
              <Field T={T} label="To"><TextField T={T} type="date" value={draft.to} onChange={(v: any) => setF('to', v)} /></Field>
            </FormGrid>
          </div>
          <div style={{ paddingBottom: 2 }}>
            <Btn T={T} kind="accent" onClick={() => setApplied({ ...draft })}>
              <LuSearch size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Apply Filters
            </Btn>
          </div>
        </div>
      </div>
      {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}

      {err && <Panel T={T}><div style={{ color: T.red, fontSize: 13 }}>{err}</div></Panel>}
      {!err && (
        <>
          <Panel T={T} title="Expense Report">
            <div style={{ opacity: loading ? 0.6 : 1 }}>
              {rows.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>
                  {loading ? 'Loading…' : 'No expenses in this period.'}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 280, padding: '20px 8px 0', overflowX: 'auto' }}>
                  {rows.map((r: any) => (
                    <div key={r.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 90, flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ fontFamily: T.fMono, fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{money(r.total)}</div>
                      <div title={`${r.count} expense(s)`}
                        style={{ width: '100%', maxWidth: 88, height: `${Math.max(2, (Math.abs(r.total) / max) * 195)}px`, background: `linear-gradient(180deg, ${T.accent.bright}, ${T.accent.base})`, borderRadius: '6px 6px 0 0' }} />
                      <div style={{ fontSize: 11, color: T.inkMid, marginTop: 8, textAlign: 'center', lineHeight: 1.35, maxWidth: 120 }}>{r.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ textAlign: 'center', fontSize: 12, color: T.inkSub, marginTop: 14 }}>● Total Expense</div>
            </div>
          </Panel>
          <div style={{ marginTop: 16 }}>
            <Panel T={T} pad>
              <div style={{ opacity: loading ? 0.6 : 1 }}>
                <ReportTable
                  T={T} cols={cols} rows={rows}
                  title="Expense Report" subtitle={`${applied.from} to ${applied.to}`}
                  fileName={`expenses-${applied.from}-to-${applied.to}`}
                  empty={loading ? 'Loading…' : 'No data available in table'}
                  note={<span>A refunded expense subtracts, so a category can total below zero.</span>} />
              </div>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
