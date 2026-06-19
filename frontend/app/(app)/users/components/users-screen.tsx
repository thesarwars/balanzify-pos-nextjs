'use client';
// ─────────────────────────────────────────────────────────────────
// Users & Roles — the manual's User Management + Role Management.
// Users: role, location access, commission %, max sales discount,
// is-active, disable-login. Roles: permission matrix + location
// access, with Admin/Cashier defaults and the delete guard.
// Wired through API.user / API.role / API.permissions / API.location.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useStateUR, useEffect: useEffectUR } = React;

export function UsersRoles({ T }: { T: any }) {
  const [tab, setTab] = useStateUR('users');
  const [users, setUsers] = useStateUR<any[]>([]);
  const [roles, setRoles] = useStateUR<any[]>([]);
  const [perms, setPerms] = useStateUR<any[]>([]);
  const [locs, setLocs] = useStateUR<any[]>([]);
  const [loading, setLoading] = useStateUR(true);
  const [editUser, setEditUser] = useStateUR<any>(null);
  const [editRole, setEditRole] = useStateUR<any>(null);
  const [confirm, setConfirm] = useStateUR<any>(null);   // {kind, item}
  const [toast, toastNode] = useToast();

  const reloadUsers = React.useCallback(() => API.user.list().then(setUsers).catch(() => {}), []);
  const reloadRoles = React.useCallback(() => API.role.list().then(setRoles).catch(() => {}), []);
  useEffectUR(() => {
    Promise.all([API.user.list(), API.role.list(), API.permissions.list(), API.location.list()])
      .then(([u, r, p, l]: any) => { setUsers(u); setRoles(r); setPerms(p); setLocs(l); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function del(kind: any, item: any) {
    try {
      if (kind === 'user') await API.user.remove(item.id, item); else await API.role.remove(item.id);
      setConfirm(null); toast(kind === 'user' ? 'User deleted' : 'Role deleted');
      kind === 'user' ? reloadUsers() : reloadRoles();
    } catch (ex: any) { setConfirm(null); toast(ex.message || 'Delete failed'); }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="User Management" subtitle="Team members, roles & permissions"
        right={tab === 'users'
          ? <Btn T={T} kind="accent" onClick={() => setEditUser({})}>+ Add User</Btn>
          : <Btn T={T} kind="accent" onClick={() => setEditRole({ permissions: [], location_access: 'all' })}>+ Add Role</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {/* tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
            {[['users', 'Users', users.length], ['roles', 'Roles', roles.length]].map(([id, lbl, n]: any) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl} <span style={{ opacity: 0.7 }}>· {n}</span></button>
            ))}
          </div>

          {tab === 'users' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['User', 'l'], ['Username', 'l'], ['Role', 'l'], ['Locations', 'l'], ['Max disc.', 'r'], ['Status', 'r'], ['', 'r']].map(([h, a]: any, i: number) => (
                  <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr key={u.id} style={{ transition: 'background .12s' }} onMouseEnter={(e: any) => e.currentTarget.style.background = T.paperAlt} onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: T.navyLight, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>{u.name.split(' ').map((w: any) => w[0]).slice(0, 2).join('')}</span>
                          <div><div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{u.name}</div><div style={{ fontSize: 11, color: T.inkSub }}>{u.email || '—'}</div></div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{u.username}{!u.allow_login && <Badge T={T} tone="gray" style={{ marginLeft: 6 }}>no login</Badge>}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={u.role_name === 'Admin' ? 'brass' : u.role_name === 'Cashier' ? 'blue' : 'violet'}>{u.role_name}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkMid, maxWidth: 220 }}>{u.locations}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{u.max_discount == null ? '—' : u.max_discount + '%'}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}><Badge T={T} tone={u.is_active ? 'green' : 'gray'}>{u.is_active ? 'Active' : 'Inactive'}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                        <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => setEditUser(u)} style={urMini(T)}>Edit</button>
                          <button onClick={() => setConfirm({ kind: 'user', item: u })} style={urMini(T, true)}>Delete</button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>GET /connector/api/user…</div>}
            </Panel>
          )}

          {tab === 'roles' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {roles.map((r: any) => (
                <div key={r.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, boxShadow: T.sh1, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontFamily: T.fDisplay, fontSize: 18, fontWeight: T.dispWeight, color: T.ink }}>{r.name}</div>
                      {r.is_default && <Badge T={T} tone="gray">Default</Badge>}
                    </div>
                    <span style={{ width: 38, height: 38, borderRadius: 10, background: r.name === 'Admin' ? T.accent.soft : T.paperAlt, color: r.name === 'Admin' ? T.accent.text : T.inkMid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{r.name === 'Admin' ? '★' : r.name === 'Cashier' ? '◎' : '◆'}</span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.inkSub, marginBottom: 5 }}><span>Permissions</span><span style={{ fontFamily: T.fMono, color: T.ink }}>{r.permission_count}/{r.total_permissions}</span></div>
                    <div style={{ height: 6, background: T.paperSink, borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: Math.round((r.permission_count / r.total_permissions) * 100) + '%', background: T.accent.base }} /></div>
                  </div>
                  <div style={{ fontSize: 12, color: T.inkSub }}>{r.user_count} user{r.user_count === 1 ? '' : 's'} assigned</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <Btn T={T} kind="ghost" style={{ flex: 1 }} onClick={() => setEditRole(r)} disabled={r.name === 'Admin'}>{r.name === 'Admin' ? 'All access' : 'Edit'}</Btn>
                    {!r.is_default && <Btn T={T} kind="ghost" onClick={() => setConfirm({ kind: 'role', item: r })} style={{ color: T.redText }}>🗑</Btn>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editUser && <UserEditor T={T} user={editUser} roles={roles} locs={locs} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); toast(editUser.id ? 'User updated' : 'User created'); reloadUsers(); }} />}
      {editRole && <RoleEditor T={T} role={editRole} perms={perms} locs={locs} onClose={() => setEditRole(null)} onSaved={() => { setEditRole(null); toast(editRole.id ? 'Role updated' : 'Role created'); reloadRoles(); reloadUsers(); }} />}
      {confirm && (
        <Modal T={T} title={`Delete ${confirm.kind}?`} subtitle={confirm.item.name} width={420} onClose={() => setConfirm(null)} onSave={() => del(confirm.kind, confirm.item)} saveLabel="Delete">
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>{confirm.kind === 'role' ? 'Users on this role must be reassigned first.' : 'This removes the user and their login access.'}</div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}

// ── User editor ─────────────────────────────────────────────────────
function UserEditor({ T, user, roles, locs, onClose, onSaved }: { T: any; user: any; roles: any; locs: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!user.id;
  const [f, setF] = useStateUR<any>({
    name: user.name || '', email: user.email || '', username: user.username || '', password: '',
    role_id: user.role_id || (roles[0] || {}).id || 2,
    allLoc: user.location_access ? user.location_access === 'all' : true,
    location_access: Array.isArray(user.location_access) ? user.location_access : [],
    commission_percent: user.commission_percent || '', max_discount: user.max_discount ?? '',
    pin: '',
    is_active: user.is_active !== false, allow_login: user.allow_login !== false,
  });
  const [busy, setBusy] = useStateUR(false);
  const [err, setErr] = useStateUR<any>(null);
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

// ── Role editor (permission matrix) ─────────────────────────────────
function RoleEditor({ T, role, perms, locs, onClose, onSaved }: { T: any; role: any; perms: any; locs: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!role.id;
  const [name, setName] = useStateUR(role.name || '');
  const [sel, setSel] = useStateUR<any>(null);   // Set of permission keys
  const [allLoc, setAllLoc] = useStateUR(role.location_access ? role.location_access === 'all' : true);
  const [locSel, setLocSel] = useStateUR<any[]>(Array.isArray(role.location_access) ? role.location_access : []);
  const [busy, setBusy] = useStateUR(false);
  const [err, setErr] = useStateUR<any>(null);

  useEffectUR(() => {
    if (editing) API.role.get(role.id).then((r: any) => setSel(new Set(r.permissions))).catch(() => setSel(new Set()));
    else setSel(new Set(role.permissions || []));
  }, []);

  const allKeys = perms.flatMap((g: any) => g.items.map((i: any) => i.key));
  const toggle = (k: any) => setSel((s: any) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleGroup = (g: any) => setSel((s: any) => { const n = new Set(s); const keys = g.items.map((i: any) => i.key); const allOn = keys.every((k: any) => n.has(k)); keys.forEach((k: any) => allOn ? n.delete(k) : n.add(k)); return n; });
  const toggleLoc = (id: any) => setLocSel((l: any) => l.includes(id) ? l.filter((x: any) => x !== id) : [...l, id]);

  async function save() {
    if (!name.trim()) { setErr('Role name is required.'); return; }
    setBusy(true); setErr(null);
    const body = { name, permissions: [...(sel || [])], location_access: allLoc ? 'all' : locSel };
    try { if (editing) await API.role.update(role.id, body); else await API.role.create(body); onSaved(); }
    catch (ex: any) { setErr(ex.message || 'Could not save role.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title={editing ? 'Edit role' : 'New role'} subtitle="Choose what this role can do" width={640} onClose={onClose}
      footer={<><div style={{ flex: 1, fontSize: 12.5, color: T.inkSub, alignSelf: 'center' }}>{sel ? sel.size : 0} of {allKeys.length} permissions</div><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create role'}</Btn></>}>
      <Field T={T} label="Role name" full><TextField T={T} value={name} onChange={setName} placeholder="e.g. Stock Keeper" /></Field>

      <div style={{ marginTop: 18, fontSize: 12, fontWeight: 600, color: T.inkSub, marginBottom: 10 }}>Permissions</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {perms.map((g: any) => {
          const keys = g.items.map((i: any) => i.key);
          const allOn = sel && keys.every((k: any) => sel.has(k));
          const someOn = sel && keys.some((k: any) => sel.has(k));
          return (
            <div key={g.group} style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 13px', background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{g.group}</span>
                <button onClick={() => toggleGroup(g)} style={{ background: 'none', border: 'none', color: T.accent.text, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{allOn ? 'Clear' : 'Select all'}</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
                {g.items.map((it: any) => (
                  <button key={it.key} onClick={() => toggle(it.key)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: 600, background: sel && sel.has(it.key) ? T.accent.soft : T.paper, border: `1.5px solid ${sel && sel.has(it.key) ? T.accent.base : T.line}`, color: sel && sel.has(it.key) ? T.accent.text : T.inkMid }}>
                    <span style={{ fontSize: 11 }}>{sel && sel.has(it.key) ? '✓' : '+'}</span>{it.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.inkSub, marginBottom: 8 }}>Access locations</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.inkMid, cursor: 'pointer', marginBottom: 8 }}>
          <input type="checkbox" checked={allLoc} onChange={(e: any) => setAllLoc(e.target.checked)} style={{ accentColor: T.accent.base, width: 15, height: 15 }} />All locations
        </label>
        {!allLoc && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingLeft: 22 }}>
            {locs.map((l: any) => (
              <button key={l.id} onClick={() => toggleLoc(l.id)} style={{ padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: 600, background: locSel.includes(l.id) ? T.accent.soft : T.paper, border: `1.5px solid ${locSel.includes(l.id) ? T.accent.base : T.line}`, color: locSel.includes(l.id) ? T.accent.text : T.inkMid }}>{l.name}</button>
            ))}
          </div>
        )}
      </div>
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
    </Modal>
  );
}

function URToggle({ T, on, onChange, label, hint }: { T: any; on: any; onChange: (v: any) => void; label: any; hint: any }) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
      <span style={{ width: 40, height: 23, borderRadius: 99, background: on ? T.accent.base : T.lineMid, position: 'relative', flexShrink: 0, transition: 'background .18s' }}>
        <span style={{ position: 'absolute', top: 2.5, left: on ? 19 : 2.5, width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
      </span>
      <span><span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.inkMid }}>{label}</span><span style={{ display: 'block', fontSize: 10.5, color: T.inkSub }}>{hint}</span></span>
    </button>
  );
}
function urMini(T: any, danger?: any): React.CSSProperties {
  return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${danger ? T.redSoft : T.line}`, background: danger ? T.redSoft : T.paper, color: danger ? T.redText : T.inkMid };
}
