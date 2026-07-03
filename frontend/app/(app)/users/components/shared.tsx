'use client';
// Shared bits for the User Management screens (users / roles / agents).
import React from 'react';

// Login roles — the fixed access tiers a user signs in with (separate from the
// custom permission roles managed on the Roles tab / role-editor page).
export const LOGIN_ROLES = [
  { id: 1, name: 'Owner' },
  { id: 2, name: 'Manager' },
  { id: 3, name: 'Cashier' },
  { id: 4, name: 'Warehouse' },
];

export function URToggle({ T, on, onChange, label, hint }: { T: any; on: any; onChange: (v: any) => void; label: any; hint: any }) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
      <span style={{ width: 40, height: 23, borderRadius: 99, background: on ? T.accent.base : T.lineMid, position: 'relative', flexShrink: 0, transition: 'background .18s' }}>
        <span style={{ position: 'absolute', top: 2.5, left: on ? 19 : 2.5, width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
      </span>
      <span><span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.inkMid }}>{label}</span><span style={{ display: 'block', fontSize: 10.5, color: T.inkSub }}>{hint}</span></span>
    </button>
  );
}

export function urMini(T: any, danger?: any): React.CSSProperties {
  return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${danger ? T.redSoft : T.line}`, background: danger ? T.redSoft : T.paper, color: danger ? T.redText : T.inkMid };
}
