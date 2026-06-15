'use client';
// ─────────────────────────────────────────────────────────────────
// Superadmin / SaaS console — the platform-owner view (separate from
// the shop app). Businesses, packages, subscriptions & payments.
// A paid add-on: shows a locked state unless the Superadmin module
// is enabled. Wired through API.superadmin.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useTheme } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useStateSa, useEffect: useEffectSa } = React;

export default function SuperadminPage() {
  const T = useTheme();
  return <Superadmin T={T} />;
}

function Superadmin({ T }: { T: Theme }) {
  const [enabled, setEnabled] = useStateSa<any>(null);
  const [tab, setTab] = useStateSa('businesses');
  const [stats, setStats] = useStateSa<any>(null);
  const [biz, setBiz] = useStateSa<any[]>([]);
  const [pkgs, setPkgs] = useStateSa<any[]>([]);
  const [pays, setPays] = useStateSa<any[]>([]);
  const [gw, setGw] = useStateSa<any>({});
  const [addPkg, setAddPkg] = useStateSa(false);
  const [show, node] = useToast();

  const reload = React.useCallback(() => {
    API.superadmin.stats().then(setStats).catch(() => {});
    API.superadmin.businesses().then(setBiz).catch(() => {});
    API.superadmin.packages().then(setPkgs).catch(() => {});
    API.superadmin.payments().then(setPays).catch(() => {});
    API.superadmin.gateways().then(setGw).catch(() => {});
  }, []);
  useEffectSa(() => { API.module.list().then((ms: any) => setEnabled(!!(ms.find((m: any) => m.key === 'superadmin') || {}).enabled)).catch(() => setEnabled(false)); }, []);
  useEffectSa(() => { if (enabled) reload(); }, [enabled, reload]);

  async function enableModule() { await API.module.setEnabled('superadmin', true); setEnabled(true); show('Superadmin module enabled'); }

  if (enabled === false) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.paperAlt }}>
        <Topbar T={T} title="Superadmin" subtitle="SaaS platform console" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ width: 76, height: 76, borderRadius: 20, background: T.accent.soft, color: T.accent.base, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, margin: '0 auto 20px' }}>⚿</div>
            <div style={{ fontFamily: T.fDisplay, fontSize: 24, fontWeight: T.dispWeight, color: T.ink, marginBottom: 8 }}>Superadmin (SaaS) module</div>
            <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6, marginBottom: 22 }}>Sell subscription packages, manage all businesses on your platform, and take payments via Stripe or offline. Paid add-on ($39/mo).</div>
            <Btn T={T} kind="accent" onClick={enableModule}>Enable Superadmin · $39/mo</Btn>
          </div>
        </div>
        {node}
      </div>
    );
  }
  if (enabled === null) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paperAlt, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>;

  const stone: any = { active: 'green', trial: 'blue', expired: 'red' };
  const setBizStatus = (b: any, status: any) => API.superadmin.setBusiness(b.id, { status }).then(() => { reload(); show('Business updated'); });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Superadmin" subtitle="SaaS platform console"
        right={tab === 'packages' ? <Btn T={T} kind="accent" onClick={() => setAddPkg(true)}>+ Add Package</Btn> : null} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {/* platform dashboard */}
          {stats && (
            <div style={{ background: `linear-gradient(135deg, ${T.navy}, ${T.navyLight})`, borderRadius: T.rLg, padding: '22px 26px', marginBottom: 20, color: '#fff', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 18 }}>
              {[['Businesses', stats.businesses], ['Active', stats.active], ['Trials', stats.trial], ['Expired', stats.expired], ['MRR', money0(stats.mrr)]].map(([k, v]: any) => (
                <div key={k}><div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{k}</div><div style={{ fontFamily: T.fMono, fontSize: 26, fontWeight: 600, marginTop: 4, letterSpacing: '-1px' }}>{v}</div></div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
            {[['businesses', 'Businesses', biz.length], ['packages', 'Packages', pkgs.length], ['payments', 'Payments', pays.length], ['gateways', 'Gateways', null]].map(([id, lbl, n]: any) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl}{n != null ? ` · ${n}` : ''}</button>
            ))}
          </div>

          {tab === 'businesses' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['Business', 'l'], ['Owner', 'l'], ['Country', 'l'], ['Package', 'l'], ['Users', 'r'], ['Expires', 'l'], ['Status', 'l'], ['', 'r']].map(([h, a]: any, i: number) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>)}</tr></thead>
                <tbody>
                  {biz.map((b: any) => (
                    <tr key={b.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{b.name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{b.owner}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{b.country}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone="brass">{b.package_name} · {money(b.package_price)}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{b.users}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub, fontFamily: T.fMono }}>{b.expires}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={stone[b.status]}>{b.status}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                        <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                          {b.status !== 'active' ? <button onClick={() => setBizStatus(b, 'active')} style={saMini(T, 'accent')}>Activate</button> : <button onClick={() => setBizStatus(b, 'expired')} style={saMini(T)}>Deactivate</button>}
                          <button onClick={() => show('Logging in as ' + b.owner + '…')} style={saMini(T)}>Login as</button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {tab === 'packages' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
              {pkgs.map((p: any) => (
                <div key={p.id} style={{ background: p.featured ? `linear-gradient(135deg, ${T.accent.base}, ${T.accent.bright})` : T.card, color: p.featured ? '#fff' : T.ink, border: p.featured ? 'none' : `1px solid ${T.line}`, borderRadius: T.rLg, padding: 20, boxShadow: T.sh1 }}>
                  {p.featured && <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.85, marginBottom: 6 }}>★ Featured</div>}
                  <div style={{ fontFamily: T.fDisplay, fontSize: 20, fontWeight: T.dispWeight }}>{p.name}</div>
                  <div style={{ fontFamily: T.fMono, fontSize: 26, fontWeight: 600, marginTop: 6 }}>{money(p.price)}<span style={{ fontSize: 12, opacity: 0.6 }}>/{p.interval === 'monthly' ? 'mo' : 'yr'}</span></div>
                  <div style={{ marginTop: 12, fontSize: 12, opacity: 0.85, lineHeight: 1.7 }}>{p.locations} location{p.locations > 1 ? 's' : ''}<br />{p.users} users<br />{p.products.toLocaleString()} products</div>
                  {!p.featured && <button onClick={() => API.superadmin.removePackage(p.id).then(reload)} style={{ marginTop: 14, width: '100%', padding: '7px', borderRadius: 7, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600 }}>Remove</button>}
                </div>
              ))}
            </div>
          )}

          {tab === 'payments' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['Business', 'l'], ['Gateway', 'l'], ['Amount', 'r'], ['Date', 'l'], ['Status', 'l'], ['', 'r']].map(([h, a]: any, i: number) => <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>)}</tr></thead>
                <tbody>
                  {pays.map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{p.business}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={p.gateway === 'Stripe' ? 'violet' : 'gray'}>{p.gateway}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{money(p.amount)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub, fontFamily: T.fMono }}>{p.date}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={p.status === 'completed' ? 'green' : 'amber'}>{p.status}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>{p.status === 'pending' && <button onClick={() => API.superadmin.setPayment(p.id, 'completed').then(reload)} style={saMini(T, 'accent')}>Approve</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {tab === 'gateways' && (
            <Panel T={T} title="Payment gateways">
              {[['offline', 'Offline payment', 'Manual bank transfer / cash; you approve each payment.'], ['stripe', 'Stripe', 'Card subscriptions billed automatically.']].map(([k, lbl, desc]: any) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: `1px solid ${T.line}` }}>
                  <div><div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{lbl}</div><div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 1 }}>{desc}</div></div>
                  <button onClick={() => API.superadmin.setGateways({ [k]: !gw[k] }).then(setGw)} style={{ width: 44, height: 26, borderRadius: 99, background: gw[k] ? T.accent.base : T.lineMid, position: 'relative', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 3, left: gw[k] ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                  </button>
                </div>
              ))}
            </Panel>
          )}
        </div>
      </div>

      {addPkg && <PackageModal T={T} onClose={() => setAddPkg(false)} onSaved={() => { setAddPkg(false); show('Package added'); reload(); }} />}
      {node}
    </div>
  );
}

function PackageModal({ T, onClose, onSaved }: { T: Theme; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useStateSa<any>({ name: '', price: '', interval: 'monthly', locations: 1, users: 3, products: 500, featured: false });
  const [busy, setBusy] = useStateSa(false);
  const set = (k: any, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  return (
    <Modal T={T} title="New package" subtitle="Subscription plan for businesses" width={500} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={async () => { if (!f.name.trim()) return; setBusy(true); try { await API.superadmin.addPackage(f); onSaved(); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Saving…' : 'Add package'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Package name" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. Pro" /></Field>
        <Field T={T} label="Price"><TextField T={T} type="number" value={f.price} onChange={(v: any) => set('price', v)} placeholder="0" /></Field>
        <Field T={T} label="Interval"><SelectField T={T} value={f.interval} options={['monthly', 'yearly']} onChange={(v: any) => set('interval', v)} /></Field>
        <Field T={T} label="Locations"><TextField T={T} type="number" value={f.locations} onChange={(v: any) => set('locations', v)} /></Field>
        <Field T={T} label="Users"><TextField T={T} type="number" value={f.users} onChange={(v: any) => set('users', v)} /></Field>
        <Field T={T} label="Products"><TextField T={T} type="number" value={f.products} onChange={(v: any) => set('products', v)} /></Field>
      </FormGrid>
      <button onClick={() => set('featured', !f.featured)} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.fBody }}>
        <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${f.featured ? T.accent.base : T.lineMid}`, background: f.featured ? T.accent.base : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{f.featured ? '✓' : ''}</span>
        <span style={{ fontSize: 12.5, color: T.inkMid }}>Featured plan</span>
      </button>
    </Modal>
  );
}

function saMini(T: any, accent?: any): React.CSSProperties { return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${accent ? T.accent.base : T.line}`, background: accent ? T.accent.base : T.paper, color: accent ? T.accent.on : T.inkMid }; }
