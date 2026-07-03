'use client';
// User editor — team member: login role, location access, commission,
// max discount, till PIN, active / allow-login flags.
import React from 'react';
import { Btn, Modal, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { URToggle } from './shared';

export function UserEditor({ T, user, roles, locs, onClose, onSaved }: { T: any; user: any; roles: any; locs: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!user.id;
  const [f, setF] = React.useState<any>({
    name: user.name || '', email: user.email || '', username: user.username || '', password: '',
    role_id: user.role_id || (roles[0] || {}).id || 2,
    allLoc: user.location_access ? user.location_access === 'all' : true,
    location_access: Array.isArray(user.location_access) ? user.location_access : [],
    commission_percent: user.commission_percent || '', max_discount: user.max_discount ?? '',
    pin: '',
    is_active: user.is_active !== false, allow_login: user.allow_login !== false,
  });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<any>(null);
  const set = (k: any, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const toggleLoc = (id: any) => setF((s: any) => ({ ...s, location_access: s.location_access.includes(id) ? s.location_access.filter((x: any) => x !== id) : [...s.location_access, id] }));

  async function save() {
    setBusy(true); setErr(null);
    const body = { ...f, location_access: f.allLoc ? 'all' : f.location_access };
    try {
      if (editing) await API.user.update(user.id, body); else await API.user.create(body);
      onSaved();
    } catch (ex: any) { setErr(ex.message || 'Could not save user.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title={editing ? 'Edit user' : 'New user'} subtitle={editing ? '@' + user.username : 'Add a team member'} width={640} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create user'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Full name" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="User's name" /></Field>
        <Field T={T} label="Email"><TextField T={T} type="email" value={f.email} onChange={(v: any) => set('email', v)} placeholder="user@business.com" /></Field>
        <Field T={T} label="Role"><SelectField T={T} value={String(f.role_id)} options={roles.map((r: any) => String(r.id))} onChange={(v: any) => set('role_id', Number(v))} render={(v: any) => (roles.find((r: any) => String(r.id) === v) || {}).name} /></Field>
        <Field T={T} label="Username" hint={editing ? "Username can't be changed." : 'Used to sign in.'}><TextField T={T} value={f.username} onChange={(v: any) => !editing && set('username', v.replace(/\s/g, ''))} placeholder="e.g. bashir" /></Field>
        {!editing && <Field T={T} label="Password"><TextField T={T} type="password" value={f.password} onChange={(v: any) => set('password', v)} placeholder="At least 6 characters" /></Field>}
      </FormGrid>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.inkSub, marginBottom: 8 }}>Location access</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.inkMid, cursor: 'pointer', marginBottom: 8 }}>
          <input type="checkbox" checked={f.allLoc} onChange={(e: any) => set('allLoc', e.target.checked)} style={{ accentColor: T.accent.base, width: 15, height: 15 }} />All locations
        </label>
        {!f.allLoc && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingLeft: 22 }}>
            {locs.map((l: any) => (
              <button key={l.id} onClick={() => toggleLoc(l.id)} style={{ padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: 600, background: f.location_access.includes(l.id) ? T.accent.soft : T.paper, border: `1.5px solid ${f.location_access.includes(l.id) ? T.accent.base : T.line}`, color: f.location_access.includes(l.id) ? T.accent.text : T.inkMid }}>{l.name}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <FormGrid>
          <Field T={T} label="Sales commission %"><TextField T={T} type="number" value={f.commission_percent} onChange={(v: any) => set('commission_percent', v)} placeholder="0" /></Field>
          <Field T={T} label="Max sales discount %" hint="Blank = no limit."><TextField T={T} type="number" value={f.max_discount} onChange={(v: any) => set('max_discount', v)} placeholder="Blank = unlimited" /></Field>
          <Field T={T} label="Till PIN" hint={editing ? '4–10 digits. Blank = keep current.' : '4–10 digits for quick till sign-in.'}><TextField T={T} value={f.pin} onChange={(v: any) => set('pin', String(v).replace(/\D/g, '').slice(0, 10))} placeholder="e.g. 4821" /></Field>
        </FormGrid>
        <div style={{ display: 'flex', gap: 28, marginTop: 14 }}>
          <URToggle T={T} on={f.is_active} onChange={(v: any) => set('is_active', v)} label="Is active" hint="Deactivated users can't be used" />
          <URToggle T={T} on={f.allow_login} onChange={(v: any) => set('allow_login', v)} label="Allow login" hint="Off = record-only, no sign in" />
        </div>
      </div>
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
    </Modal>
  );
}
