'use client';
// Commission Agents tab — agent table. Editing happens in <AgentEditor/>.
import React from 'react';
import { Badge, Panel } from '@/components/kit';
import { urMini } from './shared';

export function AgentsTab({ T, agents, loading, onEdit, onDelete }: { T: any; agents: any[]; loading: boolean; onEdit: (a: any) => void; onDelete: (a: any) => void }) {
  return (
    <Panel T={T} pad={false}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{[['Agent', 'l'], ['Email', 'l'], ['Contact', 'l'], ['Commission %', 'r'], ['Status', 'r'], ['', 'r']].map(([h, a]: any, i: number) => (
          <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
        ))}</tr></thead>
        <tbody>
          {agents.map((a: any) => (
            <tr key={a.id} style={{ transition: 'background .12s' }} onMouseEnter={(e: any) => e.currentTarget.style.background = T.paperAlt} onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}>
              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{a.name}</td>
              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{a.email || '—'}</td>
              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub, fontFamily: T.fMono }}>{a.phone || '—'}</td>
              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.ink } as React.CSSProperties}>{a.commission_percent}%</td>
              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}><Badge T={T} tone={a.is_active ? 'green' : 'gray'}>{a.is_active ? 'Active' : 'Inactive'}</Badge></td>
              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}>
                <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => onEdit(a)} style={urMini(T)}>Edit</button>
                  <button onClick={() => onDelete(a)} style={urMini(T, true)}>Delete</button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && agents.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>No commission agents yet.</div>}
    </Panel>
  );
}
