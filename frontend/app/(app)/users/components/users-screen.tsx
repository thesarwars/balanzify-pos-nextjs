'use client';
// ─────────────────────────────────────────────────────────────────
// User Management shell — three tabs, each its own component:
//   Users             → users-tab.tsx   (+ user-editor.tsx)
//   Roles             → roles-tab.tsx   (editing on /role-editor)
//   Commission Agents → agents-tab.tsx  (+ agent-editor.tsx)
// The active tab is tracked in the URL (?tab=roles|agents) so refresh,
// back and links from the role editor land on the right tab.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { useRouter } from 'next/navigation';
import { Btn, Modal, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { LOGIN_ROLES } from './shared';
import { UsersTab } from './users-tab';
import { RolesTab } from './roles-tab';
import { AgentsTab } from './agents-tab';
import { UserEditor } from './user-editor';
import { AgentEditor } from './agent-editor';

const { useState: useStateUR, useEffect: useEffectUR } = React;
const TAB_IDS = ['users', 'roles', 'agents'];

export function UsersRoles({ T }: { T: any }) {
  const router = useRouter();
  const [tab, setTab] = useStateUR('users');
  const [users, setUsers] = useStateUR<any[]>([]);
  const [roles, setRoles] = useStateUR<any[]>([]);
  const [agents, setAgents] = useStateUR<any[]>([]);
  const [locs, setLocs] = useStateUR<any[]>([]);
  const [loading, setLoading] = useStateUR(true);
  const [editUser, setEditUser] = useStateUR<any>(null);
  const [editAgent, setEditAgent] = useStateUR<any>(null);
  const [confirm, setConfirm] = useStateUR<any>(null);   // {kind, item}
  const [toast, toastNode] = useToast();

  useEffectUR(() => {
    const t = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
    if (t && TAB_IDS.includes(t)) setTab(t);
  }, []);
  const switchTab = (id: string) => { setTab(id); router.replace('/users' + (id === 'users' ? '' : '?tab=' + id), { scroll: false }); };

  const reloadUsers = React.useCallback(() => API.user.list().then(setUsers).catch(() => {}), []);
  const reloadRoles = React.useCallback(() => API.role.list().then(setRoles).catch(() => {}), []);
  const reloadAgents = React.useCallback(() => API.commissionAgent.list().then(setAgents).catch(() => {}), []);
  useEffectUR(() => {
    Promise.all([API.user.list(), API.role.list(), API.commissionAgent.list().catch(() => []), API.location.list()])
      .then(([u, r, a, l]: any) => { setUsers(u); setRoles(r); setAgents(a); setLocs(l); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function del(kind: any, item: any) {
    try {
      if (kind === 'user') await API.user.remove(item.id, item);
      else if (kind === 'agent') await API.commissionAgent.remove(item.id);
      else await API.role.remove(item.id);
      setConfirm(null); toast(kind === 'user' ? 'User deleted' : kind === 'agent' ? 'Agent deleted' : 'Role deleted');
      kind === 'user' ? reloadUsers() : kind === 'agent' ? reloadAgents() : reloadRoles();
    } catch (ex: any) { setConfirm(null); toast(ex.message || 'Delete failed'); }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="User Management" subtitle="Team members, roles & permissions"
        right={tab === 'users'
          ? <Btn T={T} kind="accent" onClick={() => setEditUser({})}>+ Add User</Btn>
          : tab === 'agents'
          ? <Btn T={T} kind="accent" onClick={() => setEditAgent({})}>+ Add Agent</Btn>
          : <Btn T={T} kind="accent" onClick={() => router.push('/role-editor')}>+ Add Role</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
            {[['users', 'Users', users.length], ['roles', 'Roles', roles.length], ['agents', 'Commission Agents', agents.length]].map(([id, lbl, n]: any) => (
              <button key={id} onClick={() => switchTab(id)} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl} <span style={{ opacity: 0.7 }}>· {n}</span></button>
            ))}
          </div>

          {tab === 'users' && <UsersTab T={T} users={users} loading={loading} onEdit={setEditUser} onDelete={(u: any) => setConfirm({ kind: 'user', item: u })} />}
          {tab === 'roles' && <RolesTab T={T} roles={roles} onDelete={(r: any) => setConfirm({ kind: 'role', item: r })} />}
          {tab === 'agents' && <AgentsTab T={T} agents={agents} loading={loading} onEdit={setEditAgent} onDelete={(a: any) => setConfirm({ kind: 'agent', item: a })} />}
        </div>
      </div>

      {editUser && <UserEditor T={T} user={editUser} roles={LOGIN_ROLES} locs={locs} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); toast(editUser.id ? 'User updated' : 'User created'); reloadUsers(); }} />}
      {editAgent && <AgentEditor T={T} agent={editAgent} onClose={() => setEditAgent(null)} onSaved={() => { setEditAgent(null); toast(editAgent.id ? 'Agent updated' : 'Agent added'); reloadAgents(); }} />}
      {confirm && (
        <Modal T={T} title={`Delete ${confirm.kind}?`} subtitle={confirm.item.name} width={420} onClose={() => setConfirm(null)} onSave={() => del(confirm.kind, confirm.item)} saveLabel="Delete">
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>{confirm.kind === 'role' ? 'Users on this role must be reassigned first.' : confirm.kind === 'agent' ? 'This removes the commission agent.' : 'This removes the user and their login access.'}</div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
