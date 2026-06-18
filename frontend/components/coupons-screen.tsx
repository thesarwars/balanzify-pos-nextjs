'use client';
// ─────────────────────────────────────────────────────────────────
// Coupons — promo codes: create (%/flat), min purchase, usage caps,
// validity window, active toggle, and a live validator. Wired through
// API.coupon (/api/v1/coupons).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useTheme } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useS, useEffect: useE, useCallback: useCb } = React;

export function Coupons({ T }: { T: Theme }) {
  const [rows, setRows] = useS<any[]>([]);
  const [loading, setLoading] = useS(true);
  const [add, setAdd] = useS(false);
  const [test, setTest] = useS(false);
  const [show, node] = useToast();
  const reload = useCb(() => { setLoading(true); API.coupon.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, []);
  useE(() => { reload(); }, [reload]);

  const now = new Date().toISOString().slice(0, 10);
  const live = (c: any) => c.is_active && (!c.valid_until || c.valid_until >= now) && (!c.valid_from || c.valid_from <= now);
  const fmtVal = (c: any) => c.type === 'pct' ? c.value + '%' : c.type === 'flat' ? money(c.value) : 'Free item';
  async function toggle(c: any) { try { await API.coupon.update(c.id, { is_active: !c.is_active }); reload(); } catch (e: any) { show(e.message); } }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Coupons" subtitle={`${rows.length} promo codes`}
        right={<><Btn T={T} kind="ghost" onClick={() => setTest(true)}>✓ Test a code</Btn><Btn T={T} kind="accent" onClick={() => setAdd(true)}>+ Add Coupon</Btn></>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[['Code', 'l'], ['Discount', 'r'], ['Min purchase', 'r'], ['Used', 'r'], ['Validity', 'l'], ['Status', 'l'], ['', 'r']].map(([h, a]: any, i: number) => (
                <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((c: any) => (
                  <tr key={c.id}>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 13, fontWeight: 700, color: T.accent.text }}>{c.code}{c.description ? <span style={{ display: 'block', fontFamily: T.fBody, fontWeight: 400, fontSize: 11, color: T.inkSub }}>{c.description}</span> : null}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, color: T.ink } as React.CSSProperties}>{fmtVal(c)}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>{c.min_purchase ? money(c.min_purchase) : '—'}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 11.5, color: T.inkSub, fontFamily: T.fMono }}>{c.valid_from || '—'} → {c.valid_until || '—'}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={live(c) ? 'green' : 'gray'}>{live(c) ? 'Active' : c.is_active ? 'Scheduled' : 'Off'}</Badge></td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}><button onClick={() => toggle(c)} style={cMini(T)}>{c.is_active ? 'Disable' : 'Enable'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>Loading coupons…</div>}
            {!loading && rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>No coupons yet.</div>}
          </Panel>
        </div>
      </div>
      {add && <CouponModal T={T} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); show('Coupon created'); reload(); }} toast={show} />}
      {test && <ValidateModal T={T} onClose={() => setTest(false)} />}
      {node}
    </div>
  );
}

function CouponModal({ T, onClose, onSaved, toast }: { T: Theme; onClose: () => void; onSaved: () => void; toast: (m: string) => void }) {
  const [f, setF] = useS<any>({ code: '', description: '', type: 'pct', value: '', min_purchase: '', max_uses: '', per_customer_limit: 1, valid_from: '', valid_until: '', is_active: true });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.code.trim()) { setErr('Code is required.'); return; }
    if (!(Number(f.value) > 0)) { setErr('Value must be greater than 0.'); return; }
    setBusy(true); setErr(null);
    try { await API.coupon.create(f); onSaved(); } catch (e: any) { setErr(e.message || 'Could not create coupon.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="New coupon" subtitle="Promo code applied at checkout" width={560} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Create coupon'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Code" ><TextField T={T} value={f.code} onChange={(v: any) => set('code', v.toUpperCase().replace(/\s/g, ''))} placeholder="WEEKEND10" /></Field>
        <Field T={T} label="Type"><SelectField T={T} value={f.type} options={['pct', 'flat']} onChange={(v: any) => set('type', v)} render={(v: any) => v === 'pct' ? 'Percentage (%)' : 'Flat ($)'} /></Field>
        <Field T={T} label={f.type === 'pct' ? 'Value (%)' : 'Value ($)'}><TextField T={T} type="number" value={f.value} onChange={(v: any) => set('value', v)} placeholder="0" /></Field>
        <Field T={T} label="Min purchase"><TextField T={T} type="number" value={f.min_purchase} onChange={(v: any) => set('min_purchase', v)} placeholder="0" /></Field>
        <Field T={T} label="Max uses (blank = ∞)"><TextField T={T} type="number" value={f.max_uses} onChange={(v: any) => set('max_uses', v)} placeholder="∞" /></Field>
        <Field T={T} label="Per-customer limit"><TextField T={T} type="number" value={f.per_customer_limit} onChange={(v: any) => set('per_customer_limit', v)} /></Field>
        <Field T={T} label="Valid from"><TextField T={T} type="date" value={f.valid_from} onChange={(v: any) => set('valid_from', v)} /></Field>
        <Field T={T} label="Valid until"><TextField T={T} type="date" value={f.valid_until} onChange={(v: any) => set('valid_until', v)} /></Field>
        <Field T={T} label="Description" full><TextField T={T} value={f.description} onChange={(v: any) => set('description', v)} placeholder="optional" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function ValidateModal({ T, onClose }: { T: Theme; onClose: () => void }) {
  const [code, setCode] = useS(''); const [subtotal, setSubtotal] = useS('100'); const [res, setRes] = useS<any>(null); const [busy, setBusy] = useS(false);
  async function run() {
    setBusy(true); setRes(null);
    try { const r: any = await API.coupon.validate(code, subtotal); setRes({ ok: true, ...r }); }
    catch (e: any) { setRes({ ok: false, msg: e.message }); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="Test a coupon" subtitle="Validate a code against a cart subtotal" width={440} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={run} disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Validate'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Code"><TextField T={T} value={code} onChange={(v: any) => setCode(v.toUpperCase())} placeholder="WEEKEND10" /></Field>
        <Field T={T} label="Cart subtotal"><TextField T={T} type="number" value={subtotal} onChange={setSubtotal} /></Field>
      </FormGrid>
      {res && (res.ok
        ? <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.accent.soft, color: T.accent.text, fontSize: 13 }}>✓ Valid — discount <b style={{ fontFamily: T.fMono }}>{money(res.discount || 0)}</b></div>
        : <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>✗ {res.msg}</div>)}
    </Modal>
  );
}

function cMini(T: Theme): React.CSSProperties { return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid }; }
