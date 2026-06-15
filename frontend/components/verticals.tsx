'use client';
// ─────────────────────────────────────────────────────────────────
// Vertical module landing screens — Hotel, Pharmacy, Wholesale,
// Construction. Each: KPI strip + a representative panel.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { PRODUCTS, PROJECTS } from '@/lib/data';

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

// Pharmacy — dispensing table
export function Pharmacy({ T }: { T: Theme }) {
  const rx = PRODUCTS.filter((p: any) => p.rx);
  const recent = [
    ['Paracetamol 500mg', 'Khadija Ali', 'Dr. Nuur', '2 strips', '14:20'],
    ['ORS Sachets (10)', 'Walk-in', '—', '1 box', '13:05'],
    ['Antiseptic 100ml', 'Yusuf Omar', 'Dr. Salah', '1 btl', '11:40'],
    ['Vitamin C 1000mg', 'Hodan Said', '—', '1 tube', '10:15'],
  ];
  return (
    <VerticalShell T={T} title="Pharmacy" subtitle="Dispensing & Rx" action="+ Dispense"
      kpis={[['Rx today', '38', '12 controlled', T.accent.base], ['Expiring ≤30d', '3', 'batches', T.red], ['Low stock', rx.filter((p: any) => p.stock <= 12).length, 'Rx items', T.amber], ['OTC sales', money(214), 'today', T.green]]}>
      <Panel T={T} title="Recent Dispenses" pad={false}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Medicine', 'Patient', 'Prescriber', 'Qty', 'Time'].map((h, i) => (
            <th key={h} style={{ textAlign: i === 3 || i === 4 ? 'right' : 'left', padding: '11px 20px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
          ))}</tr></thead>
          <tbody>{recent.map((r, i) => (
            <tr key={i}>
              <td style={{ padding: '12px 20px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{r[0]}<Badge T={T} tone="blue" style={{ marginLeft: 8 }}>Rx</Badge></td>
              <td style={{ padding: '12px 20px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: r[1] === 'Walk-in' ? T.inkMute : T.inkMid }}>{r[1]}</td>
              <td style={{ padding: '12px 20px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: T.inkSub }}>{r[2]}</td>
              <td style={{ padding: '12px 20px', borderBottom: `1px solid ${T.line}`, fontSize: 13, textAlign: 'right', fontFamily: T.fMono, color: T.inkMid }}>{r[3]}</td>
              <td style={{ padding: '12px 20px', borderBottom: `1px solid ${T.line}`, fontSize: 12, textAlign: 'right', color: T.inkSub }}>{r[4]}</td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>
    </VerticalShell>
  );
}

// Wholesale — B2B orders
export function Wholesale({ T }: { T: Theme }) {
  const orders: any[] = [
    ['WS-0231', 'Banadir Retail', 48, 1240.00, 'credit', 'fulfilling'],
    ['WS-0230', 'Hargeisa Stores', 120, 3110.00, 'paid', 'delivered'],
    ['WS-0229', 'Juba Kiosks Co.', 36, 820.00, 'credit', 'pending'],
    ['WS-0228', 'Berbera Mart', 64, 1560.00, 'paid', 'delivered'],
  ];
  return (
    <VerticalShell T={T} title="Wholesale" subtitle="B2B & distribution" action="+ New Order"
      kpis={[['Open orders', '7', 'this week', T.accent.base], ['Outstanding credit', money0(4180), '12 accounts', T.amber], ['Avg order', money(1432), 'B2B', T.blue], ['Top buyer', 'Hargeisa', money0(3110), T.green]]}>
      <Panel T={T} title="Recent B2B Orders" pad={false}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Order', 'Buyer', 'Units', 'Total', 'Terms', 'Status'].map((h, i) => (
            <th key={h} style={{ textAlign: i >= 2 && i <= 3 ? 'right' : 'left', padding: '11px 20px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
          ))}</tr></thead>
          <tbody>{orders.map((o, i) => (
            <tr key={i}>
              <td style={{ padding: '12px 20px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.accent.text }}>{o[0]}</td>
              <td style={{ padding: '12px 20px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{o[1]}</td>
              <td style={{ padding: '12px 20px', borderBottom: `1px solid ${T.line}`, fontSize: 13, textAlign: 'right', fontFamily: T.fMono, color: T.inkMid }}>{o[2]}</td>
              <td style={{ padding: '12px 20px', borderBottom: `1px solid ${T.line}`, fontSize: 13, textAlign: 'right', fontFamily: T.fMono, fontWeight: 600, color: T.ink }}>{money(o[3])}</td>
              <td style={{ padding: '12px 20px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={o[4] === 'paid' ? 'green' : 'amber'}>{o[4]}</Badge></td>
              <td style={{ padding: '12px 20px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={o[5] === 'delivered' ? 'green' : o[5] === 'pending' ? 'gray' : 'blue'}>{o[5]}</Badge></td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>
    </VerticalShell>
  );
}

// Construction — projects + materials
export function Construction({ T }: { T: Theme }) {
  return (
    <VerticalShell T={T} title="Construction" subtitle="Projects & materials" action="+ New Project"
      kpis={[['Active projects', '3', '1 due soon', T.accent.base], ['Materials issued', money0(8420), 'this month', T.amber], ['Pending POs', '2', money0(3930), T.blue], ['Budget used', '58%', 'of $20.6k', T.green]]}>
      <Panel T={T} title="Active Projects" pad={false}>
        <div style={{ padding: '6px 0' }}>
          {PROJECTS.filter((p: any) => p.status === 'active').map((p: any, i: number) => (
            <div key={i} style={{ padding: '14px 20px', borderBottom: i < 2 ? `1px solid ${T.line}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{p.name}</span>
                <span style={{ fontSize: 12, color: T.inkSub }}>Due {p.due} · <b style={{ color: T.ink, fontFamily: T.fMono }}>{money0(p.budget)}</b></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, height: 8, background: T.paperSink, borderRadius: 99 }}><span style={{ display: 'block', height: '100%', width: p.progress + '%', background: `linear-gradient(90deg, ${T.accent.base}, ${T.accent.bright})`, borderRadius: 99 }} /></span>
                <span style={{ fontFamily: T.fMono, fontSize: 12, color: T.inkSub, width: 36 }}>{p.progress}%</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </VerticalShell>
  );
}
