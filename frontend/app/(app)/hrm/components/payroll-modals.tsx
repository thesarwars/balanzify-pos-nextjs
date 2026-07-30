'use client';
/**
 * HRM — running payroll, pay components, batches, payslip settings, advances,
 * tasks and sales-target bands.
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

// Tiered commission for one user: repeatable from/to/percent rows, saved as a
// set. An empty set falls back to the user's flat percent.
export function SalesTargetModal({ T, target, onClose, onSaved }: { T: any; target: any; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useStateHr<any[]>(target.bands.length
    ? target.bands.map((b: any) => ({ from_amount: String(b.from_amount), to_amount: b.to_amount == null ? '' : String(b.to_amount), commission_percent: String(b.commission_percent) }))
    : [{ from_amount: '0', to_amount: '', commission_percent: '' }]);
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  const setRow = (i: number, k: string, v: any) => setRows((s: any[]) => s.map((r, j) => j === i ? { ...r, [k]: v } : r));
  return (
    <Modal T={T} title={`Set sales target for ${target.name}`} width={560} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={async () => {
        // A blank upper bound means open-ended, not zero.
        const bands = rows
          .filter((r: any) => r.commission_percent !== '')
          .map((r: any) => ({
            from_amount: Number(r.from_amount || 0),
            to_amount: r.to_amount === '' ? null : Number(r.to_amount),
            commission_percent: Number(r.commission_percent),
          }));
        setBusy(true); setErr(null);
        try { await API.hrm.setSalesTarget(target.user_id, bands); onSaved(); }
        catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }} disabled={busy}>{busy ? 'Saving…' : 'Submit'}</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 32px', gap: 8, fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 6 }}>
        <div>Total sales amount from</div><div>Total sale amount to</div><div>Commission percent</div><div />
      </div>
      {rows.map((r: any, i: number) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <TextField T={T} type="number" value={r.from_amount} onChange={(v: any) => setRow(i, 'from_amount', v)} placeholder="0" />
          <TextField T={T} type="number" value={r.to_amount} onChange={(v: any) => setRow(i, 'to_amount', v)} placeholder="No limit" />
          <TextField T={T} type="number" value={r.commission_percent} onChange={(v: any) => setRow(i, 'commission_percent', v)} placeholder="0" />
          <button onClick={() => setRows((s: any[]) => s.filter((_, j) => j !== i))}
            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', lineHeight: 0 }}><LuX size={12} /></button>
        </div>
      ))}
      <Btn T={T} kind="ghost" onClick={() => setRows((s: any[]) => [...s, { from_amount: '', to_amount: '', commission_percent: '' }])}>+ Add band</Btn>
      <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}`, fontSize: 12, color: T.inkMid, lineHeight: 1.5 }}>
        Leave the upper bound blank for the top band. Bands must not overlap. With no bands, this user earns their flat {target.flat_percent}%.
      </div>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

// Build a batch of DRAFT payrolls. Nothing posts to the ledger until the group
// is paid, so the total can be reviewed first.
export function PayrollGroupModal({ T, emps, locs, onClose, onSaved }: { T: any; emps: any[]; locs: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useStateHr<any>({ name: '', month: new Date().toISOString().slice(0, 7), location_id: '' });
  const [sel, setSel] = useStateHr<any[]>([]);
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  // Narrowing by location narrows who you can pick, which is the point of the filter.
  const pool = f.location_id ? emps.filter((e: any) => String(e.location_id) === String(f.location_id)) : emps;
  const toggle = (id: any) => setSel((s: any[]) => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const estimate = pool.filter((e: any) => sel.includes(e.id)).reduce((s: number, e: any) => s + (Number(e.salary) || 0), 0);
  return (
    <Modal T={T} title="New payroll group" width={560} onClose={onClose}
      footer={<><div style={{ flex: 1, fontSize: 12.5, color: T.inkSub }}>{sel.length} employee(s) · basic {money(estimate)}</div><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => {
        if (!f.name.trim()) { setErr('Name is required.'); return; }
        if (!sel.length) { setErr('Pick at least one employee.'); return; }
        setBusy(true); setErr(null);
        try { await API.hrm.addPayrollGroup({ ...f, employee_ids: sel }); onSaved(); }
        catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }} disabled={busy}>{busy ? 'Creating…' : 'Proceed'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Name" full><TextField T={T} value={f.name} onChange={v => set('name', v)} placeholder="e.g. June 2026 — all staff" /></Field>
        <Field T={T} label="Month"><TextField T={T} type="month" value={f.month} onChange={v => set('month', v)} /></Field>
        <Field T={T} label="Location">
          <SelectField T={T} value={String(f.location_id)} options={['', ...locs.map((l: any) => String(l.id))]}
            onChange={v => { set('location_id', v); setSel([]); }}
            render={(v: any) => v === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === v) || {}).name || v} />
        </Field>
      </FormGrid>
      <div style={{ display: 'flex', gap: 8, margin: '14px 0 8px' }}>
        <Btn T={T} kind="ghost" onClick={() => setSel(pool.map((e: any) => e.id))}>Select all</Btn>
        <Btn T={T} kind="ghost" onClick={() => setSel([])}>Deselect all</Btn>
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${T.line}`, borderRadius: T.r }}>
        {pool.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No employees at this location.</div>}
        {pool.map((e: any, i: number) => (
          <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderTop: i ? `1px solid ${T.line}` : 'none', cursor: 'pointer' }}>
            <input type="checkbox" checked={sel.includes(e.id)} onChange={() => toggle(e.id)} />
            <span style={{ flex: 1, fontSize: 13, color: T.ink }}>{e.name}</span>
            <span style={{ fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{money(e.salary)}</span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}`, fontSize: 12, color: T.inkMid, lineHeight: 1.5 }}>
        Creates drafts using each employee's salary plus any pay components. Nothing is posted to the ledger until you press Pay.
      </div>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

// A named earning or deduction applied automatically to every payroll run.
export function PayComponentModal({ T, emps, component, onClose, onSaved }: { T: any; emps: any[]; component?: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!component;
  const [f, setF] = useStateHr<any>(editing
    ? { description: component.description, type: component.type, amount_type: component.amount_type, amount: String(component.amount), applicable_date: component.applicable_date || '', employee_id: component.employee_id || '' }
    : { description: '', type: 'earning', amount_type: 'fixed', amount: '', applicable_date: '', employee_id: '' });
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  return (
    <Modal T={T} title={editing ? `Edit ${component.description}` : 'Add pay component'} width={560} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => {
        if (!f.description.trim()) { setErr('Description is required.'); return; }
        if (f.amount_type === 'percentage' && Number(f.amount) > 100) { setErr('A percentage cannot exceed 100.'); return; }
        setBusy(true); setErr(null);
        try { if (editing) await API.hrm.updatePayComponent(component.id, f); else await API.hrm.addPayComponent(f); onSaved(); }
        catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Description" full><TextField T={T} value={f.description} onChange={v => set('description', v)} placeholder="e.g. Transport allowance" /></Field>
        <Field T={T} label="Type"><SelectField T={T} value={f.type} options={['earning', 'deduction']} onChange={v => set('type', v)} render={(v: any) => v === 'earning' ? 'Earning' : 'Deduction'} /></Field>
        <Field T={T} label="Employee" hint="Leave blank to apply to everyone">
          <SelectField T={T} value={String(f.employee_id)} options={['', ...emps.map((e: any) => String(e.id))]}
            onChange={v => set('employee_id', v)}
            render={(v: any) => v === '' ? 'All employees' : (emps.find((e: any) => String(e.id) === v) || {}).name || v} />
        </Field>
        <Field T={T} label="Amount type"><SelectField T={T} value={f.amount_type} options={['fixed', 'percentage']} onChange={v => set('amount_type', v)} render={(v: any) => v === 'fixed' ? 'Fixed' : 'Percentage of basic'} /></Field>
        <Field T={T} label="Amount"><TextField T={T} type="number" value={f.amount} onChange={v => set('amount', v)} placeholder="0" /></Field>
        <Field T={T} label="Applicable date" hint="Applies from this month onward; blank = always" full><TextField T={T} type="date" value={f.applicable_date} onChange={v => set('applicable_date', v)} /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

export function PayrollModal({ T, emps, onClose, onSaved }: { T: any; emps: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useStateHr<any>({ employee_id: (emps[0] || {}).id || '', month: new Date().toISOString().slice(0, 7), basic: '', allowance: '', overtime: '', bonus: '', incentive: '', deduction: '', advance_recovery: '', statutory_country: 'none', prorate: false });
  const [busy, setBusy] = useStateHr(false);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const emp = emps.find((e: any) => String(e.id) === String(f.employee_id));
  const [advance, setAdvance] = useStateHr<any>(0);
  const [summary, setSummary] = useStateHr<any>(null);
  React.useEffect(() => { if (emp && !f.basic) set('basic', String(emp.salary)); }, [f.employee_id]);
  React.useEffect(() => { if (f.employee_id) API.hrm.outstandingAdvance(f.employee_id).then((v: any) => { setAdvance(v); set('advance_recovery', v > 0 ? String(v) : ''); }).catch(() => {}); }, [f.employee_id]);
  // Deduction is late/absent withholding only — advance repayment has its own field.
  React.useEffect(() => { if (f.employee_id) API.hrm.empSummary(f.employee_id, f.month).then((s: any) => { setSummary(s); if (s.overtime_pay > 0) set('overtime', String(s.overtime_pay)); set('deduction', s.total_deduction > 0 ? String(+s.total_deduction.toFixed(2)) : ''); }).catch(() => {}); }, [f.employee_id, f.month]);
  const gross = (Number(f.basic) || 0) + (Number(f.allowance) || 0) + (Number(f.overtime) || 0) + (Number(f.bonus) || 0) + (Number(f.incentive) || 0);
  const [stat, setStat] = useStateHr<any>(null);
  React.useEffect(() => {
    if (f.statutory_country === 'none' || gross <= 0) { setStat(null); return; }
    let dead = false;
    API.hrm.payrollCompute(gross, f.statutory_country).then((r: any) => { if (!dead) setStat(r); }).catch(() => {});
    return () => { dead = true; };
  }, [gross, f.statutory_country]);
  const net = gross - (Number(f.deduction) || 0) - (Number(f.advance_recovery) || 0) - (stat?.total_statutory || 0);
  return (
    <Modal T={T} title="Run payroll" width={500} onClose={onClose}
      footer={<><div style={{ flex: 1, fontSize: 13, color: T.inkSub }}>Net <b style={{ color: T.ink, fontFamily: T.fMono, marginLeft: 6 }}>{money(net)}</b></div><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { setBusy(true); try { await API.hrm.addPayroll(f); onSaved(); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : 'Pay'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Employee" full><SelectField T={T} value={String(f.employee_id)} options={emps.map((e: any) => String(e.id))} onChange={v => set('employee_id', /^\d+$/.test(String(v)) ? Number(v) : v)} render={v => (emps.find((e: any) => String(e.id) === v) || {}).name} /></Field>
        <Field T={T} label="Month"><TextField T={T} value={f.month} onChange={v => set('month', v)} placeholder="2024-11" /></Field>
        <Field T={T} label="Basic"><TextField T={T} type="number" value={f.basic} onChange={v => set('basic', v)} /></Field>
        <Field T={T} label="Allowance"><TextField T={T} type="number" value={f.allowance} onChange={v => set('allowance', v)} placeholder="0" /></Field>
        <Field T={T} label="Overtime pay"><TextField T={T} type="number" value={f.overtime} onChange={v => set('overtime', v)} placeholder="0" /></Field>
        <Field T={T} label="Bonus"><TextField T={T} type="number" value={f.bonus} onChange={v => set('bonus', v)} placeholder="0" /></Field>
        <Field T={T} label="Incentive"><TextField T={T} type="number" value={f.incentive} onChange={v => set('incentive', v)} placeholder="0" /></Field>
        <Field T={T} label="Deduction"><TextField T={T} type="number" value={f.deduction} onChange={v => set('deduction', v)} placeholder="0" /></Field>
        <Field T={T} label="Advance recovery"><TextField T={T} type="number" value={f.advance_recovery} onChange={v => set('advance_recovery', v)} placeholder="0" /></Field>
        <Field T={T} label="Statutory regime"><SelectField T={T} value={f.statutory_country} options={['none', 'KE', 'SO']} onChange={v => set('statutory_country', v)} render={v => v === 'none' ? 'None' : v === 'KE' ? 'Kenya — PAYE / NSSF / SHIF / Housing' : 'Somaliland'} /></Field>
        <Field T={T} label="Pro-rate a mid-month joiner">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.inkMid, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!f.prorate} onChange={e => set('prorate', e.target.checked)} />
            Pay only the days from the join date
          </label>
        </Field>
      </FormGrid>
      {stat && stat.total_statutory > 0 && <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}`, fontSize: 12, color: T.inkMid, lineHeight: 1.6 }}>Statutory on {money(gross)} gross: PAYE {money(stat.paye)} · NSSF {money(stat.nssf)} · SHIF {money(stat.shif)} · Housing {money(stat.housing_levy)} — <b style={{ color: T.redText }}>−{money(stat.total_statutory)}</b></div>}
      {summary && <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}`, fontSize: 12, color: T.inkMid, lineHeight: 1.6 }}>{summary.days_worked} days · {summary.total_hours}h worked ({summary.expected_hours}h expected){summary.overtime_hours > 0 ? <> · <b style={{ color: T.amberText }}>{summary.overtime_hours}h overtime → {money(summary.overtime_pay)}</b> @ {money(summary.hourly_rate)}/h ×1.5</> : ''}{summary.total_deduction > 0 ? <> · <b style={{ color: T.redText }}>{summary.late} late / {summary.absent} absent → −{money(summary.total_deduction)}</b></> : ''}</div>}
      {advance > 0 && <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: T.r, background: T.amberSoft, color: T.amberText, fontSize: 12, lineHeight: 1.5 }}>Outstanding advance of <b>{money(advance)}</b> pre-filled as Advance recovery — clear the field to skip recovering it this month.</div>}
    </Modal>
  );
}

export function TodoModal({ T, emps, onClose, onSaved }: { T: any; emps: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useStateHr<any>({ title: '', assigned_to: (emps[0] || {}).id || '', priority: 'medium', due: '' });
  const [busy, setBusy] = useStateHr(false);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  return (
    <Modal T={T} title="Add task" width={500} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { if (!f.title.trim()) return; setBusy(true); try { await API.hrm.addTodo(f); onSaved(); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : 'Add'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Task" full><TextField T={T} value={f.title} onChange={v => set('title', v)} placeholder="What needs doing?" /></Field>
        <Field T={T} label="Assign to"><SelectField T={T} value={String(f.assigned_to)} options={emps.map((e: any) => String(e.id))} onChange={v => set('assigned_to', /^\d+$/.test(String(v)) ? Number(v) : v)} render={v => (emps.find((e: any) => String(e.id) === v) || {}).name} /></Field>
        <Field T={T} label="Priority"><SelectField T={T} value={f.priority} options={['high', 'medium', 'low']} onChange={v => set('priority', v)} /></Field>
        <Field T={T} label="Due"><TextField T={T} type="date" value={f.due} onChange={v => set('due', v)} /></Field>
      </FormGrid>
    </Modal>
  );
}

export function PayslipSettings({ T, onClose, onSaved }: { T: any; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useStateHr<any>(null);
  const [busy, setBusy] = useStateHr(false);
  React.useEffect(() => { API.hrm.payslipSettings().then(setS).catch(() => {}); }, []);
  if (!s) return null;
  const opts = [['show_attendance', 'Attendance summary (days, hours)'], ['show_overtime', 'Overtime'], ['show_leave', 'Leave taken'], ['show_advance', 'Advance recovery'], ['show_bonus', 'Bonus'], ['show_incentive', 'Incentive'], ['show_deduction_breakdown', 'Deduction breakdown']];
  return (
    <Modal T={T} title="Payslip settings" subtitle="Choose what shows on the payslip" width={460} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { setBusy(true); try { await API.hrm.savePayslipSettings(s); onSaved(); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {opts.map(([k, lbl]) => (
          <button key={k} onClick={() => setS((p: any) => ({ ...p, [k]: !p[k] }))} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            <span style={{ width: 40, height: 23, borderRadius: 99, background: s[k] ? T.accent.base : T.lineMid, position: 'relative', flexShrink: 0, transition: 'background .18s' }}>
              <span style={{ position: 'absolute', top: 2.5, left: s[k] ? 19 : 2.5, width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.inkMid }}>{lbl}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function AdvanceModal({ T, emps, onClose, onSaved }: { T: any; emps: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useStateHr<any>({ employee_id: (emps[0] || {}).id || '', amount: '', date: todayLocal(), account_id: '', note: '' });
  const [accounts, setAccounts] = useStateHr<any[]>([]);
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  React.useEffect(() => { API.paymentAccount.list().then((a: any[]) => { setAccounts(a); setF((s: any) => ({ ...s, account_id: (a[0] || {}).id || '' })); }).catch(() => {}); }, []);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  return (
    <Modal T={T} title="Give advance / loan" subtitle="Paid now, recovered via payroll deduction" width={520} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { if (!(Number(f.amount) > 0)) { setErr('Enter an amount.'); return; } setBusy(true); setErr(null); try { await API.hrm.addAdvance(f); onSaved(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : 'Give advance'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Employee" full><SelectField T={T} value={String(f.employee_id)} options={emps.map((e: any) => String(e.id))} onChange={v => set('employee_id', /^\d+$/.test(String(v)) ? Number(v) : v)} render={v => (emps.find((e: any) => String(e.id) === v) || {}).name} /></Field>
        <Field T={T} label="Amount"><TextField T={T} type="number" value={f.amount} onChange={v => set('amount', v)} placeholder="0.00" /></Field>
        <Field T={T} label="Date"><TextField T={T} type="date" value={f.date} onChange={v => set('date', v)} /></Field>
        <Field T={T} label="Pay from account" full><SelectField T={T} value={String(f.account_id)} options={accounts.map((a: any) => String(a.id))} onChange={v => set('account_id', /^\d+$/.test(String(v)) ? Number(v) : v)} render={v => { const a: any = accounts.find((x: any) => String(x.id) === v) || {}; return a.name + ' · ' + money(a.balance || 0); }} /></Field>
        <Field T={T} label="Note" full><TextField T={T} value={f.note} onChange={v => set('note', v)} placeholder="Reason / terms" /></Field>
      </FormGrid>
      <div style={{ fontSize: 11.5, color: T.inkMute, marginTop: 12, lineHeight: 1.5 }}>The amount is drawn from the selected account now, and recovers automatically from the employee's next payroll deduction.</div>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}
