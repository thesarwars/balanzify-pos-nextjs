'use client';
// Users tab — team-member table. Editing happens in <UserEditor/>.
import React from 'react';
import { Badge, Panel } from '@/components/kit';
import { urMini } from './shared';

export function UsersTab({ T, users, loading, onEdit, onDelete }: { T: any; users: any[]; loading: boolean; onEdit: (u: any) => void; onDelete: (u: any) => void }) {
  return (
    <Panel T={T} pad={false}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{[['User', 'l'], ['Username', 'l'], ['Role', 'l'], ['Locations', 'l'], ['Max disc.', 'r'], ['Status', 'r'], ['', 'r']].map(([h, a]: any, i: number) => (
          <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
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
              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>{u.max_discount == null ? '—' : u.max_discount + '%'}</td>
              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}><Badge T={T} tone={u.is_active ? 'green' : 'gray'}>{u.is_active ? 'Active' : 'Inactive'}</Badge></td>
              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}>
                <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => onEdit(u)} style={urMini(T)}>Edit</button>
                  <button onClick={() => onDelete(u)} style={urMini(T, true)}>Delete</button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>Loading users…</div>}
    </Panel>
  );
}
