'use client';
/**
 * HRM — shift templates and their rosters, manual attendance entry, bulk
 * import, and the attendance settings.
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
import { DOW, IMPORT_COLS } from './shared';

// A named, reusable shift. A flexible shift keeps no fixed times, so the time
// inputs disappear rather than sitting there holding stale values.
export function ShiftTemplateModal({ T, template, onClose, onSaved }: { T: any; template?: any; onClose: () => void; onSaved: () => void }) {
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
export function ShiftAssignModal({ T, emps, template, onClose, onSaved }: { T: any; emps: any[]; template: any; onClose: () => void; onSaved: () => void }) {
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

// Admin-entered attendance, upserted on (employee, date) — the reference's
// "Add latest attendance" row.
export function AttendanceEntryModal({ T, emps, templates, record, onClose, onSaved }: { T: any; emps: any[]; templates: any[]; record?: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!record;
  const [f, setF] = useStateHr<any>(editing
    ? { employee_id: record.employee_id, date: record.date, clock_in: record.clock_in || '', clock_out: record.clock_out || '', shift_id: record.shift_id || '', ip_address: record.ip_address || '', clock_in_note: record.clock_in_note || '', clock_out_note: record.clock_out_note || '' }
    : { employee_id: (emps[0] || {}).id || '', date: todayLocal(), clock_in: '', clock_out: '', shift_id: '', ip_address: '', clock_in_note: '', clock_out_note: '' });
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  return (
    <Modal T={T} title={editing ? `Edit attendance — ${record.employee_name}` : 'Add latest attendance'} width={620} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={async () => {
        if (!f.employee_id) { setErr('Pick an employee.'); return; }
        if (!f.date) { setErr('Pick a date.'); return; }
        setBusy(true); setErr(null);
        try { await API.hrm.saveAttendanceEntry(f); onSaved(); }
        catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Employee" full>
          <SelectField T={T} value={String(f.employee_id)} options={emps.map((e: any) => String(e.id))}
            onChange={v => set('employee_id', v)} render={(v: any) => (emps.find((e: any) => String(e.id) === v) || {}).name} />
        </Field>
        <Field T={T} label="Date"><TextField T={T} type="date" value={f.date} onChange={v => set('date', v)} /></Field>
        <Field T={T} label="Shift" hint="Blank uses the employee's own shift">
          <SelectField T={T} value={String(f.shift_id)} options={['', ...templates.map((t: any) => String(t.id))]}
            onChange={v => set('shift_id', v)}
            render={(v: any) => v === '' ? "Employee's shift" : (templates.find((t: any) => String(t.id) === v) || {}).name || v} />
        </Field>
        <Field T={T} label="Clock in time"><TextField T={T} type="time" value={f.clock_in} onChange={v => set('clock_in', v)} /></Field>
        <Field T={T} label="Clock out time"><TextField T={T} type="time" value={f.clock_out} onChange={v => set('clock_out', v)} /></Field>
        <Field T={T} label="IP address" full><TextField T={T} value={f.ip_address} onChange={v => set('ip_address', v)} placeholder="Optional" /></Field>
        <Field T={T} label="Clock in note"><TextField T={T} value={f.clock_in_note} onChange={v => set('clock_in_note', v)} placeholder="Optional" /></Field>
        <Field T={T} label="Clock out note"><TextField T={T} value={f.clock_out_note} onChange={v => set('clock_out_note', v)} placeholder="Optional" /></Field>
      </FormGrid>
      <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}`, fontSize: 12, color: T.inkMid, lineHeight: 1.5 }}>
        Leaving clock in blank records the day as absent. Late is judged against the shift's start time.
      </div>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
    </Modal>
  );
}

export function AttendanceImport({ T, onDone, show }: { T: any; onDone: () => void; show: (m: any) => void }) {
  const [rows, setRows] = useStateHr<any[]>([]);
  const [fileName, setFileName] = useStateHr('');
  const [result, setResult] = useStateHr<any>(null);
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);

  // Minimal CSV reader: handles quoted fields and embedded commas, which is all
  // the template needs. A header row is detected and skipped.
  function parseCsv(text: string) {
    const out: string[][] = [];
    let row: string[] = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); out.push(row); }
    return out.filter(r => r.some(x => String(x).trim()));
  }

  function onFile(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setErr(null); setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const grid = parseCsv(String(reader.result || ''));
        if (!grid.length) { setErr('That file has no rows.'); setRows([]); return; }
        const first = grid[0].map(c => c.trim().toLowerCase());
        const body = first[0].includes('email') ? grid.slice(1) : grid;
        setRows(body.map(r => ({
          email: (r[0] || '').trim(), clock_in_time: (r[1] || '').trim(),
          clock_out_time: (r[2] || '').trim() || undefined,
          clock_in_note: (r[3] || '').trim() || undefined,
          clock_out_note: (r[4] || '').trim() || undefined,
          ip_address: (r[5] || '').trim() || undefined,
        })));
      } catch { setErr('Could not read that file.'); setRows([]); }
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const csv = 'Email,Clock in time,Clock out time,Clock in note,Clock out note,IP Address\n'
      + 'staff@example.com,2026-07-29 08:00:00,2026-07-29 17:00:00,,,\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'attendance-template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel T={T} title="Import attendance">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', borderRadius: T.r, border: `1px solid ${T.line}`, background: T.paper, cursor: 'pointer', fontSize: 12.5, color: T.inkMid }}>
          <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          Choose file
        </label>
        <span style={{ fontSize: 12.5, color: T.inkSub }}>{fileName || 'No file chosen'}{rows.length ? ` · ${rows.length} row(s)` : ''}</span>
        <Btn T={T} kind="accent" disabled={busy || !rows.length} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const r = await API.hrm.importAttendance(rows);
            setResult(r);
            show(`Imported ${r.imported} row(s)${r.failed ? `, ${r.failed} failed` : ''}`);
            if (r.failed === 0) onDone();
          } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
        }}>{busy ? 'Importing…' : 'Submit'}</Btn>
        <Btn T={T} kind="ghost" onClick={downloadTemplate}>Download template file</Btn>
      </div>

      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}

      {result && result.errors?.length > 0 && (
        <div style={{ marginTop: 14, border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
          <div style={{ padding: '9px 13px', background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 600 }}>{result.failed} row(s) could not be imported</div>
          {result.errors.map((e: any, i: number) => (
            <div key={i} style={{ padding: '8px 13px', borderTop: `1px solid ${T.line}`, fontSize: 12, color: T.inkMid }}>
              Line {e.line} · <span style={{ fontFamily: T.fMono }}>{e.email}</span> — {e.error}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: T.paperAlt }}>{['Column number', 'Column name', '', 'Instruction'].map((h, i) => (
            <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, borderBottom: `1px solid ${T.line}` }}>{h}</th>))}</tr></thead>
          <tbody>
            {IMPORT_COLS.map(([num, name, req, instr]) => (
              <tr key={num}>
                <td style={{ padding: '9px 14px', borderTop: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{num}</td>
                <td style={{ padding: '9px 14px', borderTop: `1px solid ${T.line}`, fontSize: 12.5, fontWeight: 600, color: T.ink }}>{name}</td>
                <td style={{ padding: '9px 14px', borderTop: `1px solid ${T.line}`, fontSize: 11.5, color: req === 'Required' ? T.redText : T.inkMute }}>({req})</td>
                <td style={{ padding: '9px 14px', borderTop: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub }}>{instr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function SwapModal({ T, shifts, emps, onClose, onSaved }: { T: any; shifts: any[]; emps: any[]; onClose: () => void; onSaved: () => void }) {
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

export function ShiftModal({ T, emps, locs, onClose, onSaved }: { T: any; emps: any[]; locs: any[]; onClose: () => void; onSaved: () => void }) {
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

export function AttendanceSettings({ T, onClose, onSaved }: { T: any; onClose: () => void; onSaved: () => void }) {
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
