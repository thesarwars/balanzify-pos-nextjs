'use client';
// Sales commission agent editor — prefix, name, contact, address, commission %.
import React from 'react';
import { Btn, Modal, Field, TextField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';

export function AgentEditor({ T, agent, onClose, onSaved }: { T: any; agent: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!agent.id;
  const [f, setF] = React.useState<any>({
    prefix: agent.prefix || '', first_name: agent.first_name || '', last_name: agent.last_name || '',
    email: agent.email || '', phone: agent.phone || '', address: agent.address || '',
    commission_percent: agent.commission_percent != null && agent.commission_percent !== '' ? String(agent.commission_percent) : '',
  });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<any>(null);
  const set = (k: any, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.first_name.trim()) { setErr('First name is required.'); return; }
    setBusy(true); setErr(null);
    try {
      if (editing) await API.commissionAgent.update(agent.id, f); else await API.commissionAgent.create(f);
      onSaved();
    } catch (ex: any) { setErr(ex.message || 'Could not save the agent.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title={editing ? 'Edit commission agent' : 'Add sales commission agent'} subtitle="Earns a percentage on sales they broker" width={560} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add agent'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Prefix"><TextField T={T} value={f.prefix} onChange={(v: any) => set('prefix', v)} placeholder="Mr / Mrs" /></Field>
        <Field T={T} label="First name"><TextField T={T} value={f.first_name} onChange={(v: any) => set('first_name', v)} placeholder="First name" /></Field>
        <Field T={T} label="Last name"><TextField T={T} value={f.last_name} onChange={(v: any) => set('last_name', v)} placeholder="Last name" /></Field>
        <Field T={T} label="Email"><TextField T={T} type="email" value={f.email} onChange={(v: any) => set('email', v)} placeholder="agent@business.com" /></Field>
        <Field T={T} label="Contact number"><TextField T={T} value={f.phone} onChange={(v: any) => set('phone', v)} placeholder="+252 …" /></Field>
        <Field T={T} label="Sales commission (%)"><TextField T={T} type="number" value={f.commission_percent} onChange={(v: any) => set('commission_percent', v)} placeholder="e.g. 2.5" /></Field>
        <Field T={T} label="Address" full>
          <textarea value={f.address} onChange={e => set('address', e.target.value)} placeholder="Address" rows={2}
            style={{ width: '100%', padding: '10px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
        </Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
    </Modal>
  );
}
