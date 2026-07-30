'use client';
// ─────────────────────────────────────────────────────────────────
// HRM / Essentials — employees, attendance, leave, payroll, tasks.
// A paid add-on: locked unless the HRM module is enabled in Plan &
// Modules. Wired through API.hrm.*
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useSession } from '@/components/shell';
import { API } from '@/lib/api';
import { LuUsers, LuPrinter, LuSettings, LuTriangleAlert, LuSearch, LuCheck, LuClock, LuHourglass, LuBanknote, LuListTodo, LuX, LuPlay } from 'react-icons/lu';
import { BUSINESS } from '@/lib/data';
import { todayLocal } from '@/lib/business-settings';

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
  const [editTpl, setEditTpl] = useStateHr<any>(null);
  const [assignTpl, setAssignTpl] = useStateHr<any>(null);
  const [editHol, setEditHol] = useStateHr<any>(null);
  const [q, setQ] = useStateHr('');
  const [fDept, setFDept] = useStateHr('');
  const [fStatus, setFStatus] = useStateHr('');
  // The leave list is capped server-side, so a date range is how older requests
  // are reached rather than silently falling off the end.
  const [leaveFrom, setLeaveFrom] = useStateHr('');
  const [leaveTo, setLeaveTo] = useStateHr('');
  const [show, node] = useToast();
  React.useEffect(() => { setQ(''); setFDept(''); setFStatus(''); }, [tab]);
  const matchQ = (s: any) => !q || String(s || '').toLowerCase().includes(q.toLowerCase());

  const reload = React.useCallback(() => {
    API.hrm.summary().then(setSummary).catch(() => {});
    API.hrm.employees().then(setEmps).catch(() => {});
    API.hrm.attendance().then(setAtt).catch(() => {});
    API.hrm.leaves({ ...(leaveFrom && { from: leaveFrom }), ...(leaveTo && { to: leaveTo }) }).then(setLeaves).catch(() => {});
    API.hrm.payroll().then(setPay).catch(() => {});
    API.hrm.todos().then(setTodos).catch(() => {});
    API.hrm.shifts().then(setShifts).catch(() => {});
    API.hrm.shiftSwaps().then(setSwaps).catch(() => {});
    API.hrm.leaveBalances().then(setLeaveBal).catch(() => {});
    API.hrm.leaveTypes().then(setLeaveTypes).catch(() => {});
    API.hrm.holidays().then(setHolidays).catch(() => {});
    API.hrm.shiftTemplates().then(setTemplates).catch(() => {});
    API.hrm.advances().then(setAdvances).catch(() => {});
  }, [leaveFrom, leaveTo]);
  useEffectHr(() => { API.module.list().then((ms: any[]) => setEnabled(!!(ms.find((m: any) => m.key === 'hrm') || {}).enabled)).catch(() => setEnabled(false)); }, []);
  useEffectHr(() => { if (enabled) { reload(); API.hrm.meta().then(setMeta).catch(() => {}); API.location.list().then(setLocs).catch(() => {}); } }, [enabled, reload]);

  async function enableModule() { await API.module.setEnabled('hrm', true); setEnabled(true); show('HRM module enabled'); }
  const hasRunning = att.some((a: any) => a.status === 'running');
  useEffectHr(() => {
    if (tab !== 'attendance' || !hasRunning) return;
    const t = setInterval(() => { setNowClock(new Date().toTimeString().slice(0, 5)); API.hrm.attendance().then(setAtt).catch(() => {}); }, 30000);
    return () => clearInterval(t);
  }, [tab, hasRunning]);

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

  const tabs = [['overview', 'Overview'], ['employees', 'Employees'], ['org', 'Departments'], ['attendance', 'Attendance'], ['report', 'Report'], ['shifts', 'Shifts'], ['leave', 'Leave'], ['holidays', 'Holiday'], ['payroll', 'Payroll'], ['advances', 'Advances'], ['todos', 'Tasks']];
  const inDept = (empId: any) => !fDept || (emps.find((e: any) => e.id === empId) || {}).department === fDept;
  const fAtt = att.filter((a: any) => matchQ(a.employee_name) && inDept(a.employee_id) && (!fStatus || a.status === fStatus));
  const fLeaves = leaves.filter((l: any) => (matchQ(l.employee_name) || matchQ(l.type) || matchQ(l.reason)) && inDept(l.employee_id) && (!fStatus || l.status === fStatus));
  const fShifts = shifts.filter((s: any) => (matchQ(s.employee_name) || matchQ(s.role)) && inDept(s.employee_id));
  const fPay = pay.filter((p: any) => (matchQ(p.employee_name) || matchQ(p.month)) && inDept(p.employee_id));
  const fAdvances = advances.filter((a: any) => (matchQ(a.employee_name) || matchQ(a.note)) && inDept(a.employee_id) && (!fStatus || a.status === fStatus));
  const fHolidays = holidays.filter((h: any) => matchQ(h.name) || matchQ(h.note) || matchQ(h.location_name));
  const fTodos = todos.filter((t: any) => (matchQ(t.title) || matchQ(t.assigned_name)) && (!fStatus || t.status === fStatus));
  const fReport = report.filter((r: any) => matchQ(r.employee_name) && inDept(r.employee_id));

  // ── Export / print for the active tab ─────────────────────────────
  const exportSets: any = {
    holidays: () => ({ title: 'Holidays', cols: ['Name', 'From', 'To', 'Business Location', 'Note'], rows: fHolidays.map((h: any) => [h.name, h.start_date, h.end_date, h.location_name, h.note]) }),
    employees: () => ({ title: 'Employees', cols: ['Name', 'Email', 'Department', 'Designation', 'Location', 'Salary', 'Joined', 'Status'], rows: emps.filter((e: any) => matchQ(e.name) && (!fDept || e.department === fDept)).map((e: any) => [e.name, e.email, e.department, e.designation, e.location_name, e.salary, e.joined, e.on_leave ? 'on leave' : e.status]) }),
    attendance: () => ({ title: 'Attendance', cols: ['Employee', 'Date', 'Clock in', 'Clock out', 'Hours', 'Status'], rows: fAtt.map((a: any) => [a.employee_name, a.date, a.clock_in, a.clock_out, a.hours_label, a.status]) }),
    report: () => ({ title: 'Attendance report ' + reportMonth, cols: ['Employee', 'Days', 'Present', 'Late', 'Absent', 'Hours', 'Overtime h', 'OT pay', 'Deductions'], rows: fReport.map((r: any) => [r.employee_name, r.days_worked, r.present, r.late, r.absent, r.total_hours, r.overtime_hours, r.overtime_pay, r.total_deduction]) }),
    shifts: () => ({ title: 'Shifts', cols: ['Employee', 'Date', 'Start', 'End', 'Role', 'Location'], rows: fShifts.map((s: any) => [s.employee_name, s.date, s.start, s.end, s.role, s.location_name]) }),
    leave: () => ({ title: 'Leave', cols: ['Employee', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Approved by'], rows: fLeaves.map((l: any) => [l.employee_name, l.type, l.from, l.to, l.days, l.reason, l.status, l.approved_by || '']) }),
    payroll: () => ({ title: 'Payroll', cols: ['Employee', 'Month', 'Basic', 'Allowance', 'Overtime', 'Bonus', 'Incentive', 'Deduction', 'Net', 'Status'], rows: fPay.map((p: any) => [p.employee_name, p.month, p.basic, p.allowance || 0, p.overtime || 0, p.bonus || 0, p.incentive || 0, p.deduction, p.net, p.status]) }),
    advances: () => ({ title: 'Advances', cols: ['Employee', 'Date', 'Amount', 'Outstanding', 'Account', 'Note', 'Status'], rows: fAdvances.map((a: any) => [a.employee_name, a.date, a.amount, a.outstanding, a.account_name, a.note, a.status]) }),
    todos: () => ({ title: 'Tasks', cols: ['Task', 'Assigned to', 'Priority', 'Status', 'Due'], rows: fTodos.map((t: any) => [t.title, t.assigned_name, t.priority, t.status, t.due]) }),
    org: () => ({ title: 'Departments & designations', cols: ['Type', 'Name', 'Employees'], rows: [...org.departments.map((d: any) => ['Department', d.name, d.count]), ...org.designations.map((d: any) => ['Designation', d.name, d.count])] }),
  };
  const activeSet = () => (exportSets[tab] || exportSets.employees)();
  function exportCSV() {
    const { title, cols, rows } = activeSet();
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [cols, ...rows].map((r: any) => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${bizName}-${title}.csv`.replace(/\s+/g, '-'); document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    show('Exported ' + title);
  }
  function printTable() {
    const { title, cols, rows } = activeSet();
    const w = window.open('', '_blank', 'width=900,height=700'); if (!w) return;
    const thead = cols.map(function (c: any) { return '<th style="text-align:left;padding:7px 10px;background:#f4f1ea;border-bottom:1px solid #ddd;text-transform:uppercase;font-size:10px;letter-spacing:.5px;color:#666">' + c + '</th>'; }).join('');
    const tbody = rows.map(function (r: any) {
      const cells = r.map(function (c: any) { return '<td style="padding:7px 10px;border-bottom:1px solid #eee">' + (c == null ? '' : c) + '</td>'; }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');
    const html = '<html><head><title>' + title + ' — ' + bizName + '</title></head>'
      + '<body style="font-family:system-ui,sans-serif;margin:32px;color:#1a1a1a">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1a1a1a;padding-bottom:10px;margin-bottom:14px"><div style="font-size:20px;font-weight:800">' + bizName + '</div><div style="font-size:13px;color:#666">' + title + ' · ' + new Date().toLocaleDateString() + '</div></div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table>'
      + '<div style="text-align:center;font-size:10px;color:#999;margin-top:24px">' + rows.length + ' rows · Balanzify POS</div>'
      + '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print()},300)}</scr' + 'ipt></body></html>';
    w.document.write(html); w.document.close();
  }
  const atone: any = { present: 'green', late: 'amber', absent: 'red', running: 'amber' };
  const ltone: any = { approved: 'green', pending: 'amber', rejected: 'red' };
  const ptone: any = { high: 'red', medium: 'amber', low: 'gray' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="HRM / Essentials" subtitle="People, time & payroll"
        right={<span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {tab !== 'overview' && <><Btn T={T} kind="ghost" onClick={exportCSV}>⤓ Export</Btn><Btn T={T} kind="ghost" onClick={printTable}><LuPrinter size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Print</Btn></>}
          {tab === 'employees' ? <Btn T={T} kind="accent" onClick={() => setModal('employee')}>+ Add Employee</Btn>
          : tab === 'org' ? <Btn T={T} kind="accent" onClick={() => setModal('org')}>+ Add</Btn>
          : tab === 'leave' ? <><Btn T={T} kind="ghost" onClick={() => setModal('leavetypes')}><LuSettings size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Leave Types</Btn><Btn T={T} kind="accent" onClick={() => setModal('leave')}>+ Apply Leave</Btn></>
          : tab === 'payroll' ? <><Btn T={T} kind="ghost" onClick={() => setModal('payslipsettings')}><LuSettings size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Payslip</Btn><Btn T={T} kind="accent" onClick={() => setModal('payroll')}><LuPlay size={12} style={{ verticalAlign: -2, marginRight: 5 }} />Run Payroll</Btn></>
          : tab === 'holidays' ? <Btn T={T} kind="accent" onClick={() => setModal('holiday')}>+ Add Holiday</Btn>
          : tab === 'shifts' ? <Btn T={T} kind="accent" onClick={() => setModal('shift')}>+ Add Shift</Btn>
          : tab === 'advances' ? <Btn T={T} kind="accent" onClick={() => setModal('advance')}>+ Give Advance</Btn>
          : tab === 'attendance' ? <><Btn T={T} kind="ghost" onClick={() => setModal('shifttemplate')}>+ Add Shift</Btn><Btn T={T} kind="ghost" onClick={() => setModal('attsettings')}><LuSettings size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Attendance Settings</Btn></>
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

          {/* FILTER BAR — shown on data tabs */}
          {['attendance', 'report', 'shifts', 'leave', 'payroll', 'advances', 'todos'].includes(tab) && (() => {
            const statusOpts = ({
              attendance: ['present', 'late', 'absent', 'running', 'on break'],
              leave: ['pending', 'approved', 'rejected'],
              shifts: [], payroll: [], report: [], holidays: [],
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
                {tab === 'leave' && <><input type="date" title="Leave from" value={leaveFrom} onChange={e => setLeaveFrom(e.target.value)} style={hrFilterSel(T)} /><input type="date" title="Leave to" value={leaveTo} onChange={e => setLeaveTo(e.target.value)} style={hrFilterSel(T)} /></>}
                {(q || fDept || fStatus || leaveFrom || leaveTo) && <button onClick={() => { setQ(''); setFDept(''); setFStatus(''); setLeaveFrom(''); setLeaveTo(''); }} style={{ padding: '8px 12px', borderRadius: T.r, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600 }}>Clear</button>}
              </div>
            );
          })()}
          {tab === 'overview' && summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
              {[['Employees', summary.employees, LuUsers], ['Present today', summary.present, LuCheck], ['On leave', summary.on_leave, LuClock], ['Pending leave', summary.pending_leave, LuHourglass], ['Payroll (paid)', money0(summary.payroll), LuBanknote], ['Open tasks', summary.open_todos, LuListTodo]].map(([k, v, Ic]: any) => (
                <div key={k} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: 18, boxShadow: T.sh1 }}>
                  <div style={{ fontSize: 18, color: T.accent.base, marginBottom: 10, lineHeight: 0 }}><Ic /></div>
                  <div style={{ fontFamily: T.fMono, fontSize: 26, fontWeight: 600, color: T.ink, letterSpacing: '-1px' }}>{v}</div>
                  <div style={{ fontSize: 12, color: T.inkSub, marginTop: 2 }}>{k}</div>
                </div>
              ))}
            </div>
          )}

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
                  {fHolidays.map((h: any) => (
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
            </Panel>
          )}

          {/* DEPARTMENTS & DESIGNATIONS */}
          {tab === 'org' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {[['department', 'Departments', org.departments], ['designation', 'Designations', org.designations]].map(([kind, title, list]: any) => (
                <Panel T={T} key={kind} title={title}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {list.filter((d: any) => matchQ(d.name)).map((d: any) => (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>{d.name}</span>
                        <Badge T={T} tone="gray">{d.count} staff</Badge>
                        <button onClick={() => API.hrm.removeOrg(kind, d.name).then(() => API.hrm.org().then(setOrg)).catch((e: any) => show(e.message))} disabled={d.count > 0} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: d.count > 0 ? T.inkMute : T.redText, cursor: d.count > 0 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: d.count > 0 ? 0.4 : 1, lineHeight: 0 }}><LuX size={12} /></button>
                      </div>
                    ))}
                    {list.length === 0 && <div style={{ padding: 14, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>None yet.</div>}
                  </div>
                  <OrgAdder T={T} kind={kind} onAdded={() => API.hrm.org().then(setOrg)} show={show} />
                </Panel>
              ))}
            </div>
          )}

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
            return (
            <>
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
                  <thead><tr>{[['Employee', 'l'], ['Date', 'l'], ['Clock in', 'l'], ['Clock out', 'l'], ['Total hours', 'r'], ['Status', 'l'], ['', 'r']].map(([h, a], i) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {fAtt.map((a: any) => (
                      <tr key={a.id}>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{a.employee_name}{a.flexible ? <span style={{ marginLeft: 7 }}><Badge T={T} tone="blue">flexible</Badge></span> : null}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub, fontFamily: T.fMono }}>{a.date}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: T.ink }}>{a.clock_in || '—'}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: a.status === 'running' ? T.amberText : T.ink }}>{a.clock_out || (a.status === 'running' ? nowClock : '—')}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: a.status === 'running' ? T.amberText : T.ink }}>{a.hours_label}</td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={atone[a.status] || 'gray'}>{a.status}</Badge></td>
                        <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>{a.date === today && a.clock_in && !a.clock_out ? <button onClick={() => API.hrm.clock(a.employee_id).then(() => { reload(); show('Clocked out ' + a.employee_name.split(' ')[0]); })} style={hrMini(T)}>Clock out</button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
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
                <thead><tr>{[['Employee', 'l'], ['Type', 'l'], ['Period', 'l'], ['Days', 'r'], ['Reason', 'l'], ['Status', 'l'], ['Approved by', 'l'], ['', 'r']].map(([h, a], i) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {fLeaves.map((l: any) => (
                    <tr key={l.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{l.employee_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone="gray">{l.type}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 11.5, color: T.inkSub, fontFamily: T.fMono }}>{l.from} → {l.to}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{l.days}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkMid }}>{l.reason}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={ltone[l.status]}>{l.status}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: l.approved_by ? T.inkMid : T.inkMute }}>{l.approved_by || '—'}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>{l.status === 'pending' && <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}><button onClick={() => API.hrm.setLeave(l.id, 'approved').then(() => { reload(); API.hrm.leaveBalances().then(setLeaveBal); })} style={hrMini(T, 'accent')}>Approve</button><button onClick={() => API.hrm.setLeave(l.id, 'rejected').then(() => { reload(); API.hrm.leaveBalances().then(setLeaveBal); })} style={hrMini(T, true)}>Reject</button></span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            </>
          )}

          {/* PAYROLL */}
          {tab === 'payroll' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['Employee', 'l'], ['Month', 'l'], ['Basic', 'r'], ['Allowance', 'r'], ['Deduction', 'r'], ['Net pay', 'r'], ['Status', 'l']].map(([h, a], i) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {fPay.map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{p.employee_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{p.month}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{money(p.basic)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.greenText }}>+{money(p.allowance)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.redText }}>−{money(p.deduction)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 700, color: T.ink }}>{money(p.net)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone="green">{p.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pay.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No payroll runs yet.</div>}
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
                  {fAdvances.map((a: any) => (
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
            </Panel>
          )}
        </div>
      </div>

      {modal === 'employee' && <EmployeeModal T={T} meta={meta} locs={locs} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Employee added'); reload(); }} />}
      {modal === 'shifttemplate' && <ShiftTemplateModal T={T} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Shift added'); reload(); }} />}
      {editTpl && <ShiftTemplateModal T={T} template={editTpl} onClose={() => setEditTpl(null)} onSaved={() => { setEditTpl(null); show('Shift updated'); reload(); }} />}
      {assignTpl && <ShiftAssignModal T={T} emps={emps} template={assignTpl} onClose={() => setAssignTpl(null)} onSaved={() => { setAssignTpl(null); show('Employees assigned'); reload(); }} />}
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

// Doubles as the edit form: pass `employee` to load it and PUT instead of POST.
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// A named, reusable shift. A flexible shift keeps no fixed times, so the time
// inputs disappear rather than sitting there holding stale values.
function ShiftTemplateModal({ T, template, onClose, onSaved }: { T: any; template?: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!template;
  const [f, setF] = useStateHr<any>(editing
    ? { name: template.name, type: template.type, start_time: template.start_time || '', end_time: template.end_time || '', weekly_off_days: template.weekly_off_days || [], auto_clock_out: !!template.auto_clock_out }
    : { name: '', type: 'fixed', start_time: '09:00', end_time: '18:00', weekly_off_days: [], auto_clock_out: false });
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const toggleDay = (d: number) => setF((s: any) => ({
    ...s, weekly_off_days: s.weekly_off_days.includes(d) ? s.weekly_off_days.filter((x: number) => x !== d) : [...s.weekly_off_days, d].sort(),
  }));
  return (
    <Modal T={T} title={editing ? `Edit ${template.name}` : 'Add shift'} width={560} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => {
        if (!f.name.trim()) { setErr('Name is required.'); return; }
        if (f.type === 'fixed' && (!f.start_time || !f.end_time)) { setErr('A fixed shift needs a start and end time.'); return; }
        setBusy(true); setErr(null);
        try { if (editing) await API.hrm.updateShiftTemplate(template.id, f); else await API.hrm.addShiftTemplate(f); onSaved(); }
        catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add shift'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Name" full><TextField T={T} value={f.name} onChange={v => set('name', v)} placeholder="e.g. Morning Shift" /></Field>
        <Field T={T} label="Shift type" full>
          <SelectField T={T} value={f.type} options={['fixed', 'flexible']} onChange={v => set('type', v)}
            render={(v: any) => v === 'fixed' ? 'Fixed shift' : 'Flexible shift — no set hours'} />
        </Field>
        {f.type === 'fixed' && <>
          <Field T={T} label="Start time"><TextField T={T} type="time" value={f.start_time} onChange={v => set('start_time', v)} /></Field>
          <Field T={T} label="End time"><TextField T={T} type="time" value={f.end_time} onChange={v => set('end_time', v)} /></Field>
        </>}
      </FormGrid>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 6 }}>Weekly off days</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DOW.map((d, i) => {
            const on = f.weekly_off_days.includes(i);
            return <button key={d} onClick={() => toggleDay(i)} style={{ padding: '6px 11px', borderRadius: T.r, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: on ? 700 : 500, border: `1px solid ${on ? T.accent.base : T.line}`, background: on ? T.accent.soft : T.paper, color: on ? T.accent.text : T.inkMid }}>{d.slice(0, 3)}</button>;
          })}
        </div>
        <div style={{ fontSize: 11, color: T.inkMute, marginTop: 7 }}>Nobody on this shift is marked absent on these days.</div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12.5, color: T.inkMid, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.auto_clock_out} onChange={e => set('auto_clock_out', e.target.checked)} />
        Do auto clock out — close a forgotten clock-in at the shift end
      </label>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

// Assign Users — the selection replaces the shift's whole roster.
function ShiftAssignModal({ T, emps, template, onClose, onSaved }: { T: any; emps: any[]; template: any; onClose: () => void; onSaved: () => void }) {
  const [sel, setSel] = useStateHr<any[]>(template.employee_ids || []);
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  const toggle = (id: any) => setSel((s: any[]) => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  return (
    <Modal T={T} title={`Assign users — ${template.name}`} width={520} onClose={onClose}
      footer={<><div style={{ flex: 1, fontSize: 12.5, color: T.inkSub }}>{sel.length} selected</div><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => {
        setBusy(true); setErr(null);
        try { await API.hrm.assignShiftTemplate(template.id, sel); onSaved(); }
        catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Btn T={T} kind="ghost" onClick={() => setSel(emps.map((e: any) => e.id))}>Select all</Btn>
        <Btn T={T} kind="ghost" onClick={() => setSel([])}>Deselect all</Btn>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto', border: `1px solid ${T.line}`, borderRadius: T.r }}>
        {emps.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No employees yet.</div>}
        {emps.map((e: any, i: number) => (
          <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderTop: i ? `1px solid ${T.line}` : 'none', cursor: 'pointer' }}>
            <input type="checkbox" checked={sel.includes(e.id)} onChange={() => toggle(e.id)} />
            <span style={{ flex: 1, fontSize: 13, color: T.ink }}>{e.name}</span>
            <span style={{ fontSize: 11.5, color: T.inkSub }}>{e.department}</span>
          </label>
        ))}
      </div>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

// Add / edit a holiday. A holiday spans a date range and is either company-wide
// or scoped to one location.
function HolidayModal({ T, locs, holiday, onClose, onSaved }: { T: any; locs: any[]; holiday?: any; onClose: () => void; onSaved: () => void }) {
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

function EmployeeModal({ T, meta, locs, employee, onClose, onSaved }: { T: any; meta: any; locs: any[]; employee?: any; onClose: () => void; onSaved: () => void }) {
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

function LeaveTypesManager({ T, emps, onClose, onSaved }: { T: any; emps: any[]; onClose: () => void; onSaved: () => void }) {
  const [types, setTypes] = useStateHr<any[]>([]);
  const [name, setName] = useStateHr('');
  const [days, setDays] = useStateHr('');
  const [accrues, setAccrues] = useStateHr(false);
  const [paid, setPaid] = useStateHr(true);
  const [ovEmp, setOvEmp] = useStateHr<any>('');
  const [draftDays, setDraftDays] = useStateHr<any>({});
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
  async function add() { if (!name.trim()) return; await run(async () => { await API.hrm.addLeaveType({ name, default_days: Number(days || 0), accrues, paid }); setName(''); setDays(''); setAccrues(false); setPaid(true); }); }
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
            <span style={{ fontSize: 11, color: T.inkSub }}>days/yr</span>
            <input type="number" min={0}
              value={draftDays[t.id] != null ? draftDays[t.id] : t.default_days}
              onChange={e => setDraftDays((d: any) => ({ ...d, [t.id]: e.target.value }))}
              onBlur={e => commitDays(t, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              disabled={!t.paid} style={{ width: 60, padding: '5px 7px', fontSize: 12.5, fontFamily: T.fMono, textAlign: 'right', color: T.ink, background: t.paid ? T.paper : T.paperAlt, border: `1px solid ${T.line}`, borderRadius: 6, outline: 'none' }} />
            <button onClick={() => del(t)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 12, lineHeight: 0 }}><LuX size={12} /></button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 14, display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 120 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>New type</div><TextField T={T} value={name} onChange={setName} placeholder="e.g. Maternity" /></div>
        <div style={{ width: 80 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Days/yr</div><TextField T={T} type="number" value={days} onChange={setDays} placeholder="0" /></div>
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

function LeaveModal({ T, emps, leaveTypes, holidays, onClose, onSaved }: { T: any; emps: any[]; leaveTypes: any[]; holidays: any[]; onClose: () => void; onSaved: () => void }) {
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
  const [f, setF] = useStateHr<any>({ employee_id: (emps[0] || {}).id || '', type: types[0], from: today, to: today, days: 1, reason: '' });
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
    <Modal T={T} title="Apply leave" width={500} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { if (!f.from || !f.to) { setErr('Pick a start and end date.'); return; } if (f.to < f.from) { setErr('End date cannot be before the start date.'); return; } setBusy(true); setErr(null); try { await API.hrm.addLeave(f); onSaved(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : 'Apply'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Employee" full><SelectField T={T} value={String(f.employee_id)} options={emps.map((e: any) => String(e.id))} onChange={v => set('employee_id', /^\d+$/.test(String(v)) ? Number(v) : v)} render={v => (emps.find((e: any) => String(e.id) === v) || {}).name} /></Field>
        <Field T={T} label="Type"><SelectField T={T} value={f.type} options={types} onChange={v => set('type', v)} /></Field>
        <Field T={T} label="Days"><TextField T={T} type="number" value={f.days} onChange={v => set('days', v)} /></Field>
        <Field T={T} label="From"><TextField T={T} type="date" value={f.from} onChange={v => set('from', v)} /></Field>
        <Field T={T} label="To"><TextField T={T} type="date" value={f.to} onChange={v => set('to', v)} /></Field>
        <Field T={T} label="Reason" full><TextField T={T} value={f.reason} onChange={v => set('reason', v)} placeholder="Reason for leave" /></Field>
      </FormGrid>
      {typeBal && paidType && <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: T.r, background: typeBal.balance > 0 ? T.accent.soft : T.amberSoft, color: typeBal.balance > 0 ? T.accent.text : T.amberText, fontSize: 12, lineHeight: 1.5 }}><b>{typeBal.balance}</b> of {typeBal.entitled} {f.type} day(s) available{typeBal.pending ? ` · ${typeBal.pending} pending` : ''}.</div>}
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

function PayrollModal({ T, emps, onClose, onSaved }: { T: any; emps: any[]; onClose: () => void; onSaved: () => void }) {
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

function TodoModal({ T, emps, onClose, onSaved }: { T: any; emps: any[]; onClose: () => void; onSaved: () => void }) {
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

function SwapModal({ T, shifts, emps, onClose, onSaved }: { T: any; shifts: any[]; emps: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useStateHr<any>({ shift_id: (shifts[0] || {}).id || '', to_id: '', reason: '' });
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const shift = shifts.find((s: any) => String(s.id) === String(f.shift_id));
  const others = emps.filter((e: any) => !shift || String(e.id) !== String(shift.employee_id));
  return (
    <Modal T={T} title="Request shift swap" subtitle="Hand a shift to a colleague" width={500} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { if (!f.shift_id || !f.to_id) { setErr('Pick a shift and a colleague.'); return; } setBusy(true); setErr(null); try { await API.hrm.addSwap(f); onSaved(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : 'Request swap'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Shift" full><SelectField T={T} value={String(f.shift_id)} options={shifts.map((s: any) => String(s.id))} onChange={v => set('shift_id', /^\d+$/.test(String(v)) ? Number(v) : v)} render={v => { const s = shifts.find((x: any) => String(x.id) === v); return s ? `${s.employee_name} · ${s.date} ${s.start}–${s.end}` : '—'; }} /></Field>
        <Field T={T} label="Swap to" full><SelectField T={T} value={String(f.to_id)} options={['', ...others.map((e: any) => String(e.id))]} onChange={v => set('to_id', v ? (/^\d+$/.test(String(v)) ? Number(v) : v) : '')} render={v => v ? (others.find((e: any) => String(e.id) === v) || {}).name : 'Select colleague…'} /></Field>
        <Field T={T} label="Reason" full><TextField T={T} value={f.reason} onChange={v => set('reason', v)} placeholder="Why the swap?" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

function PayslipSettings({ T, onClose, onSaved }: { T: any; onClose: () => void; onSaved: () => void }) {
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

function ShiftModal({ T, emps, locs, onClose, onSaved }: { T: any; emps: any[]; locs: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useStateHr<any>({ employee_id: (emps[0] || {}).id || '', location_id: (locs[0] || {}).id || 1, date: todayLocal(), start: '08:00', end: '16:00', role: '' });
  const [busy, setBusy] = useStateHr(false);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  return (
    <Modal T={T} title="Add shift" subtitle="Schedule a roster slot" width={520} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { if (!f.employee_id) return; setBusy(true); try { await API.hrm.addShift(f); onSaved(); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : 'Add shift'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Employee" full><SelectField T={T} value={String(f.employee_id)} options={emps.map((e: any) => String(e.id))} onChange={v => set('employee_id', /^\d+$/.test(String(v)) ? Number(v) : v)} render={v => (emps.find((e: any) => String(e.id) === v) || {}).name} /></Field>
        <Field T={T} label="Date"><TextField T={T} type="date" value={f.date} onChange={v => set('date', v)} /></Field>
        <Field T={T} label="Location"><SelectField T={T} value={String(f.location_id)} options={locs.map(l => String(l.id))} onChange={v => set('location_id', /^\d+$/.test(String(v)) ? Number(v) : v)} render={v => (locs.find(l => String(l.id) === v) || {}).name} /></Field>
        <Field T={T} label="Start"><TextField T={T} type="time" value={f.start} onChange={v => set('start', v)} /></Field>
        <Field T={T} label="End"><TextField T={T} type="time" value={f.end} onChange={v => set('end', v)} /></Field>
        <Field T={T} label="Role" full><TextField T={T} value={f.role} onChange={v => set('role', v)} placeholder="e.g. Cashier" /></Field>
      </FormGrid>
    </Modal>
  );
}

function EmployeeProfile({ T, profile: p, onClose }: { T: any; profile: any; onClose: () => void }) {
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

function AdvanceModal({ T, emps, onClose, onSaved }: { T: any; emps: any[]; onClose: () => void; onSaved: () => void }) {
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

function AttendanceSettings({ T, onClose, onSaved }: { T: any; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useStateHr<any>(null);
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  React.useEffect(() => { API.hrm.settings().then(setS).catch(() => {}); }, []);
  if (!s) return null;
  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));
  async function save() {
    setBusy(true); setErr(null);
    try {
      await API.hrm.saveSettings({
        work_start: s.work_start, grace_minutes: Number(s.grace_minutes),
        standard_hours: Number(s.standard_hours), half_day_hours: Number(s.half_day_hours),
      });
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="Attendance settings" subtitle="Work start and grace time" width={560} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Work start time" hint="Default for shifts that set no start of their own"><TextField T={T} type="time" value={s.work_start} onChange={v => set('work_start', v)} /></Field>
        <Field T={T} label="Grace minutes" hint="Late only after this many minutes past start"><TextField T={T} type="number" value={s.grace_minutes} onChange={v => set('grace_minutes', v)} /></Field>
        <Field T={T} label="Standard hours / day"><TextField T={T} type="number" value={s.standard_hours} onChange={v => set('standard_hours', v)} /></Field>
        <Field T={T} label="Half-day hours"><TextField T={T} type="number" value={s.half_day_hours} onChange={v => set('half_day_hours', v)} /></Field>
      </FormGrid>
      {/* Shifts are named templates now, managed from the Attendance tab, so
          fixed/flexible and the hours live there rather than per employee. */}
      <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}`, fontSize: 12, color: T.inkMid, lineHeight: 1.5 }}>
        Shift hours, weekly off days and who works them are set on each shift under <b>Shifts</b> on this tab.
      </div>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

function hrInitials(name: any) { const p = String(name || '').trim().split(/\s+/); return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')) || '?'; }
function hrAvatar(T: any, name: any, size: number): React.CSSProperties {
  const palette = ['#C8843C', '#3E7CB1', '#5B8A4C', '#A8557C', '#4D8B8B', '#B5793F'];
  let h = 0; for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return { width: size, height: size, flexShrink: 0, borderRadius: '50%', background: palette[h % palette.length], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fBody, fontSize: size * 0.4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' };
}

function OrgAdder({ T, kind, onAdded, show }: { T: any; kind: any; onAdded: () => void; show: (m: any) => void }) {
  const [v, setV] = useStateHr('');
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
      <input value={v} onChange={e => setV(e.target.value)} placeholder={kind === 'designation' ? 'New designation…' : 'New department…'} style={{ flex: 1, padding: '8px 10px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none' }} />
      <Btn T={T} kind="accent" onClick={() => { if (!v.trim()) return; API.hrm.addOrg(kind, v.trim()).then(() => { setV(''); onAdded(); }).catch((e: any) => show(e.message)); }}>Add</Btn>
    </div>
  );
}

function OrgModal({ T, onClose, onSaved }: { T: any; onClose: () => void; onSaved: () => void }) {
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

function hrFilterSel(T: any): React.CSSProperties { return { padding: '8px 11px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', cursor: 'pointer' }; }
function hrMini(T: any, kind?: any): React.CSSProperties { const danger = kind === true, accent = kind === 'accent'; return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${accent ? T.accent.base : danger ? T.redSoft : T.line}`, background: accent ? T.accent.base : danger ? T.redSoft : T.paper, color: accent ? T.accent.on : danger ? T.redText : T.inkMid }; }
