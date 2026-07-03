'use client';
// ─────────────────────────────────────────────────────────────────
// Role editor — a dedicated page (the permission list is large).
// Role name, access locations, and the grouped permission catalog
// with per-group select-all. Predefined roles open read-only.
// Reached from Users ▸ Roles as /role-editor[?id=<roleId>].
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { useRouter } from 'next/navigation';
import type { Theme } from '@/lib/theme';
import { Btn, Badge, Panel, TextField, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

export function RoleEditorPage({ T }: { T: Theme }) {
  const router = useRouter();
  const [roleId, setRoleId] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [groups, setGroups] = React.useState<any[]>([]);
  const [locs, setLocs] = React.useState<any[]>([]);
  const [name, setName] = React.useState('');
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [allLoc, setAllLoc] = React.useState(true);
  const [locSel, setLocSel] = React.useState<string[]>([]);
  const [predefined, setPredefined] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<any>(null);
  const [toast, toastNode] = useToast();

  React.useEffect(() => {
    const id = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null;
    setRoleId(id);
    Promise.all([
      API.permissions.list().catch(() => []),
      API.location.list().catch(() => []),
      id ? API.role.get(id).catch(() => null) : Promise.resolve(null),
    ]).then(([gs, ls, role]: any) => {
      setGroups(Array.isArray(gs) ? gs : []);
      setLocs(Array.isArray(ls) ? ls : []);
      if (role) {
        setName(role.name || '');
        setSel(new Set(role.permissions || []));
        setPredefined(!!role.is_default);
        const ids = Array.isArray(role.location_ids) ? role.location_ids : [];
        setAllLoc(!ids.length);
        setLocSel(ids);
      }
      setLoaded(true);
    });
  }, []);

  const allKeys = groups.flatMap((g: any) => (g.perms || []).map((p: any) => p.key));
  const toggle = (k: string) => { if (predefined) return; setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); };
  const toggleGroup = (g: any) => {
    if (predefined) return;
    setSel((s) => {
      const n = new Set(s);
      const keys = (g.perms || []).map((p: any) => p.key);
      const allOn = keys.every((k: string) => n.has(k));
      keys.forEach((k: string) => (allOn ? n.delete(k) : n.add(k)));
      return n;
    });
  };
  const toggleLoc = (id: string) => { if (predefined) return; setLocSel((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])); };

  async function save() {
    if (!name.trim()) { setErr('Role name is required.'); return; }
    setBusy(true); setErr(null);
    const body = { name: name.trim(), permissions: [...sel], location_access: allLoc ? 'all' : locSel };
    try {
      if (roleId) await API.role.update(roleId, body);
      else await API.role.create(body);
      toast(roleId ? 'Role updated' : 'Role created');
      setTimeout(() => router.push('/users?tab=roles'), 350);
    } catch (ex: any) { setErr(ex.message || 'Could not save the role.'); setBusy(false); }
  }

  const checkbox = (on: boolean, onClick: () => void, label: string, key: string, bold = false) => (
    <label key={key} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: predefined ? 'default' : 'pointer', fontSize: bold ? 12.5 : 13, fontWeight: bold ? 700 : 500, color: bold ? T.inkSub : T.inkMid, userSelect: 'none' }}>
      <span style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${on ? T.accent.base : T.line}`, background: on ? T.accent.base : T.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800, opacity: predefined ? 0.65 : 1 }}>{on ? '✓' : ''}</span>
      {label}
    </label>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title={roleId ? (predefined ? 'View role' : 'Edit role') : 'New role'} subtitle="Choose what this role can do"
        right={<>
          <Btn T={T} kind="ghost" onClick={() => router.push('/users?tab=roles')}>← Back to users</Btn>
          {!predefined && <Btn T={T} kind="accent" onClick={save} disabled={busy || !loaded}>{busy ? 'Saving…' : roleId ? 'Save changes' : 'Create role'}</Btn>}
        </>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!loaded ? <div style={{ padding: 60, textAlign: 'center', color: T.inkSub, fontSize: 13 }}>Loading permissions…</div> : <>

          <Panel T={T} title="Role">
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Role name</div>
                <TextField T={T} value={name} onChange={setName} placeholder="e.g. Sales" disabled={predefined} />
              </div>
              {predefined && <Badge T={T} tone="brass">Predefined — read only</Badge>}
              <div style={{ fontSize: 12.5, color: T.inkSub, paddingBottom: 10, fontFamily: T.fMono }}>{sel.size} of {allKeys.length} permissions</div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 8 }}>Access locations</div>
              {checkbox(allLoc, () => !predefined && setAllLoc(!allLoc), 'All locations', '_all_loc')}
              {!allLoc && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingLeft: 26 }}>
                  {locs.map((l: any) => (
                    <button key={l.id} onClick={() => toggleLoc(l.id)} style={{ padding: '6px 12px', borderRadius: 99, cursor: predefined ? 'default' : 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: 600, background: locSel.includes(l.id) ? T.accent.soft : T.paper, border: `1.5px solid ${locSel.includes(l.id) ? T.accent.base : T.line}`, color: locSel.includes(l.id) ? T.accent.text : T.inkMid }}>{l.name}</button>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          {groups.map((g: any) => {
            const keys = (g.perms || []).map((p: any) => p.key);
            const onCount = keys.filter((k: string) => sel.has(k)).length;
            const allOn = onCount === keys.length && keys.length > 0;
            return (
              <Panel T={T} key={g.group} title={g.group} pad={false}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: `1px solid ${T.line}`, background: T.paperAlt }}>
                  {checkbox(allOn, () => toggleGroup(g), 'Select all', g.group + '_all', true)}
                  <span style={{ fontSize: 11.5, color: T.inkSub, fontFamily: T.fMono }}>{onCount}/{keys.length}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, padding: 18 }}>
                  {(g.perms || []).map((p: any) => checkbox(sel.has(p.key), () => toggle(p.key), p.label, p.key))}
                </div>
              </Panel>
            );
          })}

          {err && <div style={{ padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
          {!predefined && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingBottom: 20 }}>
              <Btn T={T} kind="ghost" onClick={() => router.push('/users?tab=roles')}>Cancel</Btn>
              <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : roleId ? 'Save changes' : 'Create role'}</Btn>
            </div>
          )}
          </>}
        </div>
      </div>
      {toastNode}
    </div>
  );
}
