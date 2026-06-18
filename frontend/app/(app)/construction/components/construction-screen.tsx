'use client';
// ─────────────────────────────────────────────────────────────────
// Construction — projects & materials landing screen (KPI strip +
// active-projects progress list). Static mockup vertical; colocated
// under its route.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money0 } from '@/lib/theme';
import { Btn, Panel } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { PROJECTS } from '@/lib/data';

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
