'use client';
// Roles tab — permission-role cards. Creating/editing happens on the
// dedicated /role-editor page (the permission list is large).
import React from 'react';
import { useRouter } from 'next/navigation';
import { Btn, Badge } from '@/components/kit';

export function RolesTab({ T, roles, onDelete }: { T: any; roles: any[]; onDelete: (r: any) => void }) {
  const router = useRouter();
  return (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.inkSub, marginBottom: 5 }}><span>Permissions</span><span style={{ fontFamily: T.fMono, color: T.ink }}>{r.permission_count}{r.total_permissions ? `/${r.total_permissions}` : ''}</span></div>
            <div style={{ height: 6, background: T.paperSink, borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: (r.total_permissions ? Math.round((r.permission_count / r.total_permissions) * 100) : 0) + '%', background: T.accent.base }} /></div>
          </div>
          {r.user_count != null && <div style={{ fontSize: 12, color: T.inkSub }}>{r.user_count} user{r.user_count === 1 ? '' : 's'} assigned</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            <Btn T={T} kind="ghost" style={{ flex: 1 }} onClick={() => router.push('/role-editor?id=' + r.id)}>{r.is_default ? 'View' : 'Edit'}</Btn>
            {!r.is_default && <Btn T={T} kind="ghost" onClick={() => onDelete(r)} style={{ color: T.redText }}>🗑</Btn>}
          </div>
        </div>
      ))}
    </div>
  );
}
