'use client';
/**
 * HRM — leave types with their counting interval, and filing or editing leave.
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

export function LeaveTypesManager({ T, emps, onClose, onSaved }: { T: any; emps: any[]; onClose: () => void; onSaved: () => void }) {
  const [types, setTypes] = useStateHr<any[]>([]);
  const [name, setName] = useStateHr('');
  const [days, setDays] = useStateHr('');
  const [accrues, setAccrues] = useStateHr(false);
  const [paid, setPaid] = useStateHr(true);
  const [ovEmp, setOvEmp] = useStateHr<any>('');
  const [draftDays, setDraftDays] = useStateHr<any>({});
  const [interval, setInterval] = useStateHr('financial_year');
  const [ov, setOv] = useStateHr<any>({});
  const reload = () => API.hrm.leaveTypes().then(setTypes);
  React.useEffect(() => { reload(); }, []);
  React.useEffect(() => { if (ovEmp) API.hrm.leaveOverride(ovEmp).then(setOv).catch(() => {}); else setOv({}); }, [ovEmp]);
  const [err, setErr] = useStateHr('');
  // Every mutation here is owner/manager-only server-side, and delete/create can
  // now legitimately refuse (in use, duplicate name) — so failures must be shown
  // rather than becoming an unhandled rejection behind a button that looks broken.
  const run = async (fn: () => Promise<any>) => {
    setErr('');
    try { await fn(); reload(); onSaved(); }
    catch (e: any) { setErr(e?.message || 'That did not work.'); }
  };
  async function add() { if (!name.trim()) return; await run(async () => { await API.hrm.addLeaveType({ name, default_days: Number(days || 0), count_interval: interval, accrues, paid }); setName(''); setDays(''); setAccrues(false); setPaid(true); setInterval('financial_year'); }); }
  async function del(t: any) { await run(() => API.hrm.removeLeaveType(t.id)); }
  // Committed on blur, not per keystroke: the input is controlled off server
  // state, so typing "100" used to persist 1, then 10, then 100, and clearing
  // the field persisted 0 days for the whole business.
  async function commitDays(t: any, v: any) {
    const n = Number(v);
    if (v === '' || !Number.isFinite(n) || n < 0 || n === t.default_days) { setDraftDays((d: any) => { const { [t.id]: _, ...rest } = d; return rest; }); return; }
    await run(() => API.hrm.updateLeaveType(t.id, { default_days: n }));
    setDraftDays((d: any) => { const { [t.id]: _, ...rest } = d; return rest; });
  }
  async function saveOverride() { if (!ovEmp) return; await run(() => API.hrm.setLeaveOverride(ovEmp, ov)); }
  return (
    <Modal T={T} title="Leave types" subtitle="Create and configure leave types — admin-managed" width={600} onClose={onClose} footer={null}>
      {err && <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, lineHeight: 1.5 }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {types.map((t: any) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>{t.name} {!t.paid && <Badge T={T} tone="gray" style={{ marginLeft: 4 }}>unpaid</Badge>}{t.accrues && <Badge T={T} tone="blue" style={{ marginLeft: 4 }}>accrues</Badge>}</span>
            <span style={{ fontSize: 11, color: T.inkSub }}>max</span>
            <input type="number" min={0}
              value={draftDays[t.id] != null ? draftDays[t.id] : t.default_days}
              onChange={e => setDraftDays((d: any) => ({ ...d, [t.id]: e.target.value }))}
              onBlur={e => commitDays(t, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              disabled={!t.paid} style={{ width: 60, padding: '5px 7px', fontSize: 12.5, fontFamily: T.fMono, textAlign: 'right', color: T.ink, background: t.paid ? T.paper : T.paperAlt, border: `1px solid ${T.line}`, borderRadius: 6, outline: 'none' }} />
            <select value={t.count_interval || 'financial_year'} disabled={!t.paid}
              onChange={e => run(() => API.hrm.updateLeaveType(t.id, { count_interval: e.target.value }))}
              title="The window this maximum is counted over"
              style={{ padding: '5px 7px', fontSize: 11.5, fontFamily: T.fBody, color: T.ink, background: t.paid ? T.paper : T.paperAlt, border: `1px solid ${T.line}`, borderRadius: 6, outline: 'none' }}>
              <option value="month">per month</option>
              <option value="financial_year">per financial year</option>
              <option value="none">never resets</option>
            </select>
            <button onClick={() => del(t)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 12, lineHeight: 0 }}><LuX size={12} /></button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 14, display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 120 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>New type</div><TextField T={T} value={name} onChange={setName} placeholder="e.g. Maternity" /></div>
        <div style={{ width: 80 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Max count</div><TextField T={T} type="number" value={days} onChange={setDays} placeholder="0" /></div>
        <div style={{ width: 160 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Counted</div>
          <SelectField T={T} value={interval} options={['month', 'financial_year', 'none']} onChange={(v: any) => setInterval(v)}
            render={(v: any) => v === 'month' ? 'Current month' : v === 'financial_year' ? 'Current financial year' : 'None'} /></div>
        <button onClick={() => setPaid(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 11px', borderRadius: T.r, border: `1px solid ${T.line}`, background: T.paper, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, color: T.inkMid }}>{paid ? <><LuCheck size={12} style={{ verticalAlign: -2, marginRight: 3 }} />Paid</> : 'Unpaid'}</button>
        <button onClick={() => setAccrues(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 11px', borderRadius: T.r, border: `1px solid ${accrues ? T.accent.base : T.line}`, background: accrues ? T.accent.soft : T.paper, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, color: accrues ? T.accent.text : T.inkMid }}>{accrues ? <><LuCheck size={12} style={{ verticalAlign: -2, marginRight: 3 }} />Accrues</> : 'Accrues'}</button>
        <Btn T={T} kind="accent" onClick={add}>Add</Btn>
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 16, paddingTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 8 }}>Per-employee override</div>
        <SelectField T={T} value={String(ovEmp)} options={['', ...emps.map((e: any) => String(e.id))]} onChange={v => setOvEmp(v ? (/^\d+$/.test(String(v)) ? Number(v) : v) : '')} render={v => v ? (emps.find((e: any) => String(e.id) === v) || {}).name : 'Select employee to override…'} />
        {ovEmp ? <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 12 }}>
            {types.filter((t: any) => t.paid).map((t: any) => (
              <div key={t.id}><div style={{ fontSize: 11, color: T.inkSub, marginBottom: 4 }}>{t.name} <span style={{ color: T.inkMute }}>(def {t.default_days})</span></div>
                <TextField T={T} type="number" value={ov[t.name] != null ? ov[t.name] : ''} onChange={v => setOv((o: any) => ({ ...o, [t.name]: v === '' ? undefined : Number(v) }))} placeholder={String(t.default_days)} /></div>
            ))}
          </div>
          <Btn T={T} kind="accent" onClick={saveOverride} style={{ marginTop: 12 }}>Save override for this employee</Btn>
        </> : null}
        <div style={{ fontSize: 11, color: T.inkMute, marginTop: 10, lineHeight: 1.5 }}>Leave a field blank to use the type's default. Overrides let one employee have a different entitlement (e.g. more annual days for a senior).</div>
      </div>
    </Modal>
  );
}

export function LeaveModal({ T, emps, leaveTypes, holidays, leave, onClose, onSaved }: { T: any; emps: any[]; leaveTypes: any[]; holidays: any[]; leave?: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!leave;
  // Every day covered by a holiday, so the day count skips them.
  const offDays = React.useMemo(() => {
    const set = new Set<string>();
    for (const h of holidays || []) {
      for (let d = new Date(h.start_date); d <= new Date(h.end_date); d.setUTCDate(d.getUTCDate() + 1)) {
        set.add(d.toISOString().slice(0, 10));
      }
    }
    return set;
  }, [holidays]);
  const types = (leaveTypes && leaveTypes.length) ? leaveTypes.map((t: any) => t.name) : ['Casual', 'Sick', 'Annual', 'Unpaid'];
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useStateHr<any>(editing
    ? { employee_id: leave.employee_id, type: leave.type, from: leave.from, to: leave.to, days: leave.days, reason: leave.reason || '' }
    : { employee_id: (emps[0] || {}).id || '', type: types[0], from: today, to: today, days: 1, reason: '' });
  const [busy, setBusy] = useStateHr(false);
  const [err, setErr] = useStateHr<any>(null);
  const [bal, setBal] = useStateHr<any[]>([]);
  // Changing either date re-derives the day count, so the two can't disagree.
  // It stays editable for a partial claim (skipping a weekend, say); the server
  // caps it at the length of the period.
  const set = (k: string, v: any) => setF((s: any) => {
    const nf = { ...s, [k]: v };
    if ((k === 'from' || k === 'to') && nf.from && nf.to && nf.to >= nf.from) {
      // Calendar span minus any company holiday inside it — the server caps on
      // the same figure, so the two never disagree.
      let n = 0;
      for (let d = new Date(nf.from); d <= new Date(nf.to); d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (!offDays.has(iso)) n++;
      }
      nf.days = Math.max(1, n);
    }
    return nf;
  });
  React.useEffect(() => { if (f.employee_id) API.hrm.empLeaveBalance(f.employee_id).then(setBal).catch(() => {}); }, [f.employee_id]);
  const typeBal: any = bal.find((b: any) => b.type === f.type);
  const paidType = typeBal && typeBal.paid !== false;
  return (
    <Modal T={T} title={editing ? `Edit leave — ${leave.reference_no || leave.employee_name}` : 'Apply leave'} width={500} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { if (!f.from || !f.to) { setErr('Pick a start and end date.'); return; } if (f.to < f.from) { setErr('End date cannot be before the start date.'); return; } setBusy(true); setErr(null); try { if (editing) await API.hrm.updateLeave(leave.id, f); else await API.hrm.addLeave(f); onSaved(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Apply'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Employee" full><SelectField T={T} value={String(f.employee_id)} options={emps.map((e: any) => String(e.id))} onChange={v => set('employee_id', /^\d+$/.test(String(v)) ? Number(v) : v)} render={v => (emps.find((e: any) => String(e.id) === v) || {}).name} /></Field>
        <Field T={T} label="Type"><SelectField T={T} value={f.type} options={types} onChange={v => set('type', v)} /></Field>
        <Field T={T} label="Days"><TextField T={T} type="number" value={f.days} onChange={v => set('days', v)} /></Field>
        <Field T={T} label="From"><TextField T={T} type="date" value={f.from} onChange={v => set('from', v)} /></Field>
        <Field T={T} label="To"><TextField T={T} type="date" value={f.to} onChange={v => set('to', v)} /></Field>
        <Field T={T} label="Reason" full><TextField T={T} value={f.reason} onChange={v => set('reason', v)} placeholder="Reason for leave" /></Field>
      </FormGrid>
      {typeBal && paidType && <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: T.r, background: typeBal.balance > 0 ? T.accent.soft : T.amberSoft, color: typeBal.balance > 0 ? T.accent.text : T.amberText, fontSize: 12, lineHeight: 1.5 }}><b>{typeBal.balance}</b> of {typeBal.entitled} {f.type} day(s) available{typeBal.pending ? ` · ${typeBal.pending} pending` : ''}{typeBal.period_from ? ` · counted ${typeBal.period_from} to ${typeBal.period_to}` : ' · never resets'}.</div>}
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}
