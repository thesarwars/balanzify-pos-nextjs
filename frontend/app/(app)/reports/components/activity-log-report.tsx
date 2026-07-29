'use client';
// ─────────────────────────────────────────────────────────────────
// Activity Log — an audit trail of who did what and when, filterable
// by the person, the kind of subject they touched, and a date range.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting, formatDateTime } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { ReportTable, type ReportCol } from './report-table';
import { LuChevronDown, LuCalendarDays, LuSearch } from 'react-icons/lu';

const titleCase = (s: string) => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function ActivityLogReport({ T }: { T: Theme }) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [preset, setPreset] = React.useState('this_year');
  const [users, setUsers] = React.useState<any[]>([]);
  const blank = () => {
    const [from, to] = presetRange('this_year', 1)!;
    return { user_id: '', subject_type: '', from, to };
  };
  const [draft, setDraft] = React.useState<any>(blank);
  const [applied, setApplied] = React.useState<any>(blank);
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => { API.user.list().then(setUsers).catch(() => {}); }, []);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const params: any = { from: applied.from, to: applied.to };
    if (applied.user_id) params.user_id = applied.user_id;
    if (applied.subject_type) params.subject_type = applied.subject_type;
    API.report.activityLog(params)
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
  // The subject list comes from the data, so the filter only ever offers kinds
  // that actually exist for this business. Keep the applied one listed even if
  // this filtered page happens not to contain it.
  const subjects: string[] = React.useMemo(() => {
    const s = new Set<string>(data?.subject_types || []);
    if (applied.subject_type) s.add(applied.subject_type);
    return [...s].sort();
  }, [data, applied.subject_type]);

  const cols: ReportCol[] = React.useMemo(() => [
    { key: 'date', label: 'Date', value: r => r.date ? formatDateTime(r.date) : '', fixed: true },
    { key: 'subject_type', label: 'Subject Type', value: r => r.subject_type },
    { key: 'action', label: 'Action', value: r => r.action },
    { key: 'by', label: 'By', value: r => r.by || r.by_email || 'System' },
    { key: 'note', label: 'Note', value: r => r.note },
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
              <Field T={T} label="By">
                <SelectField T={T} value={draft.user_id} options={['', ...users.map((u: any) => String(u.id))]}
                  onChange={(v: any) => setF('user_id', v)}
                  render={(o: any) => o === '' ? 'All' : (users.find((u: any) => String(u.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="Subject Type">
                <SelectField T={T} value={draft.subject_type} options={['', ...subjects]}
                  onChange={(v: any) => setF('subject_type', v)}
                  render={(o: any) => o === '' ? 'All' : titleCase(o)} />
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
        <Panel T={T} pad>
          <div style={{ opacity: loading ? 0.6 : 1 }}>
            <ReportTable
              T={T} cols={cols} rows={rows}
              title="Activity Log" subtitle={`${applied.from} to ${applied.to}`}
              fileName={`activity-log-${applied.from}-to-${applied.to}`}
              empty={loading ? 'Loading…' : 'No data available in table'}
              note={data?.limited
                ? <span>Showing the 5,000 most recent entries — narrow the date range to see older activity.</span>
                : undefined} />
          </div>
        </Panel>
      )}
    </>
  );
}
