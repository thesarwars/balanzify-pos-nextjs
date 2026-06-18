'use client';
// ─────────────────────────────────────────────────────────────────
// Hotel — room-grid landing screen (KPI strip + room status grid).
// Static mockup vertical; colocated under its route.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Badge, Panel } from '@/components/kit';
import { Topbar } from '@/components/shell';

function VerticalShell({ T, title, subtitle, action, kpis, children }: any) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title={title} subtitle={subtitle} right={action && <Btn T={T} kind="accent">{action}</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpis.length}, 1fr)`, gap: 14, marginBottom: 18 }}>
            {kpis.map(([label, value, sub, accent]: any, i: number) => (
              <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '16px 18px', boxShadow: T.sh1, position: 'relative', overflow: 'hidden' }}>
                {accent && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent }} />}
                <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>{label}</div>
                <div style={{ fontFamily: T.fMono, fontWeight: 500, fontSize: 25, color: T.ink, marginTop: 7, letterSpacing: '-0.8px' }}>{value}</div>
                {sub && <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 6 }}>{sub}</div>}
              </div>
            ))}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// Hotel — room grid
export function Hotel({ T }: { T: Theme }) {
  const rooms = Array.from({ length: 24 }).map((_, i) => {
    // Deterministic pattern (not Math.random) to avoid SSR/client hydration mismatch.
    const r = ((i * 2654435761) % 100) / 100;
    const status = r < 0.5 ? 'occupied' : r < 0.7 ? 'available' : r < 0.85 ? 'cleaning' : 'reserved';
    return { no: (101 + i + (i >= 12 ? 88 : 0)), status, type: i % 4 === 0 ? 'Suite' : i % 3 === 0 ? 'Double' : 'Single' };
  });
  const tone: any = { occupied: ['#FBE3E1', '#961717', 'Occupied'], available: ['#D8F3E6', '#066043', 'Available'], cleaning: ['#FCEFD3', '#8A4B08', 'Cleaning'], reserved: ['#DEE9FD', '#1A45B0', 'Reserved'] };
  return (
    <VerticalShell T={T} title="Hotel" subtitle="Maka Suites · 24 rooms" action="+ New Booking"
      kpis={[['Occupancy', '67%', '16 of 24 rooms', T.accent.base], ['ADR', money(38), 'avg daily rate', T.green], ['Check-ins today', '5', '2 pending', T.blue], ['Available', '6', 'ready now', T.violet]]}>
      <Panel T={T} title="Rooms" action={<span style={{ display: 'flex', gap: 12, fontSize: 11 }}>{Object.entries(tone).map(([k, [bg, fg, lbl]]: any) => <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, color: T.inkSub }}><span style={{ width: 9, height: 9, borderRadius: 3, background: fg }} />{lbl}</span>)}</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
          {rooms.map(rm => { const [bg, fg, lbl] = tone[rm.status]; return (
            <div key={rm.no} style={{ background: bg, borderRadius: T.r, padding: '12px 12px 11px', cursor: 'pointer', border: `1px solid ${fg}22` }}>
              <div style={{ fontFamily: T.fMono, fontSize: 17, fontWeight: 600, color: fg }}>{rm.no}</div>
              <div style={{ fontSize: 10.5, color: fg, opacity: 0.8, marginTop: 1 }}>{rm.type}</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: fg, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 8 }}>{lbl}</div>
            </div>
          ); })}
        </div>
      </Panel>
    </VerticalShell>
  );
}
