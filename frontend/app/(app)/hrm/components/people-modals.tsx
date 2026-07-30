'use client';
/**
 * HRM — employees, the profile drawer, departments/designations and holidays.
 *
 * Split out of hrm-screen.tsx; see that file for the screen itself.
 */
import React from 'react';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useSession } from '@/components/shell';
import { API } from '@/lib/api';
import { LuUsers, LuPrinter, LuSettings, LuTriangleAlert, LuSearch, LuCheck, LuClock, LuHourglass, LuBanknote, LuListTodo, LuX, LuPlay } from 'react-icons/lu';
import { BUSINESS } from '@/lib/data';
import { todayLocal } from '@/lib/business-settings';
const { useState: useStateHr, useEffect: useEffectHr } = React;
import { hrAvatar, hrInitials, hrMini } from './shared';

// Add or edit a department / designation. Renaming carries the assigned
// employees across, since Employee.department is a denormalised string.
export function OrgUnitModal({ T, kind, unit, onClose, onSaved }: { T: any; kind: string; unit?: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!unit;
  const label = kind === 'department' ? 'Department' : 'Designation';
  const [f, setF] = useStateHr<any>(editing
    ? { name: unit.name, code: unit.code || '', description: unit.description || '' }
    : { name: '', code: '', description: '' });
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  return (
    <Modal T={T} title={editing ? `Edit ${unit.name}` : `Add ${label.toLowerCase()}`} width={520} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => {
        if (!f.name.trim()) { setErr('Name is required.'); return; }
        setBusy(true); setErr(null);
        try { if (editing) await API.hrm.updateOrg(unit.id, f); else await API.hrm.addOrg(kind, f.name, f); onSaved(); }
        catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add'}</Btn></>}>
      <FormGrid>
        <Field T={T} label={label} full><TextField T={T} value={f.name} onChange={v => set('name', v)} placeholder={`e.g. ${kind === 'department' ? 'Warehouse' : 'Supervisor'}`} /></Field>
        {kind === 'department' && <Field T={T} label="Department ID" hint="A short code of your own, e.g. WH" full><TextField T={T} value={f.code} onChange={v => set('code', v)} /></Field>}
        <Field T={T} label="Description" full><TextField T={T} value={f.description} onChange={v => set('description', v)} placeholder="Optional" /></Field>
      </FormGrid>
      {editing && unit.count > 0 && <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}`, fontSize: 12, color: T.inkMid, lineHeight: 1.5 }}>
        Renaming moves the {unit.count} assigned employee(s) to the new name.
      </div>}
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

// Add / edit a holiday. A holiday spans a date range and is either company-wide
// or scoped to one location.
export function HolidayModal({ T, locs, holiday, onClose, onSaved }: { T: any; locs: any[]; holiday?: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!holiday;
  const today = todayLocal();
  const [f, setF] = useStateHr<any>(editing
    ? { name: holiday.name, start_date: holiday.start_date, end_date: holiday.end_date, location_id: holiday.location_id || '', note: holiday.note || '' }
    : { name: '', start_date: today, end_date: today, location_id: '', note: '' });
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  // Moving the start past the end drags the end with it, so the range stays valid.
  const set = (k: string, v: any) => setF((s: any) => {
    const nf = { ...s, [k]: v };
    if (k === 'start_date' && nf.end_date < v) nf.end_date = v;
    return nf;
  });
  return (
    <Modal T={T} title={editing ? `Edit ${holiday.name}` : 'Add holiday'} width={520} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => {
        if (!f.name.trim()) { setErr('Name is required.'); return; }
        if (!f.start_date || !f.end_date) { setErr('Pick a start and end date.'); return; }
        if (f.end_date < f.start_date) { setErr('End date cannot be before the start date.'); return; }
        setBusy(true); setErr(null);
        try { if (editing) await API.hrm.updateHoliday(holiday.id, f); else await API.hrm.addHoliday(f); onSaved(); }
        catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add holiday'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Name" full><TextField T={T} value={f.name} onChange={v => set('name', v)} placeholder="e.g. Eid al-Fitr" /></Field>
        <Field T={T} label="Start date"><TextField T={T} type="date" value={f.start_date} onChange={v => set('start_date', v)} /></Field>
        <Field T={T} label="End date"><TextField T={T} type="date" value={f.end_date} onChange={v => set('end_date', v)} /></Field>
        <Field T={T} label="Business location" full>
          <SelectField T={T} value={String(f.location_id)} options={['', ...locs.map((l: any) => String(l.id))]}
            onChange={v => set('location_id', v)}
            render={(v: any) => v === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === v) || {}).name || v} />
        </Field>
        <Field T={T} label="Note" full><TextField T={T} value={f.note} onChange={v => set('note', v)} placeholder="Optional" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

export function EmployeeModal({ T, meta, locs, employee, onClose, onSaved }: { T: any; meta: any; locs: any[]; employee?: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!employee;
  const [f, setF] = useStateHr<any>(editing
    ? { name: employee.name || '', email: employee.email || '', department: employee.department || '', designation: employee.designation || '', location_id: employee.location_id ?? ((locs[0] || {}).id || 1), salary: String(employee.salary ?? ''), joined: employee.joined || todayLocal(), commission_percent: String(employee.commission_percent ?? '') }
    : { name: '', email: '', department: meta.departments[0] || '', designation: meta.designations[0] || '', location_id: (locs[0] || {}).id || 1, salary: '', joined: todayLocal(), commission_percent: '' });
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  // Keep numeric ids numeric (mock) but pass uuid ids through unchanged (real backend).
  const idv = (v: any) => /^\d+$/.test(String(v)) ? Number(v) : v;
  return (
    <Modal T={T} title={editing ? `Edit ${employee.name}` : 'Add employee'} width={600} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { if (!f.name.trim()) { setErr('Name is required.'); return; } setBusy(true); try { if (editing) await API.hrm.updateEmployee(employee.id, f); else await API.hrm.addEmployee(f); onSaved(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add employee'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Full name" full><TextField T={T} value={f.name} onChange={v => set('name', v)} placeholder="Employee name" /></Field>
        <Field T={T} label="Email" full><TextField T={T} type="email" value={f.email} onChange={v => set('email', v)} placeholder="name@business.so" /></Field>
        <Field T={T} label="Department"><SelectField T={T} value={f.department} options={meta.departments} onChange={v => set('department', v)} /></Field>
        <Field T={T} label="Designation"><SelectField T={T} value={f.designation} options={meta.designations} onChange={v => set('designation', v)} /></Field>
        <Field T={T} label="Location"><SelectField T={T} value={String(f.location_id)} options={locs.map(l => String(l.id))} onChange={v => set('location_id', idv(v))} render={v => (locs.find(l => String(l.id) === v) || {}).name} /></Field>
        <Field T={T} label="Monthly salary"><TextField T={T} type="number" value={f.salary} onChange={v => set('salary', v)} placeholder="0.00" /></Field>
        <Field T={T} label="Joined"><TextField T={T} type="date" value={f.joined} onChange={v => set('joined', v)} /></Field>
        <Field T={T} label="Commission %"><TextField T={T} type="number" value={f.commission_percent} onChange={v => set('commission_percent', v)} placeholder="0" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

export function EmployeeProfile({ T, profile: p, onClose }: { T: any; profile: any; onClose: () => void }) {
  const session = useSession();
  const bizName = (session && session.business_name) || BUSINESS.name;
  const atone: any = { present: 'green', late: 'amber', absent: 'red' };
  const ltone: any = { approved: 'green', pending: 'amber', rejected: 'red' };
  async function printPayslip(row: any) {
    let ps: any = null; try { ps = await API.hrm.payslip(row.id); } catch (e) {}
    const w = window.open('', '_blank', 'width=640,height=760'); if (!w) return;
    const e = ps ? ps.earnings : { basic: row.basic, allowance: row.allowance || 0, overtime: row.overtime || 0, bonus: row.bonus || 0, incentive: row.incentive || 0 };
    const d = ps ? ps.deductions : { total: row.deduction || 0, late: 0, absent: 0, advance_recovered: 0 };
    const at = ps ? ps.attendance : null;
    const lv = ps ? ps.leave : [];
    const st = ps ? ps.settings : { show_attendance: true, show_overtime: true, show_leave: true, show_advance: true, show_bonus: true, show_incentive: true, show_deduction_breakdown: true };
    const row2 = (label: any, val: any, neg?: any) => `<tr><td style="color:#555;padding:3px 0">${label}</td><td style="text-align:right;font-family:monospace;color:${neg ? '#b3261e' : '#1a1a1a'}">${neg ? '-' : ''}$${Math.abs(val).toFixed(2)}</td></tr>`;
    const earnRows = [row2('Basic salary', e.basic)]
      .concat(e.allowance ? [row2('Allowance', e.allowance)] : [])
      .concat(st.show_overtime && e.overtime ? [row2('Overtime' + (at ? ` (${at.overtime_hours}h)` : ''), e.overtime)] : [])
      .concat(st.show_bonus && e.bonus ? [row2('Bonus', e.bonus)] : [])
      .concat(st.show_incentive && e.incentive ? [row2('Incentive', e.incentive)] : []).join('');
    const dedRows = st.show_deduction_breakdown
      ? ([] as any[]).concat(d.late ? [row2('Late penalty', d.late, true)] : [])
          .concat(d.absent ? [row2('Absence', d.absent, true)] : [])
          .concat(st.show_advance && d.advance_recovered ? [row2('Advance recovery', d.advance_recovered, true)] : [])
          .concat((d.total - d.late - d.absent - (st.show_advance ? d.advance_recovered : 0)) > 0.01 ? [row2('Other deduction', d.total - d.late - d.absent - (st.show_advance ? d.advance_recovered : 0), true)] : []).join('')
      : row2('Total deductions', d.total, true);
    const attBlock = (st.show_attendance && at) ? `<div style="margin-top:16px"><div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#888;margin-bottom:6px">Attendance</div>
      <table style="width:100%;font-size:12.5px;line-height:1.9"><tr><td style="color:#555">Days worked</td><td style="text-align:right;font-family:monospace">${at.days_worked}</td><td style="color:#555;padding-left:20px">Total hours</td><td style="text-align:right;font-family:monospace">${at.total_hours}h</td></tr>
      <tr><td style="color:#555">Present / Late</td><td style="text-align:right;font-family:monospace">${at.present} / ${at.late}</td><td style="color:#555;padding-left:20px">Absent</td><td style="text-align:right;font-family:monospace">${at.absent}</td></tr></table></div>` : '';
    const leaveBlock = (st.show_leave && lv.length) ? `<div style="margin-top:16px"><div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#888;margin-bottom:6px">Leave taken</div>
      <table style="width:100%;font-size:12.5px;line-height:1.9">${lv.map((l: any) => `<tr><td style="color:#555">${l.type}</td><td style="text-align:right;font-family:monospace">${l.days} day(s)</td></tr>`).join('')}</table></div>` : '';
    w.document.write(`<html><head><title>Payslip ${p.name} ${row.month}</title></head><body style="font-family:Georgia,serif;margin:40px;color:#1a1a1a">
      <div style="text-align:center;border-bottom:2px solid #1a1a1a;padding-bottom:14px;margin-bottom:16px">
        <div style="font-size:22px;font-weight:800">${bizName}</div><div style="font-size:12px;color:#666">Payslip · ${row.month}</div></div>
      <table style="width:100%;font-size:13px;line-height:2"><tr><td style="color:#666">Employee</td><td style="text-align:right;font-weight:700">${p.name}</td></tr>
      <tr><td style="color:#666">Designation</td><td style="text-align:right">${p.designation}</td></tr>
      <tr><td style="color:#666">Location</td><td style="text-align:right">${p.location_name}</td></tr></table>
      <div style="margin-top:16px"><div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#888;margin-bottom:4px">Earnings</div>
      <table style="width:100%;font-size:13px;line-height:1.6">${earnRows}</table></div>
      <div style="margin-top:14px"><div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#888;margin-bottom:4px">Deductions</div>
      <table style="width:100%;font-size:13px;line-height:1.6">${dedRows || '<tr><td style="color:#999;padding:3px 0">None</td><td></td></tr>'}</table></div>
      ${attBlock}${leaveBlock}
      <div style="display:flex;justify-content:space-between;border-top:2px solid #1a1a1a;margin-top:16px;padding-top:10px;font-size:18px;font-weight:800"><span>NET PAY</span><span style="font-family:monospace">$${row.net.toFixed(2)}</span></div>
      <div style="text-align:center;font-size:11px;color:#888;margin-top:30px">Generated by Balanzify POS · ${bizName}</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
  }
  const Stat = ({ label, value, tone }: { label: any; value: any; tone?: any }) => <div style={{ background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r, padding: '12px 14px' }}><div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub }}>{label}</div><div style={{ fontFamily: T.fMono, fontSize: 19, fontWeight: 600, color: tone || T.ink, marginTop: 3 }}>{value}</div></div>;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.4)', zIndex: 80, animation: 'fadeIn .15s ease' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px, 100%)', background: T.paper, zIndex: 81, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(0,0,0,0.18)', animation: 'slideLeft .22s cubic-bezier(.2,.7,.3,1)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 24px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
            <span style={hrAvatar(T, p.name, 46)}>{hrInitials(p.name)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: T.fDisplay, fontSize: 22, fontWeight: T.dispWeight, color: T.ink, letterSpacing: T.dispTrack }}>{p.name}</div>
              <div style={{ fontSize: 12.5, color: T.inkSub, marginTop: 3 }}>{p.designation} · {p.department} · {p.location_name}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid, cursor: 'pointer', fontSize: 15, lineHeight: 0 }}><LuX size={14} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      {/* POS link + sales */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {p.user_name ? <Badge T={T} tone="green">◉ Cashier: {p.user_name}</Badge> : <Badge T={T} tone="gray">Not linked to a POS user</Badge>}
        <Badge T={T} tone="gray">Joined {p.joined}</Badge>
        <Badge T={T} tone={p.status === 'active' ? 'green' : 'blue'}>{p.status === 'on_leave' ? 'on leave' : p.status}</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Stat label="Salary" value={money(p.salary)} />
        <Stat label="Sales rung" value={money(p.sales.total_sale)} tone={T.green} />
        <Stat label="Transactions" value={p.sales.tx_count} />
        <Stat label={`Commission ${p.sales.commission_percent}%`} value={money(p.sales.commission)} tone={T.accent.text} />
      </div>
      {/* payroll history with payslip */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 8 }}>Payroll history</div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden', marginBottom: 18 }}>
        {p.payroll.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No payroll runs yet.</div>}
        {p.payroll.map((row: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 13px', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
            <div><span style={{ fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.ink }}>{row.month}</span> <Badge T={T} tone="green" style={{ marginLeft: 6 }}>{row.status}</Badge></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontFamily: T.fMono, fontSize: 13, fontWeight: 700, color: T.ink }}>{money(row.net)}</span><button onClick={() => printPayslip(row)} style={hrMini(T)}><LuPrinter size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Payslip</button></div>
          </div>
        ))}
      </div>
      {/* attendance + leave history */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 8 }}>Recent attendance</div>
          {p.attendance.slice(-5).reverse().map((a: any, i: number) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderTop: i ? `1px solid ${T.line}` : 'none' }}><span style={{ fontFamily: T.fMono, color: T.inkSub }}>{a.date}</span><Badge T={T} tone={atone[a.status]}>{a.status}</Badge></div>)}
          {p.attendance.length === 0 && <div style={{ fontSize: 12, color: T.inkMute }}>No records.</div>}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 8 }}>Leave history</div>
          {p.leaves.map((l: any, i: number) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderTop: i ? `1px solid ${T.line}` : 'none' }}><span style={{ color: T.inkMid }}>{l.type} · {l.days}d</span><Badge T={T} tone={ltone[l.status]}>{l.status}</Badge></div>)}
          {p.leaves.length === 0 && <div style={{ fontSize: 12, color: T.inkMute }}>No leave taken.</div>}
        </div>
      </div>
        </div>
      </div>
    </>
  );
}

export function OrgModal({ T, onClose, onSaved }: { T: any; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useStateHr('department');
  const [name, setName] = useStateHr('');
  const [busy, setBusy] = useStateHr(false);
  const [err, setErr] = useStateHr<any>(null);
  return (
    <Modal T={T} title="Add department / designation" width={460} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { if (!name.trim()) { setErr('Name required.'); return; } setBusy(true); setErr(null); try { await API.hrm.addOrg(kind, name.trim()); onSaved(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : 'Add'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Type"><SelectField T={T} value={kind} options={['department', 'designation']} onChange={setKind} render={v => v === 'department' ? 'Department' : 'Designation'} /></Field>
        <Field T={T} label="Name"><TextField T={T} value={name} onChange={setName} placeholder={kind === 'department' ? 'e.g. Logistics' : 'e.g. Supervisor'} /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}
