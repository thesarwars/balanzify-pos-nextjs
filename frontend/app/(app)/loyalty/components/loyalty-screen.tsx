'use client';
// ─────────────────────────────────────────────────────────────────
// Loyalty / Reward Points — the manual's reward-point settings
// (earning + redeem rules, expiry) and the members ledger.
// Wired through API.reward.{getSettings, saveSettings, members}.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Badge, Panel, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useStateLy, useEffect: useEffectLy } = React;

export function Loyalty({ T }: { T: Theme }) {
  const [s, setS] = useStateLy<any>(null);
  const [dirty, setDirty] = useStateLy(false);
  const [members, setMembers] = useStateLy<any[]>([]);
  const [toast, toastNode] = useToast();

  useEffectLy(() => {
    API.reward.getSettings().then(setS).catch(() => {});
    API.reward.members().then(setMembers).catch(() => {});
  }, []);

  const set = (k: string, v: any) => { setS((p: any) => ({ ...p, [k]: v })); setDirty(true); };
  async function save() { const saved = await API.reward.saveSettings(s); setS(saved); setDirty(false); toast('Reward settings saved'); API.reward.members().then(setMembers); }

  if (!s) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paperAlt, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>GET /connector/api/reward-point-setting…</div>;

  const name = s.display_name || 'Reward Points';
  // live earning preview for a $100 invoice
  const sample = 100;
  const earned = sample >= s.min_order_total_earn ? Math.min(s.max_points_per_order || Infinity, Math.floor(sample / s.amount_per_unit_point)) : 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Loyalty & Reward Points" subtitle={s.enabled ? `${members.length} members · "${name}" active` : 'Reward points are off'}
        right={<>
          {dirty && <span style={{ fontSize: 12, color: T.amberText, fontWeight: 600, marginRight: 4 }}>● Unsaved</span>}
          <Btn T={T} kind="accent" onClick={save} style={{ opacity: dirty ? 1 : 0.55 }}>Save changes</Btn>
        </>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* master toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 22px', background: s.enabled ? T.accent.soft : T.card, border: `1px solid ${s.enabled ? T.accent.base : T.line}`, borderRadius: T.rLg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
              <span style={{ width: 46, height: 46, borderRadius: 12, background: s.enabled ? T.accent.base : T.paperSink, color: s.enabled ? T.accent.on : T.inkMute, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>◆</span>
              <div>
                <div style={{ fontFamily: T.fDisplay, fontSize: 19, fontWeight: T.dispWeight, color: T.ink }}>Reward points</div>
                <div style={{ fontSize: 12.5, color: T.inkSub }}>Let customers earn and redeem points on purchases.</div>
              </div>
            </div>
            <LyToggle T={T} on={s.enabled} onChange={(v: boolean) => set('enabled', v)} big />
          </div>

          {s.enabled && <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              {/* earning */}
              <Panel T={T} title="Earning points">
                <Row T={T} label="Display name" hint="Shown on receipts & screens"><Txt T={T} value={s.display_name} onChange={(v: any) => set('display_name', v)} w={150} /></Row>
                <Row T={T} label="Amount spent per point" hint="$ a customer spends to earn 1 point"><Txt T={T} value={s.amount_per_unit_point} onChange={(v: any) => set('amount_per_unit_point', +v)} num suffix="$ / pt" /></Row>
                <Row T={T} label="Min order to earn" hint="Invoice total must reach this"><Txt T={T} value={s.min_order_total_earn} onChange={(v: any) => set('min_order_total_earn', +v)} num suffix="$" /></Row>
                <Row T={T} label="Max points per order" hint="Blank for no cap" last><Txt T={T} value={s.max_points_per_order || ''} onChange={(v: any) => set('max_points_per_order', v === '' ? null : +v)} num suffix="pts" /></Row>
              </Panel>
              {/* redeem */}
              <Panel T={T} title="Redeeming points">
                <Row T={T} label="Value per point" hint="$ a single point is worth"><Txt T={T} value={s.redeem_amount_per_point} onChange={(v: any) => set('redeem_amount_per_point', +v)} num suffix="$ / pt" /></Row>
                <Row T={T} label="Min order to redeem"><Txt T={T} value={s.min_order_total_redeem} onChange={(v: any) => set('min_order_total_redeem', +v)} num suffix="$" /></Row>
                <Row T={T} label="Min / max redeem per order">
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Txt T={T} value={s.min_redeem_point} onChange={(v: any) => set('min_redeem_point', +v)} num w={56} />
                    <span style={{ color: T.inkMute }}>–</span>
                    <Txt T={T} value={s.max_redeem_point} onChange={(v: any) => set('max_redeem_point', +v)} num w={64} />
                  </div>
                </Row>
                <Row T={T} label="Points expiry" last>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Txt T={T} value={s.expiry_period} onChange={(v: any) => set('expiry_period', +v)} num w={56} />
                    <select value={s.expiry_type} onChange={(e: any) => set('expiry_type', e.target.value)} style={{ padding: '7px 9px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none', cursor: 'pointer' }}>
                      <option value="months">months</option><option value="years">years</option>
                    </select>
                  </div>
                </Row>
              </Panel>
            </div>

            {/* live preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 22px', background: T.navy, borderRadius: T.rLg, color: '#fff', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>Preview</span>
              <span style={{ fontSize: 14 }}>A <b style={{ fontFamily: T.fMono }}>{money(sample)}</b> sale earns <b style={{ fontFamily: T.fMono, color: T.accent.bright }}>{earned} {name.toLowerCase()}</b></span>
              <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.2)' }} />
              <span style={{ fontSize: 14 }}>which redeem for <b style={{ fontFamily: T.fMono, color: T.accent.bright }}>{money(earned * s.redeem_amount_per_point)}</b></span>
            </div>

            {/* members */}
            <Panel T={T} title={`Members · ${members.length}`} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{([['Member', 'l'], ['Card / ID', 'l'], ['Tier', 'l'], ['Lifetime', 'r'], ['Points balance', 'r'], ['Worth', 'r']] as any[]).map(([h, a]: any, i: number) => (
                  <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {members.map((m: any) => (
                    <tr key={m.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span style={{ width: 30, height: 30, borderRadius: 99, flexShrink: 0, background: T.accent.soft, color: T.accent.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{m.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</span>
                          <div><div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{m.name}</div><div style={{ fontSize: 11, color: T.inkSub }}>{m.mobile || '—'}</div></div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{m.contact_id}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={m.tier === 'Gold' ? 'brass' : m.tier === 'Silver' ? 'gray' : 'amber'}>{m.tier}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{m.lifetime_points}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 14, fontWeight: 600, color: T.ink }}>{m.points}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.greenText }}>{money(m.points * s.redeem_amount_per_point)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {members.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No members yet. Assign a Customer ID when adding a customer to enrol them.</div>}
            </Panel>
          </>}
        </div>
      </div>
      {toastNode}
    </div>
  );
}

function Row({ T, label, hint, children, last }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: last ? 'none' : `1px solid ${T.line}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: T.inkMid, fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: T.inkSub, marginTop: 1 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}
function Txt({ T, value, onChange, num, suffix, w = 90 }: any) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <input type={num ? 'number' : 'text'} value={value ?? ''} onChange={(e: any) => onChange(e.target.value)} style={{ width: w, padding: '8px 11px', fontSize: 13, fontFamily: num ? T.fMono : T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', textAlign: num ? 'right' : 'left' }}
        onFocus={(e: any) => e.target.style.borderColor = T.accent.base} onBlur={(e: any) => e.target.style.borderColor = T.line} />
      {suffix && <span style={{ fontSize: 11.5, color: T.inkSub, whiteSpace: 'nowrap' }}>{suffix}</span>}
    </span>
  );
}
function LyToggle({ T, on, onChange, big }: any) {
  const w = big ? 52 : 40, h = big ? 30 : 23, k = h - 5;
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ width: w, height: h, borderRadius: 99, background: on ? T.accent.base : T.lineMid, position: 'relative', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background .18s', padding: 0 }}>
      <span style={{ position: 'absolute', top: 2.5, left: on ? w - k - 2.5 : 2.5, width: k, height: k, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  );
}
