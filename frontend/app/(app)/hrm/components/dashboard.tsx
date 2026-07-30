'use client';
/**
 * HRM — the dashboard.
 *
 * The nine widgets the reference shows. The Overview here was six KPI tiles;
 * these are the panels an employee and a manager actually open the module for.
 * One /hrm/dashboard call backs all of them, so every panel agrees on today.
 */
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Badge } from '@/components/kit';
import { API } from '@/lib/api';
import { ListToolbar } from '@/components/list-chrome';
import { LuCake, LuUserPlus, LuCalendarOff, LuPartyPopper, LuTriangleAlert } from 'react-icons/lu';

/** Today / Upcoming, the shape the reference repeats across four widgets. */
function TwoSection({ T, title, icon, today, upcoming, render }: {
  T: Theme; title: string; icon: React.ReactNode;
  today: any[]; upcoming: any[]; render: (x: any) => React.ReactNode;
}) {
  const block = (label: string, rows: any[]) => (
    <>
      <div style={{ padding: '7px 14px', background: T.paperAlt, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub }}>{label}</div>
      {rows.length === 0
        ? <div style={{ padding: '14px', textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No data</div>
        : rows.map((r, i) => (
            <div key={i} style={{ padding: '9px 14px', borderTop: i ? `1px solid ${T.line}` : 'none', fontSize: 12.5, color: T.ink }}>{render(r)}</div>
          ))}
    </>
  );
  return (
    <Panel T={T} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>{icon}{title}</span> as any} pad={false}>
      {block('Today', today)}
      {block('Upcoming', upcoming)}
    </Panel>
  );
}

export function HrmDashboard({ T, onOpenMyPayrolls }: { T: Theme; onOpenMyPayrolls: () => void }) {
  const [d, setD] = React.useState<any>(null);
  const [err, setErr] = React.useState<any>(null);

  React.useEffect(() => {
    let dead = false;
    API.hrm.dashboard()
      .then((r: any) => { if (!dead) setD(r); })
      .catch((e: any) => { if (!dead) setErr(e?.message || 'Could not load the dashboard.'); })
      .finally(() => {});
    return () => { dead = true; };
  }, []);

  if (err) return <Panel T={T}><div style={{ color: T.redText, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}><LuTriangleAlert size={15} />{err}</div></Panel>;
  if (!d) return <Panel T={T}><div style={{ padding: 20, fontSize: 13, color: T.inkMute }}>Loading…</div></Panel>;

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 } as React.CSSProperties;
  const period = (l: any) => l.from === l.to ? l.from : `${l.from} → ${l.to}`;
  const targetsTable = () => ({
    title: 'Sales targets', fileName: 'sales-targets',
    cols: ['User', 'Target achieved last month', 'Target achieved this month'],
    rows: (d.sales_targets || []).map((r: any) => [r.name, r.achieved_last_month, r.achieved_this_month]),
  });

  return (
    <>
      <div style={grid}>
        <Panel T={T} title="My leaves" pad={false}>
          {!d.me
            ? <div style={{ padding: 16, fontSize: 12.5, color: T.inkMute, lineHeight: 1.5 }}>Your login is not linked to an employee record, so there is nothing to show here yet.</div>
            : d.my_leaves.length === 0
              ? <div style={{ padding: 16, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No data</div>
              : d.my_leaves.map((l: any, i: number) => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: T.ink }}>{l.type} · <span style={{ fontFamily: T.fMono, color: T.inkSub }}>{period(l)}</span></span>
                    <Badge T={T} tone={l.status === 'approved' ? 'green' : l.status === 'pending' ? 'amber' : 'red'}>{l.status}</Badge>
                  </div>
                ))}
        </Panel>

        <Panel T={T} title="My sales targets">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            {[['Target achieved last month', d.my_target?.achieved_last_month], ['Target achieved this month', d.my_target?.achieved_this_month]].map(([k, v]: any) => (
              <div key={k}>
                <div style={{ fontSize: 11.5, color: T.inkSub, marginBottom: 3 }}>{k}</div>
                <div style={{ fontFamily: T.fMono, fontSize: 18, fontWeight: 700, color: T.greenText }}>{money(v || 0)}</div>
              </div>
            ))}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{['Targets', 'Commission percent'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 0', borderBottom: `1px solid ${T.line}`, fontSize: 11, fontWeight: 700, color: T.inkSub }}>{h}</th>))}</tr></thead>
            <tbody>
              {(!d.my_target?.bands || d.my_target.bands.length === 0)
                ? <tr><td colSpan={2} style={{ padding: 12, textAlign: 'center', color: T.inkMute }}>No data</td></tr>
                : d.my_target.bands.map((b: any, i: number) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 0', fontFamily: T.fMono, color: T.inkSub }}>{money(b.from_amount)}–{b.to_amount == null ? '∞' : money(b.to_amount)}</td>
                      <td style={{ padding: '6px 0', fontFamily: T.fMono, color: T.ink }}>{b.commission_percent}%</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </Panel>

        <TwoSection T={T} title="Birthdays" icon={<LuCake size={14} />}
          today={d.birthdays.today} upcoming={d.birthdays.upcoming}
          render={(x: any) => x.name} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Btn T={T} kind="accent" onClick={onOpenMyPayrolls}>My Payrolls</Btn>
      </div>

      <div style={grid}>
        <TwoSection T={T} title="Users" icon={<LuUserPlus size={14} />}
          today={d.users.today} upcoming={d.users.upcoming}
          render={(x: any) => x.name} />
        <TwoSection T={T} title="Leaves" icon={<LuCalendarOff size={14} />}
          today={d.leaves.today} upcoming={d.leaves.upcoming}
          render={(l: any) => <>{l.employee_name} · <span style={{ color: T.inkSub }}>{l.type}</span> <span style={{ fontFamily: T.fMono, fontSize: 11.5, color: T.inkMute }}>{period(l)}</span></>} />
        <TwoSection T={T} title="Holidays" icon={<LuPartyPopper size={14} />}
          today={d.holidays.today} upcoming={d.holidays.upcoming}
          render={(h: any) => <>{h.name} <span style={{ fontFamily: T.fMono, fontSize: 11.5, color: T.inkMute }}>{h.start_date === h.end_date ? h.start_date : `${h.start_date} → ${h.end_date}`}</span></>} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 2fr', gap: 16, alignItems: 'start' }}>
        <Panel T={T} title="Today's attendance" pad={false}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Employee', 'Clock In', 'Clock Out'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '9px 14px', background: T.paperAlt, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, borderBottom: `1px solid ${T.line}` }}>{h}</th>))}</tr></thead>
            <tbody>
              {d.todays_attendance.length === 0 && <tr><td colSpan={3} style={{ padding: 18, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No data</td></tr>}
              {d.todays_attendance.map((a: any) => (
                <tr key={a.employee_id}>
                  <td style={{ padding: '9px 14px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink }}>{a.employee}</td>
                  <td style={{ padding: '9px 14px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{a.clock_in || '—'}</td>
                  <td style={{ padding: '9px 14px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{a.clock_out || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* The whole-team table is management information; the server omits it
            for everyone else rather than the client hiding it. */}
        {d.is_manager && (
          <Panel T={T} title="Sales targets">
            <ListToolbar T={T} table={targetsTable} />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['User', 'Target achieved last month', 'Target achieved this month'].map((h, i) => (
                <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '9px 4px', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, borderBottom: `1px solid ${T.line}` }}>{h}</th>))}</tr></thead>
              <tbody>
                {d.sales_targets.length === 0 && <tr><td colSpan={3} style={{ padding: 18, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No data available in table</td></tr>}
                {d.sales_targets.map((r: any) => (
                  <tr key={r.user_id}>
                    <td style={{ padding: '9px 4px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink }}>{r.name}</td>
                    <td style={{ padding: '9px 4px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{money(r.achieved_last_month)}</td>
                    <td style={{ padding: '9px 4px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.ink }}>{money(r.achieved_this_month)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </>
  );
}
