'use client';
import React from 'react';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useSession } from '@/components/shell';
import { API } from '@/lib/api';
import { ListToolbar, ListFooter, usePaged } from '@/components/list-chrome';
import { LuUsers, LuPrinter, LuSettings, LuTriangleAlert, LuSearch, LuCheck, LuClock, LuHourglass, LuBanknote, LuListTodo, LuX, LuPlay } from 'react-icons/lu';
import { BUSINESS } from '@/lib/data';
import { todayLocal } from '@/lib/business-settings';
import { DOW, hrAvatar, hrFilterSel, hrInitials, hrMini } from './shared';
import { HrmSettingsPanel } from './settings-panel';
import { MyPayrolls } from './my-payrolls';
import { HrmDashboard } from './dashboard';
import { AttendanceEntryModal, AttendanceImport, AttendanceSettings, ShiftAssignModal, ShiftModal, ShiftTemplateModal, SwapModal } from './attendance-modals';
import { EmployeeModal, EmployeeProfile, HolidayModal, OrgModal, OrgUnitModal } from './people-modals';
import { AdvanceModal, PayComponentModal, PayrollGroupModal, PayrollModal, PayslipSettings, SalesTargetModal, TodoModal } from './payroll-modals';
import { LeaveModal, LeaveTypesManager } from './leave-modals';

const { useState: useStateHr, useEffect: useEffectHr } = React;

export function HRM({ T }: { T: any }) {
  const session = useSession();
  const bizName = (session && session.business_name) || BUSINESS.name;
  const [enabled, setEnabled] = useStateHr<any>(null);
  const [tab, setTab] = useStateHr('overview');
  const [summary, setSummary] = useStateHr<any>(null);
  const [emps, setEmps] = useStateHr<any[]>([]);
  const [att, setAtt] = useStateHr<any[]>([]);
  const [leaves, setLeaves] = useStateHr<any[]>([]);
  const [pay, setPay] = useStateHr<any[]>([]);
  const [todos, setTodos] = useStateHr<any[]>([]);
  const [leaveBal, setLeaveBal] = useStateHr<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useStateHr<any[]>([]);
  const [shifts, setShifts] = useStateHr<any[]>([]);
  const [advances, setAdvances] = useStateHr<any[]>([]);
  const [swaps, setSwaps] = useStateHr<any[]>([]);
  const [profile, setProfile] = useStateHr<any>(null);
  const [nowClock, setNowClock] = useStateHr(new Date().toTimeString().slice(0, 5));
  const [report, setReport] = useStateHr<any[]>([]);
  const [reportMonth, setReportMonth] = useStateHr(new Date().toISOString().slice(0, 7));
  const [org, setOrg] = useStateHr<any>({ departments: [], designations: [] });
  useEffectHr(() => { if (enabled) API.hrm.org().then(setOrg).catch(() => {}); }, [enabled, emps]);
  useEffectHr(() => { if (enabled && tab === 'report') API.hrm.attendanceSummary(reportMonth).then(setReport).catch(() => {}); }, [enabled, tab, reportMonth]);
  const [meta, setMeta] = useStateHr<any>({ departments: [], designations: [] });
  const [locs, setLocs] = useStateHr<any[]>([]);
  const [modal, setModal] = useStateHr<any>(null);
  const [editEmp, setEditEmp] = useStateHr<any>(null);
  const [holidays, setHolidays] = useStateHr<any[]>([]);
  const [templates, setTemplates] = useStateHr<any[]>([]);
  const [payComps, setPayComps] = useStateHr<any[]>([]);
  const [payGroups, setPayGroups] = useStateHr<any[]>([]);
  const [targets, setTargets] = useStateHr<any[]>([]);
  const [editTarget, setEditTarget] = useStateHr<any>(null);
  const [editComp, setEditComp] = useStateHr<any>(null);
  const [editTpl, setEditTpl] = useStateHr<any>(null);
  const [assignTpl, setAssignTpl] = useStateHr<any>(null);
  const [editHol, setEditHol] = useStateHr<any>(null);
  const [editOrg, setEditOrg] = useStateHr<any>(null);
  // Attendance sub-tabs, mirroring the reference: All / By shift / By date / Import.
  const [attView, setAttView] = useStateHr('all');
  const [attEmp, setAttEmp] = useStateHr('');
  const [attFrom, setAttFrom] = useStateHr('');
  const [attTo, setAttTo] = useStateHr('');
  const [byShift, setByShift] = useStateHr<any>(null);
  const [byDate, setByDate] = useStateHr<any>(null);
  const [byShiftDay, setByShiftDay] = useStateHr(todayLocal());
  const [editAtt, setEditAtt] = useStateHr<any>(null);
  const [q, setQ] = useStateHr('');
  const [fDept, setFDept] = useStateHr('');
  const [fStatus, setFStatus] = useStateHr('');
  // The leave list is capped server-side, so a date range is how older requests
  // are reached rather than silently falling off the end.
  const [leaveFrom, setLeaveFrom] = useStateHr('');
  const [leaveTo, setLeaveTo] = useStateHr('');
  const [leaveEmp, setLeaveEmp] = useStateHr('');
  const [leaveType, setLeaveType] = useStateHr('');
  // Payroll list filters, all resolved server-side.
  const [payEmp, setPayEmp] = useStateHr('');
  const [payLoc, setPayLoc] = useStateHr('');
  const [payDesig, setPayDesig] = useStateHr('');
  const [payMonth, setPayMonth] = useStateHr('');
  const [editLeave, setEditLeave] = useStateHr<any>(null);
  const [show, node] = useToast();
  React.useEffect(() => { setQ(''); setFDept(''); setFStatus(''); }, [tab]);
  const matchQ = (s: any) => !q || String(s || '').toLowerCase().includes(q.toLowerCase());

  const reload = React.useCallback(() => {
    API.hrm.summary().then(setSummary).catch(() => {});
    API.hrm.employees().then(setEmps).catch(() => {});
    API.hrm.attendance({ ...(attEmp && { employee_id: attEmp }), ...(attFrom && { from: attFrom }), ...(attTo && { to: attTo }) }).then(setAtt).catch(() => {});
    API.hrm.leaves({ ...(leaveFrom && { from: leaveFrom }), ...(leaveTo && { to: leaveTo }), ...(leaveEmp && { employee_id: leaveEmp }), ...(leaveType && { type: leaveType }) }).then(setLeaves).catch(() => {});
    API.hrm.payroll({
      ...(payEmp && { employee_id: payEmp }), ...(payLoc && { location_id: payLoc }),
      ...(payDesig && { designation: payDesig }), ...(payMonth && { month: payMonth }),
    }).then(setPay).catch(() => {});
    API.hrm.todos().then(setTodos).catch(() => {});
    API.hrm.shifts().then(setShifts).catch(() => {});
    API.hrm.shiftSwaps().then(setSwaps).catch(() => {});
    API.hrm.leaveBalances().then(setLeaveBal).catch(() => {});
    API.hrm.leaveTypes().then(setLeaveTypes).catch(() => {});
    API.hrm.holidays().then(setHolidays).catch(() => {});
    API.hrm.shiftTemplates().then(setTemplates).catch(() => {});
    API.hrm.payComponents().then(setPayComps).catch(() => {});
    API.hrm.payrollGroups().then(setPayGroups).catch(() => {});
    API.hrm.salesTargets().then(setTargets).catch(() => {});
    API.hrm.advances().then(setAdvances).catch(() => {});
  }, [leaveFrom, leaveTo, leaveEmp, leaveType, attEmp, attFrom, attTo, payEmp, payLoc, payDesig, payMonth]);
  useEffectHr(() => { API.module.list().then((ms: any[]) => setEnabled(!!(ms.find((m: any) => m.key === 'hrm') || {}).enabled)).catch(() => setEnabled(false)); }, []);
  useEffectHr(() => {
    if (!enabled || tab !== 'attendance') return;
    if (attView === 'by_shift') API.hrm.attendanceByShift(byShiftDay).then(setByShift).catch(() => {});
    if (attView === 'by_date') API.hrm.attendanceByDate(attFrom || undefined, attTo || undefined).then(setByDate).catch(() => {});
  }, [enabled, tab, attView, byShiftDay, attFrom, attTo]);
  useEffectHr(() => { if (enabled) { reload(); API.hrm.meta().then(setMeta).catch(() => {}); API.location.list().then(setLocs).catch(() => {}); } }, [enabled, reload]);

  async function enableModule() { await API.module.setEnabled('hrm', true); setEnabled(true); show('HRM module enabled'); }
  const hasRunning = att.some((a: any) => a.status === 'running');
  useEffectHr(() => {
    if (tab !== 'attendance' || !hasRunning) return;
    const t = setInterval(() => { setNowClock(new Date().toTimeString().slice(0, 5)); API.hrm.attendance().then(setAtt).catch(() => {}); }, 30000);
    return () => clearInterval(t);
  }, [tab, hasRunning]);

  const tabs = [['overview', 'Overview'], ['employees', 'Employees'], ['org', 'Departments'], ['designations', 'Designations'], ['attendance', 'Attendance'], ['report', 'Report'], ['shifts', 'Shifts'], ['leave', 'Leave'], ['holidays', 'Holiday'], ['payroll', 'Payroll'], ['targets', 'Sales Targets'], ['mypay', 'My Payrolls'], ['settings', 'Settings'], ['advances', 'Advances'], ['todos', 'Tasks']];
  const inDept = (empId: any) => !fDept || (emps.find((e: any) => e.id === empId) || {}).department === fDept;
  const fAtt = att.filter((a: any) => matchQ(a.employee_name) && inDept(a.employee_id) && (!fStatus || a.status === fStatus));
  const fLeaves = leaves.filter((l: any) => (matchQ(l.employee_name) || matchQ(l.type) || matchQ(l.reason)) && inDept(l.employee_id) && (!fStatus || l.status === fStatus));
  const fShifts = shifts.filter((s: any) => (matchQ(s.employee_name) || matchQ(s.role)) && inDept(s.employee_id));
  const fPay = pay.filter((p: any) => (matchQ(p.employee_name) || matchQ(p.month)) && inDept(p.employee_id));
  const fAdvances = advances.filter((a: any) => (matchQ(a.employee_name) || matchQ(a.note)) && inDept(a.employee_id) && (!fStatus || a.status === fStatus));
  const fTargets = targets.filter((t: any) => matchQ(t.name));
  const fHolidays = holidays.filter((h: any) => matchQ(h.name) || matchQ(h.note) || matchQ(h.location_name));
  const fTodos = todos.filter((t: any) => (matchQ(t.title) || matchQ(t.assigned_name)) && (!fStatus || t.status === fStatus));
  const fReport = report.filter((r: any) => matchQ(r.employee_name) && inDept(r.employee_id));

  // Paging the long lists. Exports still cover the whole filtered set — only
  // what is rendered is paged, which is what "Show N entries" means.
  const pAtt = usePaged(fAtt);
  const pLeaves = usePaged(fLeaves);
  const pPay = usePaged(fPay);
  const pHolidays = usePaged(fHolidays);
  const pTargets = usePaged(fTargets);
  const pAdvances = usePaged(fAdvances);

  // ── Export / print for the active tab ─────────────────────────────
  const exportSets: any = {
    settings: () => ({ title: 'Settings', cols: [], rows: [] }),
    mypay: () => ({ title: 'My payrolls', cols: [], rows: [] }),
    org: () => ({ title: 'Departments', cols: ['Department', 'Department ID', 'Description', 'Staff'], rows: (org.departments || []).map((d: any) => [d.name, d.code, d.description, d.count]) }),
    designations: () => ({ title: 'Designations', cols: ['Designation', 'Description', 'Staff'], rows: (org.designations || []).map((d: any) => [d.name, d.description, d.count]) }),
    targets: () => ({ title: 'Sales targets', cols: ['User', 'Bands', 'Rates'], rows: fTargets.map((t: any) => [t.name, t.bands.length || 'flat', t.bands.length ? t.bands.map((b: any) => `${b.from_amount}-${b.to_amount ?? '∞'} @ ${b.commission_percent}%`).join('; ') : `${t.flat_percent}%`]) }),
    holidays: () => ({ title: 'Holidays', cols: ['Name', 'From', 'To', 'Business Location', 'Note'], rows: fHolidays.map((h: any) => [h.name, h.start_date, h.end_date, h.location_name, h.note]) }),
    employees: () => ({ title: 'Employees', cols: ['Name', 'Email', 'Department', 'Designation', 'Location', 'Salary', 'Joined', 'Status'], rows: emps.filter((e: any) => matchQ(e.name) && (!fDept || e.department === fDept)).map((e: any) => [e.name, e.email, e.department, e.designation, e.location_name, e.salary, e.joined, e.on_leave ? 'on leave' : e.status]) }),
    attendance: () => ({ title: 'Attendance', cols: ['Date', 'Employee', 'Clock in', 'Clock out', 'Work duration', 'IP address', 'Shift', 'Clock in note', 'Clock out note', 'Status'], rows: fAtt.map((a: any) => [a.date, a.employee_name, a.clock_in, a.clock_out, a.hours_label, a.ip_address, a.shift_name, a.clock_in_note, a.clock_out_note, a.status]) }),
    report: () => ({ title: 'Attendance report ' + reportMonth, cols: ['Employee', 'Days', 'Present', 'Late', 'Absent', 'Hours', 'Overtime h', 'OT pay', 'Deductions'], rows: fReport.map((r: any) => [r.employee_name, r.days_worked, r.present, r.late, r.absent, r.total_hours, r.overtime_hours, r.overtime_pay, r.total_deduction]) }),
    shifts: () => ({ title: 'Shifts', cols: ['Employee', 'Date', 'Start', 'End', 'Role', 'Location'], rows: fShifts.map((s: any) => [s.employee_name, s.date, s.start, s.end, s.role, s.location_name]) }),
    leave: () => ({ title: 'Leave', cols: ['Reference No', 'Employee', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Approved by'], rows: fLeaves.map((l: any) => [l.reference_no || '', l.employee_name, l.type, l.from, l.to, l.days, l.reason, l.status, l.approved_by || '']) }),
    payroll: () => ({ title: 'Payroll', cols: ['Employee', 'Department', 'Designation', 'Month', 'Reference No', 'Total amount', 'Basic', 'Deduction', 'Net', 'Payment status'], rows: fPay.map((p: any) => [p.employee_name, p.department, p.designation, p.month, p.reference_no || '', p.gross, p.basic, p.deduction, p.net, p.payment_status]) }),
    advances: () => ({ title: 'Advances', cols: ['Employee', 'Date', 'Amount', 'Outstanding', 'Account', 'Note', 'Status'], rows: fAdvances.map((a: any) => [a.employee_name, a.date, a.amount, a.outstanding, a.account_name, a.note, a.status]) }),
    todos: () => ({ title: 'Tasks', cols: ['Task', 'Assigned to', 'Priority', 'Status', 'Due'], rows: fTodos.map((t: any) => [t.title, t.assigned_name, t.priority, t.status, t.due]) }),
  };
  const activeSet = () => (exportSets[tab] || exportSets.employees)();
  // Fed to the shared toolbar, so HRM exports the same five ways the reports do
  // rather than the CSV-and-print pair it had.
  const exportTable = () => {
    const { title, cols, rows } = activeSet();
    return { title, subtitle: bizName, fileName: `${bizName}-${title}`.replace(/\s+/g, '-'), cols, rows };
  };

  const atone: any = { present: 'green', late: 'amber', absent: 'red', running: 'amber' };
  const ltone: any = { approved: 'green', pending: 'amber', rejected: 'red' };
  const ptone: any = { high: 'red', medium: 'amber', low: 'gray' };

  // Gated here, not earlier: an early return above the hooks below would
  // change the hook count between renders once `enabled` resolves.
  if (enabled === false) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.paperAlt }}>
        <Topbar T={T} title="HRM / Essentials" subtitle="Add-on module" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ width: 76, height: 76, borderRadius: 20, background: T.accent.soft, color: T.accent.base, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, margin: '0 auto 20px' }}><LuUsers /></div>
            <div style={{ fontFamily: T.fDisplay, fontSize: 24, fontWeight: T.dispWeight, color: T.ink, marginBottom: 8 }}>HRM / Essentials</div>
            <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6, marginBottom: 22 }}>Manage employees, attendance, leave, payroll and team tasks. Paid add-on ($18/mo) — enable it to start.</div>
            <Btn T={T} kind="accent" onClick={enableModule}>Enable HRM · $18/mo</Btn>
          </div>
        </div>
        {node}
      </div>
    );
  }
  if (enabled === null) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paperAlt, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="HRM / Essentials" subtitle="People, time & payroll"
        right={<span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {tab === 'employees' ? <Btn T={T} kind="accent" onClick={() => setModal('employee')}>+ Add Employee</Btn>
          : tab === 'org' || tab === 'designations' ? <Btn T={T} kind="accent" onClick={() => setModal(tab === 'org' ? 'org' : 'designation')}>+ Add</Btn>
          : tab === 'leave' ? <><Btn T={T} kind="ghost" onClick={() => setModal('leavetypes')}><LuSettings size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Leave Types</Btn><Btn T={T} kind="accent" onClick={() => setModal('leave')}>+ Apply Leave</Btn></>
          : tab === 'payroll' ? <><Btn T={T} kind="ghost" onClick={() => setModal('payslipsettings')}><LuSettings size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Payslip</Btn><Btn T={T} kind="accent" onClick={() => setModal('payroll')}><LuPlay size={12} style={{ verticalAlign: -2, marginRight: 5 }} />Run Payroll</Btn><Btn T={T} kind="ghost" onClick={() => setModal('paygroup')}>+ Payroll Group</Btn><Btn T={T} kind="ghost" onClick={() => setModal('paycomponent')}>+ Pay Component</Btn></>
          : tab === 'holidays' ? <Btn T={T} kind="accent" onClick={() => setModal('holiday')}>+ Add Holiday</Btn>
          : tab === 'shifts' ? <Btn T={T} kind="accent" onClick={() => setModal('shift')}>+ Add Shift</Btn>
          : tab === 'advances' ? <Btn T={T} kind="accent" onClick={() => setModal('advance')}>+ Give Advance</Btn>
          : tab === 'attendance' ? <><Btn T={T} kind="ghost" onClick={() => API.hrm.autoClockOut().then((r: any) => { show(r?.closed ? `Closed ${r.closed} open clock-in(s)` : 'Nothing left open'); reload(); }).catch((e: any) => show(e.message))}>Auto clock out</Btn><Btn T={T} kind="ghost" onClick={() => setModal('shifttemplate')}>+ Add Shift</Btn><Btn T={T} kind="accent" onClick={() => setEditAtt({})}>+ Add latest attendance</Btn><Btn T={T} kind="ghost" onClick={() => setModal('attsettings')}><LuSettings size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Attendance Settings</Btn></>
          : tab === 'report' ? <Btn T={T} kind="ghost" onClick={() => API.hrm.autoAbsent().then((r: any) => { show(r.added ? `Marked ${r.added} absent` : 'No one to mark absent'); API.hrm.attendanceSummary(reportMonth).then(setReport); })}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Mark absentees</Btn>
          : tab === 'todos' ? <Btn T={T} kind="accent" onClick={() => setModal('todo')}>+ Add Task</Btn> : null}
        </span>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
            {tabs.map(([id, lbl]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl}</button>
            ))}
          </div>

          {/* EXPORT TOOLBAR — every data tab, matching the reports screens */}
          {!['overview', 'settings'].includes(tab) && (
            <ListToolbar T={T} table={exportTable} />
          )}

          {/* FILTER BAR — shown on data tabs */}
          {['attendance', 'report', 'shifts', 'leave', 'payroll', 'advances', 'todos'].includes(tab) && (() => {
            const statusOpts = ({
              attendance: ['present', 'late', 'absent', 'running', 'on break'],
              leave: ['pending', 'approved', 'rejected'],
              shifts: [], payroll: [], report: [], holidays: [], targets: [], settings: [], mypay: [],
              advances: ['outstanding', 'settled'],
              todos: ['pending', 'done'],
            } as any)[tab] || [];
            const depts = [...new Set(emps.map((e: any) => e.department).filter(Boolean))];
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
                  <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.inkMute, fontSize: 13, lineHeight: 0 }}><LuSearch size={14} /></span>
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ width: '100%', padding: '8px 11px 8px 30px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                {tab !== 'todos' && <select value={fDept} onChange={e => setFDept(e.target.value)} style={hrFilterSel(T)}><option value="">All departments</option>{depts.map((d: any) => <option key={d} value={d}>{d}</option>)}</select>}
                {statusOpts.length > 0 && <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={hrFilterSel(T)}><option value="">All statuses</option>{statusOpts.map((s: any) => <option key={s} value={s}>{s}</option>)}</select>}
                {tab === 'report' && <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={hrFilterSel(T)} />}
                {tab === 'payroll' && <>
                  <select value={payEmp} onChange={e => setPayEmp(e.target.value)} style={hrFilterSel(T)}>
                    <option value="">All employees</option>
                    {emps.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <select value={payLoc} onChange={e => setPayLoc(e.target.value)} style={hrFilterSel(T)}>
                    <option value="">All locations</option>
                    {locs.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <select value={payDesig} onChange={e => setPayDesig(e.target.value)} style={hrFilterSel(T)}>
                    <option value="">All designations</option>
                    {(meta.designations || []).map((d: any) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input type="month" title="Month/Year" value={payMonth} onChange={e => setPayMonth(e.target.value)} style={hrFilterSel(T)} />
                </>}
                {tab === 'leave' && <>
                  <select value={leaveEmp} onChange={e => setLeaveEmp(e.target.value)} style={hrFilterSel(T)}>
                    <option value="">All employees</option>
                    {emps.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <select value={leaveType} onChange={e => setLeaveType(e.target.value)} style={hrFilterSel(T)}>
                    <option value="">All leave types</option>
                    {leaveTypes.map((t: any) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                  <input type="date" title="Leave from" value={leaveFrom} onChange={e => setLeaveFrom(e.target.value)} style={hrFilterSel(T)} />
                  <input type="date" title="Leave to" value={leaveTo} onChange={e => setLeaveTo(e.target.value)} style={hrFilterSel(T)} />
                </>}
                {(q || fDept || fStatus || leaveFrom || leaveTo || leaveEmp || leaveType || payEmp || payLoc || payDesig || payMonth) && <button onClick={() => { setQ(''); setFDept(''); setFStatus(''); setLeaveFrom(''); setLeaveTo(''); setLeaveEmp(''); setLeaveType(''); setPayEmp(''); setPayLoc(''); setPayDesig(''); setPayMonth(''); }} style={{ padding: '8px 12px', borderRadius: T.r, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600 }}>Clear</button>}
              </div>
            );
          })()}
          {tab === 'overview' && <HrmDashboard T={T} onOpenMyPayrolls={() => setTab('mypay')} />}

          {/* EMPLOYEES */}
          {tab === 'employees' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['Employee', 'l'], ['Department', 'l'], ['Designation', 'l'], ['Location', 'l'], ['Salary', 'r'], ['Joined', 'l'], ['Status', 'l'], ['', 'r']].map(([h, a], i) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {emps.map((e: any) => (
                    <tr key={e.id} onClick={() => API.hrm.employee(e.id).then(setProfile)} style={{ cursor: 'pointer', transition: 'background .12s' }} onMouseEnter={ev => (ev.currentTarget as any).style.background = T.paperAlt} onMouseLeave={ev => (ev.currentTarget as any).style.background = 'transparent'}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span style={hrAvatar(T, e.name, 34)}>{hrInitials(e.name)}</span>
                          <div><div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{e.name}</div><div style={{ fontSize: 11, color: T.inkSub }}>{e.email}</div></div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{e.department}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{e.designation}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{e.location_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{money(e.salary)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub, fontFamily: T.fMono }}>{e.joined}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={e.on_leave ? 'blue' : e.status === 'active' ? 'green' : 'blue'}>{e.on_leave ? 'on leave' : e.status}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                        <button onClick={(ev) => { ev.stopPropagation(); setEditEmp(e); }} style={hrMini(T)}>Edit</button>
                        <button onClick={(ev) => { ev.stopPropagation(); API.hrm.removeEmployee(e.id).then(reload); }} style={{ ...hrMini(T, true), marginLeft: 6 }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {tab === 'mypay' && <MyPayrolls T={T} />}

          {tab === 'settings' && <HrmSettingsPanel T={T} onSaved={() => { show('Settings saved'); reload(); }} />}

          {tab === 'targets' && (
            <Panel T={T} title="Sales targets" pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: T.paperAlt }}>
                  {['User', 'Commission bands', ''].map((h, i) => (
                    <th key={h} style={{ padding: '10px 18px', textAlign: i === 2 ? 'right' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {fTargets.length === 0 && <tr><td colSpan={3} style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No users.</td></tr>}
                  {pTargets.slice.map((t: any) => (
                    <tr key={t.user_id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{t.name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>
                        {t.bands.length === 0
                          ? <span style={{ color: T.inkMute }}>Flat {t.flat_percent}%</span>
                          : t.bands.map((b: any, i: number) => (
                              <span key={i} style={{ display: 'inline-block', marginRight: 8, fontFamily: T.fMono, fontSize: 11.5 }}>
                                {money(b.from_amount)}–{b.to_amount == null ? '∞' : money(b.to_amount)} @ <b>{b.commission_percent}%</b>
                              </span>
                            ))}
                      </td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                        <button onClick={() => setEditTarget(t)} style={hrMini(T)}>Set Sales Target</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            <div style={{ padding: '0 18px' }}><ListFooter T={T} paged={pTargets} /></div>
              </Panel>
          )}

          {tab === 'holidays' && (
            <Panel T={T} title="All holidays" pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: T.paperAlt }}>
                  {['Name', 'Date', 'Business Location', 'Note', ''].map((h, i) => (
                    <th key={h} style={{ padding: '10px 18px', textAlign: i === 4 ? 'right' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {fHolidays.length === 0 && <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No holidays yet.</td></tr>}
                  {pHolidays.slice.map((h: any) => (
                    <tr key={h.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{h.name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub, fontFamily: T.fMono }}>{h.start_date === h.end_date ? h.start_date : `${h.start_date} → ${h.end_date}`}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{h.location_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{h.note}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                        <button onClick={() => setEditHol(h)} style={hrMini(T)}>Edit</button>
                        <button onClick={() => API.hrm.removeHoliday(h.id).then(reload)} style={{ ...hrMini(T, true), marginLeft: 6 }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            <div style={{ padding: '0 18px' }}><ListFooter T={T} paged={pHolidays} /></div>
              </Panel>
          )}

          {/* DEPARTMENTS & DESIGNATIONS */}
          {(tab === 'org' || tab === 'designations') && (() => {
            const kind = tab === 'org' ? 'department' : 'designation';
            const list = (tab === 'org' ? org.departments : org.designations).filter((d: any) => matchQ(d.name) || matchQ(d.code) || matchQ(d.description));
            // The reference shows a Department ID on departments only.
            const cols = kind === 'department'
              ? ['Department', 'Department ID', 'Description', 'Staff', '']
              : ['Designation', 'Description', 'Staff', ''];
            return (
              <Panel T={T} title={kind === 'department' ? 'Manage departments' : 'Manage designations'} pad={false}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: T.paperAlt }}>
                    {cols.map((h, i) => (
                      <th key={h} style={{ padding: '10px 18px', textAlign: i === cols.length - 1 ? 'right' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {list.length === 0 && <tr><td colSpan={cols.length} style={{ padding: 26, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>None yet.</td></tr>}
                    {list.map((d: any) => (
                      <tr key={d.id || d.name}>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{d.name}</td>
                        {kind === 'department' && <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{d.code || '—'}</td>}
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{d.description || '—'}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone="gray">{d.count}</Badge></td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                          <button onClick={() => setEditOrg({ ...d, kind })} style={hrMini(T)}>Edit</button>
                          <button onClick={() => API.hrm.removeOrg(kind, d.name).then(() => API.hrm.org().then(setOrg)).catch((e: any) => show(e.message))}
                            disabled={d.count > 0} title={d.count > 0 ? 'In use by staff' : ''}
                            style={{ ...hrMini(T, true), marginLeft: 6, opacity: d.count > 0 ? 0.4 : 1, cursor: d.count > 0 ? 'not-allowed' : 'pointer' }}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            );
          })()}

          {/* ATTENDANCE */}
          {tab === 'attendance' && (
            <div style={{ marginBottom: 16 }}>
              <Panel T={T} title="Shifts" pad={false}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: T.paperAlt }}>
                    {['Name', 'Shift type', 'Start time', 'End time', 'Weekly off', 'Assigned', ''].map((h, i) => (
                      <th key={h} style={{ padding: '10px 18px', textAlign: i === 6 ? 'right' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {templates.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No shifts defined yet.</td></tr>}
                    {templates.map((t: any) => (
                      <tr key={t.id}>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{t.name}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{t.type === 'flexible' ? 'Flexible shift' : 'Fixed shift'}{t.auto_clock_out ? <Badge T={T} tone="blue" style={{ marginLeft: 6 }}>auto clock out</Badge> : null}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub, fontFamily: T.fMono }}>{t.start_time || '—'}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub, fontFamily: T.fMono }}>{t.end_time || '—'}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{(t.weekly_off_days || []).map((d: number) => DOW[d]).join(', ') || '—'}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{t.employee_count}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                          <button onClick={() => setEditTpl(t)} style={hrMini(T)}>Edit</button>
                          <button onClick={() => setAssignTpl(t)} style={{ ...hrMini(T), marginLeft: 6 }}>Assign Users</button>
                          <button onClick={() => API.hrm.removeShiftTemplate(t.id).then(reload).catch((e: any) => show(e.message))} style={{ ...hrMini(T, true), marginLeft: 6 }}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>
          )}
          {tab === 'attendance' && (() => {
            const today = todayLocal();
            const todayRec = (id: any) => att.find((a: any) => a.employee_id === id && a.date === today);
            const ATT_VIEWS: any[] = [['all', 'All Attendance'], ['by_shift', 'Attendance by shift'], ['by_date', 'Attendance by date'], ['import', 'Import Attendance']];
            return (
            <>
              <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
                {ATT_VIEWS.map(([id, lbl]) => (
                  <button key={id} onClick={() => setAttView(id)} style={{ padding: '7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: attView === id ? 700 : 500, background: attView === id ? T.accent.base : 'transparent', color: attView === id ? T.accent.on : T.inkMid }}>{lbl}</button>
                ))}
              </div>

              {attView === 'by_shift' && (
                <Panel T={T} title="Attendance by shift" pad={false}>
                  <div style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}>
                    <input type="date" value={byShiftDay} onChange={e => setByShiftDay(e.target.value)} style={hrFilterSel(T)} />
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: T.paperAlt }}>{['Shift', 'Assigned', 'Present', 'Absent'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 18px', textAlign: i ? 'right' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, borderBottom: `1px solid ${T.line}` }}>{h}</th>))}</tr></thead>
                    <tbody>
                      {(!byShift || byShift.rows.length === 0) && <tr><td colSpan={4} style={{ padding: 26, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No data found</td></tr>}
                      {(byShift?.rows || []).map((r: any) => (
                        <tr key={r.shift_id || 'none'}>
                          <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: r.shift_id ? T.ink : T.inkMute }}>{r.shift}</td>
                          <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{r.assigned}</td>
                          <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.greenText }}>{r.present}</td>
                          <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: r.absent ? T.redText : T.inkSub }}>{r.absent}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              )}

              {attView === 'by_date' && (
                <Panel T={T} title="Attendance by date" pad={false}>
                  <div style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="date" value={attFrom} onChange={e => setAttFrom(e.target.value)} style={hrFilterSel(T)} />
                    <span style={{ color: T.inkMute, fontSize: 12 }}>to</span>
                    <input type="date" value={attTo} onChange={e => setAttTo(e.target.value)} style={hrFilterSel(T)} />
                    {byDate && <span style={{ marginLeft: 8, fontSize: 12, color: T.inkSub }}>{byDate.headcount} active staff</span>}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: T.paperAlt }}>{['Date', 'Present', 'Absent'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 18px', textAlign: i ? 'right' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, borderBottom: `1px solid ${T.line}` }}>{h}</th>))}</tr></thead>
                    <tbody>
                      {(!byDate || byDate.rows.length === 0) && <tr><td colSpan={3} style={{ padding: 26, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No data found</td></tr>}
                      {(byDate?.rows || []).map((r: any) => (
                        <tr key={r.date}>
                          <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: T.ink }}>{r.date}{r.holiday ? <Badge T={T} tone="blue" style={{ marginLeft: 8 }}>holiday</Badge> : null}</td>
                          <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.greenText }}>{r.present}</td>
                          <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: r.absent ? T.redText : T.inkSub }}>{r.absent}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              )}

              {attView === 'import' && <AttendanceImport T={T} onDone={() => { setAttView('all'); reload(); }} show={show} />}

              {attView === 'all' && <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={attEmp} onChange={e => setAttEmp(e.target.value)} style={hrFilterSel(T)}>
                  <option value="">All employees</option>
                  {emps.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <input type="date" title="From" value={attFrom} onChange={e => setAttFrom(e.target.value)} style={hrFilterSel(T)} />
                <input type="date" title="To" value={attTo} onChange={e => setAttTo(e.target.value)} style={hrFilterSel(T)} />
                {(attEmp || attFrom || attTo) && <button onClick={() => { setAttEmp(''); setAttFrom(''); setAttTo(''); }} style={{ padding: '8px 12px', borderRadius: T.r, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600 }}>Clear</button>}
              </div>
              <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {emps.map((e: any) => {
                  const rec = todayRec(e.id);
                  const state = !rec ? 'out' : (rec.clock_out ? 'done' : 'in');
                  return (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: T.rLg, border: `1px solid ${state === 'in' ? T.green + '55' : T.line}`, background: state === 'in' ? T.greenSoft : T.card }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name.split(' ')[0]}</div>
                        <div style={{ fontSize: 10.5, fontFamily: T.fMono, color: T.inkSub }}>{rec ? (rec.clock_out ? `${rec.clock_in}–${rec.clock_out}` : `in ${rec.clock_in}`) : 'not clocked in'}</div>
                      </div>
                      {state === 'done'
                        ? <span style={{ fontSize: 11, fontWeight: 700, color: T.greenText, flexShrink: 0 }}><LuCheck size={12} style={{ verticalAlign: -2, marginRight: 3 }} />Done</span>
                        : <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            {state === 'in' && <button onClick={() => API.hrm.breakToggle(e.id).then(() => { reload(); show((rec && rec.on_break ? 'Back from break · ' : 'On break · ') + e.name.split(' ')[0]); })} style={{ padding: '7px 11px', borderRadius: 8, border: `1px solid ${T.line}`, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 700, color: rec && rec.on_break ? T.amberText : T.inkMid, background: rec && rec.on_break ? T.amberSoft : T.paper }}>{rec && rec.on_break ? 'End break' : 'Break'}</button>}
                            <button onClick={() => API.hrm.clock(e.id).then(() => { reload(); show((state === 'in' ? 'Clocked out ' : 'Clocked in ') + e.name.split(' ')[0]); })} style={{ padding: '7px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 700, color: '#fff', background: state === 'in' ? T.red : T.green }}>{state === 'in' ? 'Clock out' : 'Clock in'}</button>
                          </span>}
                    </div>
                  );
                })}
              </div>
              <Panel T={T} pad={false}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{[['Employee', 'l'], ['Date', 'l'], ['Clock in', 'l'], ['Clock out', 'l'], ['Work duration', 'r'], ['IP address', 'l'], ['Shift', 'l'], ['Status', 'l'], ['', 'r']].map(([h, a], i) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {pAtt.slice.map((a: any) => (
                      <tr key={a.id}>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{a.employee_name}{a.flexible ? <span style={{ marginLeft: 7 }}><Badge T={T} tone="blue">flexible</Badge></span> : null}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub, fontFamily: T.fMono }}>{a.date}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: T.ink }}>{a.clock_in || '—'}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: a.status === 'running' ? T.amberText : T.ink }}>{a.clock_out || (a.status === 'running' ? nowClock : '—')}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: a.status === 'running' ? T.amberText : T.ink }}>{a.hours_label}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 11.5, color: T.inkSub }} title={[a.clock_in_note, a.clock_out_note].filter(Boolean).join(' / ')}>{a.ip_address || '—'}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub }}>{a.shift_name || '—'}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={atone[a.status] || 'gray'}>{a.status}</Badge></td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {a.date === today && a.clock_in && !a.clock_out
                            ? <button onClick={() => API.hrm.clock(a.employee_id).then(() => { reload(); show('Clocked out ' + a.employee_name.split(' ')[0]); })} style={hrMini(T)}>Clock out</button>
                            : null}
                          <button onClick={() => setEditAtt(a)} style={{ ...hrMini(T), marginLeft: 6 }}>Edit</button>
                          <button onClick={() => API.hrm.removeAttendance(a.id).then(reload).catch((e: any) => show(e.message))} style={{ ...hrMini(T, true), marginLeft: 6 }}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              <div style={{ padding: '0 18px' }}><ListFooter T={T} paged={pAtt} /></div>
              </Panel>
              </>}
            </>
            );
          })()}

          {/* LEAVE */}
          {tab === 'leave' && (
            <>
              <div style={{ marginBottom: 16, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: T.card, borderRadius: T.rLg, overflow: 'hidden', border: `1px solid ${T.line}` }}>
                  <thead><tr><th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt }}>Balances</th>{leaveTypes.filter((t: any) => t.paid).map((t: any) => <th key={t.id} style={{ textAlign: 'right', padding: '10px 16px', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt }}>{t.name}</th>)}</tr></thead>
                  <tbody>
                    {leaveBal.map((r: any) => (
                      <tr key={r.employee_id}>
                        <td style={{ padding: '9px 16px', borderTop: `1px solid ${T.line}`, fontSize: 12.5, fontWeight: 600, color: T.ink }}>{r.employee_name}</td>
                        {leaveTypes.filter((t: any) => t.paid).map((t: any) => { const b: any = r.balances.find((x: any) => x.type === t.name) || {}; return (
                          <td key={t.id} style={{ padding: '9px 16px', borderTop: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5 }}><b style={{ color: b.balance > 0 ? T.greenText : T.inkMute }}>{b.balance}</b><span style={{ color: T.inkMute }}> / {b.entitled}</span>{b.pending ? <span style={{ color: T.amberText, fontSize: 10.5 }}> ({b.pending} pend)</span> : ''}</td>
                        ); })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['Reference No', 'l'], ['Employee', 'l'], ['Type', 'l'], ['Period', 'l'], ['Days', 'r'], ['Reason', 'l'], ['Status', 'l'], ['Approved by', 'l'], ['', 'r']].map(([h, a], i) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {pLeaves.slice.map((l: any) => (
                    <tr key={l.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{l.reference_no || '—'}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{l.employee_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone="gray">{l.type}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 11.5, color: T.inkSub, fontFamily: T.fMono }}>{l.from} → {l.to}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{l.days}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkMid }}>{l.reason}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={ltone[l.status]}>{l.status}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: l.approved_by ? T.inkMid : T.inkMute }}>{l.approved_by || '—'}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>{l.status === 'pending'
                        ? <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button onClick={() => API.hrm.setLeave(l.id, 'approved').then(() => { reload(); API.hrm.leaveBalances().then(setLeaveBal); })} style={hrMini(T, 'accent')}>Approve</button>
                            <button onClick={() => API.hrm.setLeave(l.id, 'rejected').then(() => { reload(); API.hrm.leaveBalances().then(setLeaveBal); })} style={hrMini(T, true)}>Reject</button>
                            <button onClick={() => setEditLeave(l)} style={hrMini(T)}>Edit</button>
                            <button onClick={() => API.hrm.removeLeave(l.id).then(() => { reload(); API.hrm.leaveBalances().then(setLeaveBal); }).catch((e: any) => show(e.message))} style={hrMini(T, true)}>Remove</button>
                          </span>
                        : <span style={{ fontSize: 11.5, color: T.inkMute }}>reject to edit</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            <div style={{ padding: '0 18px' }}><ListFooter T={T} paged={pLeaves} /></div>
              </Panel>
            </>
          )}

          {/* PAYROLL */}
          {tab === 'payroll' && payGroups.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Panel T={T} title="Payroll groups" pad={false}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: T.paperAlt }}>
                    {['Name', 'Month', 'Status', 'Payment status', 'Total gross', 'Employees', 'Added by', 'Location', ''].map((h, i) => (
                      <th key={h} style={{ padding: '10px 18px', textAlign: i === 8 ? 'right' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {payGroups.map((g: any) => (
                      <tr key={g.id}>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{g.name}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{g.month}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={g.status === 'paid' ? 'green' : 'amber'}>{g.status}</Badge></td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={g.payment_status === 'paid' ? 'green' : 'gray'}>{g.payment_status}</Badge></td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.ink }}>{money(g.total_gross)}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{g.employees}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{g.added_by}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{g.location_name}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                          {g.payment_status !== 'paid' && <>
                            <button onClick={() => API.hrm.payPayrollGroup(g.id).then(() => { show('Group paid'); reload(); }).catch((e: any) => show(e.message))} style={hrMini(T, 'accent')}>Pay</button>
                            <button onClick={() => API.hrm.removePayrollGroup(g.id).then(reload).catch((e: any) => show(e.message))} style={{ ...hrMini(T, true), marginLeft: 6 }}>Discard</button>
                          </>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>
          )}

          {tab === 'payroll' && (
            <div style={{ marginBottom: 16 }}>
              <Panel T={T} title="Pay components" pad={false}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: T.paperAlt }}>
                    {['Description', 'Type', 'Amount', 'Applicable date', 'Employee', ''].map((h, i) => (
                      <th key={h} style={{ padding: '10px 18px', textAlign: i === 5 ? 'right' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {payComps.length === 0 && <tr><td colSpan={6} style={{ padding: 22, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No pay components. Add one to apply it automatically to every run.</td></tr>}
                    {payComps.map((c: any) => (
                      <tr key={c.id}>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{c.description}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={c.type === 'earning' ? 'green' : 'red'}>{c.type}</Badge></td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: T.ink }}>{c.amount_type === 'percentage' ? `${c.amount}% of basic` : money(c.amount)}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub, fontFamily: T.fMono }}>{c.applicable_date || '—'}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{c.employee_name}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                          <button onClick={() => setEditComp(c)} style={hrMini(T)}>Edit</button>
                          <button onClick={() => API.hrm.removePayComponent(c.id).then(reload)} style={{ ...hrMini(T, true), marginLeft: 6 }}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>
          )}
          {tab === 'payroll' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['Employee', 'l'], ['Department', 'l'], ['Designation', 'l'], ['Month', 'l'], ['Reference No', 'l'], ['Total amount', 'r'], ['Deduction', 'r'], ['Net pay', 'r'], ['Payment status', 'l']].map(([h, a], i) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {pPay.slice.map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{p.employee_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{p.department}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{p.designation}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{p.month}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{p.reference_no || '—'}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.ink }}>{money(p.gross)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.redText }}>−{money(p.deduction)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 700, color: T.ink }}>{money(p.net)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={p.payment_status === 'paid' ? 'green' : 'amber'}>{p.payment_status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pay.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No payroll runs yet.</div>}
            <div style={{ padding: '0 18px' }}><ListFooter T={T} paged={pPay} /></div>
              </Panel>
          )}

          {/* TODOS */}
          {tab === 'todos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fTodos.map((t: any) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', background: T.card, border: `1px solid ${T.line}`, borderRadius: T.r, boxShadow: T.sh1 }}>
                  <button onClick={() => API.hrm.setTodo(t.id, t.status === 'done' ? 'pending' : 'done').then(reload)} style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${t.status === 'done' ? T.green : T.lineMid}`, background: t.status === 'done' ? T.green : 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12, flexShrink: 0, lineHeight: 0 }}>{t.status === 'done' ? <LuCheck size={12} /> : ''}</button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: t.status === 'done' ? T.inkMute : T.ink, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</div>
                    <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 2 }}>{t.assigned_name} · due {t.due}</div>
                  </div>
                  <Badge T={T} tone={ptone[t.priority]}>{t.priority}</Badge>
                </div>
              ))}
            </div>
          )}

          {/* ATTENDANCE REPORT */}
          {tab === 'report' && (
            <>
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12.5, color: T.inkSub }}>Month</span>
                <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ padding: '7px 11px', fontSize: 12.5, fontFamily: T.fMono, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none' }} />
              </div>
              <Panel T={T} pad={false}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{[['Employee', 'l'], ['Days', 'r'], ['Present', 'r'], ['Late', 'r'], ['Absent', 'r'], ['Hours', 'r'], ['Overtime', 'r'], ['OT pay', 'r'], ['Deductions', 'r']].map(([h, a], i) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {fReport.map((r: any) => (
                      <tr key={r.employee_id}>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{r.employee_name}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{r.days_worked}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.greenText }}>{r.present}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: r.late ? T.amberText : T.inkSub }}>{r.late}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: r.absent ? T.redText : T.inkSub }}>{r.absent}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{r.total_hours}h</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: r.overtime_hours ? T.amberText : T.inkSub }}>{r.overtime_hours}h</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: r.overtime_pay ? T.amberText : T.inkSub }}>{money(r.overtime_pay)}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: r.total_deduction ? T.redText : T.inkSub }}>{money(r.total_deduction)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No attendance data for this month.</div>}
              </Panel>
            </>
          )}

          {/* SHIFTS / ROSTER */}
          {tab === 'shifts' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['Employee', 'l'], ['Date', 'l'], ['Shift', 'l'], ['Role', 'l'], ['Location', 'l'], ['', 'r']].map(([h, a], i) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {fShifts.map((s: any) => (
                    <tr key={s.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{s.employee_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub, fontFamily: T.fMono }}>{s.date}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: T.ink }}>{s.start} – {s.end}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{s.role || '—'}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{s.location_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}><button onClick={() => API.hrm.removeShift(s.id).then(() => API.hrm.shifts().then(setShifts))} style={hrMini(T, true)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shifts.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No shifts scheduled.</div>}
            </Panel>
          )}

          {/* SHIFT SWAPS — shown under the Shifts tab */}
          {tab === 'shifts' && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub }}>Swap requests</div>
                <Btn T={T} kind="ghost" onClick={() => setModal('swap')}>⇄ Request swap</Btn>
              </div>
              <Panel T={T} pad={false}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{[['Shift', 'l'], ['From', 'l'], ['To', 'l'], ['Reason', 'l'], ['Status', 'l'], ['', 'r']].map(([h, a], i) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {swaps.map((s: any) => (
                      <tr key={s.id}>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink, fontFamily: T.fMono }}>{s.shift ? `${s.shift.date} ${s.shift.start}–${s.shift.end}` : '—'}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, fontWeight: 600, color: T.ink }}>{s.from_name}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, fontWeight: 600, color: T.accent.text }}>→ {s.to_name}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{s.reason || '—'}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={s.status === 'approved' ? 'green' : s.status === 'rejected' ? 'red' : 'amber'}>{s.status}</Badge></td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                          {s.status === 'pending'
                            ? <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button onClick={() => API.hrm.setSwap(s.id, 'approved').then(() => { show('Swap approved'); API.hrm.shiftSwaps().then(setSwaps); API.hrm.shifts().then(setShifts); })} style={hrMini(T, 'accent')}>Approve</button>
                                <button onClick={() => API.hrm.setSwap(s.id, 'rejected').then(() => { show('Swap rejected'); API.hrm.shiftSwaps().then(setSwaps); })} style={hrMini(T, true)}>Reject</button>
                              </span>
                            : <button onClick={() => API.hrm.removeSwap(s.id).then(() => API.hrm.shiftSwaps().then(setSwaps))} style={hrMini(T)}>Remove</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {swaps.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No swap requests. Staff can request to hand a shift to a colleague; a manager approves it here.</div>}
              </Panel>
            </div>
          )}

          {/* ADVANCES / LOANS */}
          {tab === 'advances' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['Employee', 'l'], ['Date', 'l'], ['Amount', 'r'], ['Outstanding', 'r'], ['Paid from', 'l'], ['Note', 'l'], ['Status', 'l'], ['', 'r']].map(([h, a], i) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {pAdvances.slice.map((a: any) => (
                    <tr key={a.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{a.employee_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub, fontFamily: T.fMono }}>{a.date}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{money(a.amount)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: a.outstanding > 0 ? T.amberText : T.greenText }}>{money(a.outstanding)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{a.account_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{a.note || '—'}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={a.status === 'settled' ? 'green' : 'amber'}>{a.status}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}><button onClick={() => API.hrm.removeAdvance(a.id).then(() => API.hrm.advances().then(setAdvances))} style={hrMini(T, true)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {advances.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No advances given. Advances draw from a payment account and recover automatically via payroll deduction.</div>}
            <div style={{ padding: '0 18px' }}><ListFooter T={T} paged={pAdvances} /></div>
              </Panel>
          )}
        </div>
      </div>

      {modal === 'employee' && <EmployeeModal T={T} meta={meta} locs={locs} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Employee added'); reload(); }} />}
      {editTarget && <SalesTargetModal T={T} target={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); show('Sales target saved'); reload(); }} />}
      {modal === 'paygroup' && <PayrollGroupModal T={T} emps={emps} locs={locs} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Payroll group created as draft'); reload(); }} />}
      {modal === 'paycomponent' && <PayComponentModal T={T} emps={emps} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Pay component added'); reload(); }} />}
      {editComp && <PayComponentModal T={T} emps={emps} component={editComp} onClose={() => setEditComp(null)} onSaved={() => { setEditComp(null); show('Pay component updated'); reload(); }} />}
      {modal === 'shifttemplate' && <ShiftTemplateModal T={T} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Shift added'); reload(); }} />}
      {editTpl && <ShiftTemplateModal T={T} template={editTpl} onClose={() => setEditTpl(null)} onSaved={() => { setEditTpl(null); show('Shift updated'); reload(); }} />}
      {assignTpl && <ShiftAssignModal T={T} emps={emps} template={assignTpl} onClose={() => setAssignTpl(null)} onSaved={() => { setAssignTpl(null); show('Employees assigned'); reload(); }} />}
      {(modal === 'org' || modal === 'designation') && <OrgUnitModal T={T} kind={modal === 'org' ? 'department' : 'designation'} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Added'); API.hrm.org().then(setOrg); }} />}
      {editLeave && <LeaveModal T={T} emps={emps} leaveTypes={leaveTypes} holidays={holidays} leave={editLeave} onClose={() => setEditLeave(null)} onSaved={() => { setEditLeave(null); show('Leave updated'); reload(); API.hrm.leaveBalances().then(setLeaveBal); }} />}
      {editAtt && <AttendanceEntryModal T={T} emps={emps} templates={templates} record={editAtt.id ? editAtt : null} onClose={() => setEditAtt(null)} onSaved={() => { setEditAtt(null); show('Attendance saved'); reload(); }} />}
      {editOrg && <OrgUnitModal T={T} kind={editOrg.kind} unit={editOrg} onClose={() => setEditOrg(null)} onSaved={() => { setEditOrg(null); show('Saved'); API.hrm.org().then(setOrg); reload(); }} />}
      {modal === 'holiday' && <HolidayModal T={T} locs={locs} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Holiday added'); reload(); }} />}
      {editHol && <HolidayModal T={T} locs={locs} holiday={editHol} onClose={() => setEditHol(null)} onSaved={() => { setEditHol(null); show('Holiday updated'); reload(); }} />}
      {editEmp && <EmployeeModal T={T} meta={meta} locs={locs} employee={editEmp} onClose={() => setEditEmp(null)} onSaved={() => { setEditEmp(null); show('Employee updated'); reload(); }} />}
      {modal === 'org' && <OrgModal T={T} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Added'); API.hrm.org().then(setOrg); API.hrm.meta().then(setMeta); }} />}
      {modal === 'leave' && <LeaveModal T={T} emps={emps} leaveTypes={leaveTypes} holidays={holidays} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Leave applied'); reload(); API.hrm.leaveBalances().then(setLeaveBal); }} />}
      {modal === 'leavetypes' && <LeaveTypesManager T={T} emps={emps} onClose={() => setModal(null)} onSaved={() => { API.hrm.leaveTypes().then(setLeaveTypes); API.hrm.leaveBalances().then(setLeaveBal); }} />}
      {modal === 'payroll' && <PayrollModal T={T} emps={emps} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Payroll run'); reload(); }} />}
      {modal === 'todo' && <TodoModal T={T} emps={emps} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Task added'); reload(); }} />}
      {modal === 'shift' && <ShiftModal T={T} emps={emps} locs={locs} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Shift added'); API.hrm.shifts().then(setShifts); }} />}
      {modal === 'advance' && <AdvanceModal T={T} emps={emps} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Advance given'); API.hrm.advances().then(setAdvances); }} />}
      {modal === 'attsettings' && <AttendanceSettings T={T} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Attendance settings saved'); reload(); }} />}
      {modal === 'payslipsettings' && <PayslipSettings T={T} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Payslip settings saved'); }} />}
      {modal === 'swap' && <SwapModal T={T} shifts={shifts} emps={emps} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Swap requested'); API.hrm.shiftSwaps().then(setSwaps); }} />}
      {profile && <EmployeeProfile T={T} profile={profile} onClose={() => setProfile(null)} />}
      {node}
    </div>
  );
}
