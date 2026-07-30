'use client';
/**
 * HRM — the Essentials-and-HRM settings tab.
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
import { SETTINGS_SECTIONS } from './shared';

export function HrmSettingsPanel({ T, onSaved }: { T: any; onSaved: () => void }) {
  const [sec, setSec] = useStateHr('Leave');
  const [f, setF] = useStateHr<any>(null);
  const [busy, setBusy] = useStateHr(false); const [err, setErr] = useStateHr<any>(null);
  React.useEffect(() => { API.hrm.settings().then(setF).catch(() => {}); }, []);
  if (!f) return <Panel T={T}><div style={{ padding: 20, fontSize: 13, color: T.inkMute }}>Loading…</div></Panel>;
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    setBusy(true); setErr(null);
    try {
      await API.hrm.saveSettings({
        leave_ref_prefix: f.leave_ref_prefix, leave_instructions: f.leave_instructions,
        payroll_ref_prefix: f.payroll_ref_prefix, payroll_word_format: f.payroll_word_format,
        location_required: !!f.location_required,
        grace_before_checkin: Number(f.grace_before_checkin || 0),
        grace_after_checkin: Number(f.grace_after_checkin || 0),
        grace_before_checkout: Number(f.grace_before_checkout || 0),
        grace_after_checkout: Number(f.grace_after_checkout || 0),
        commission_excludes_tax: !!f.commission_excludes_tax,
        todos_id_prefix: f.todos_id_prefix,
      });
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const hint = (t: string) => <div style={{ fontSize: 11, color: T.inkMute, marginTop: 4 }}>{t}</div>;
  return (
    <Panel T={T} title="Essentials and HRM settings">
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 190 }}>
          {SETTINGS_SECTIONS.map(x => (
            <button key={x} onClick={() => setSec(x)} style={{ padding: '10px 14px', textAlign: 'left', borderRadius: T.r, cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: sec === x ? 700 : 500, border: `1px solid ${sec === x ? T.accent.base : T.line}`, background: sec === x ? T.accent.base : T.paper, color: sec === x ? T.accent.on : T.inkMid }}>{x}</button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 320 }}>
          {sec === 'Leave' && <FormGrid>
            <Field T={T} label="Leave reference no. prefix" full><TextField T={T} value={f.leave_ref_prefix || ''} onChange={v => set('leave_ref_prefix', v)} placeholder="e.g. LV-" /></Field>
            <Field T={T} label="Leave instructions" full>
              <textarea value={f.leave_instructions || ''} onChange={e => set('leave_instructions', e.target.value)} rows={7}
                placeholder="Shown to staff on the leave form"
                style={{ width: '100%', padding: '9px 11px', fontSize: 13, fontFamily: T.fBody, lineHeight: 1.5, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </Field>
          </FormGrid>}

          {sec === 'Payroll' && <FormGrid>
            <Field T={T} label="Payroll reference no. prefix"><TextField T={T} value={f.payroll_ref_prefix || ''} onChange={v => set('payroll_ref_prefix', v)} placeholder="e.g. PR-" /></Field>
            <Field T={T} label="Payroll print word format">
              <SelectField T={T} value={f.payroll_word_format || 'international'} options={['international', 'somaliland']}
                onChange={v => set('payroll_word_format', v)}
                render={(v: any) => v === 'international' ? 'International' : 'Somaliland'} />
            </Field>
            <Field T={T} label="" full>{hint('How the net amount is spelled out in words on a printed payslip.')}</Field>
          </FormGrid>}

          {sec === 'Attendance' && <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12.5, color: T.inkMid, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!f.location_required} onChange={e => set('location_required', e.target.checked)} />
              Is location required? — capture where a clock-in happened
            </label>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 8 }}>Grace time</div>
            <FormGrid>
              <Field T={T} label="Grace before check-in"><TextField T={T} type="number" value={f.grace_before_checkin ?? 0} onChange={v => set('grace_before_checkin', v)} />{hint('In minutes. Not counted as overtime.')}</Field>
              <Field T={T} label="Grace after check-in"><TextField T={T} type="number" value={f.grace_after_checkin ?? 0} onChange={v => set('grace_after_checkin', v)} />{hint('In minutes. Not counted as late.')}</Field>
              <Field T={T} label="Grace before check-out"><TextField T={T} type="number" value={f.grace_before_checkout ?? 0} onChange={v => set('grace_before_checkout', v)} />{hint('In minutes. Not counted as leaving early.')}</Field>
              <Field T={T} label="Grace after check-out"><TextField T={T} type="number" value={f.grace_after_checkout ?? 0} onChange={v => set('grace_after_checkout', v)} />{hint('In minutes. Not counted as overtime.')}</Field>
            </FormGrid>
            <div style={{ marginTop: 14, padding: '9px 13px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}`, fontSize: 12, color: T.inkMid, lineHeight: 1.5 }}>
              Who may enter their own attendance is a role permission, not a setting here.
            </div>
          </>}

          {sec === 'Sales Targets' && <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.inkMid, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!f.commission_excludes_tax} onChange={e => set('commission_excludes_tax', e.target.checked)} />
              Calculate sales target commission without tax
            </label>
            {hint('Commission is priced on the employee\'s sales net of tax rather than the gross total.')}
          </>}

          {sec === 'Essentials' && <FormGrid>
            <Field T={T} label="Todos ID prefix" full><TextField T={T} value={f.todos_id_prefix || ''} onChange={v => set('todos_id_prefix', v)} placeholder="e.g. TD-" /></Field>
          </FormGrid>}

          {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}><LuTriangleAlert size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{err}</div>}
          <div style={{ marginTop: 18 }}><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Update'}</Btn></div>
        </div>
      </div>
    </Panel>
  );
}
