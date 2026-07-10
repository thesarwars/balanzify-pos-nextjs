'use client';
import React from 'react';
import { Btn, Modal, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { PRODUCTS } from '@/lib/data';

const { useState: useStatePu, useEffect: useEffectPu } = React;

// ── Opening stock ───────────────────────────────────────────────────
export function OpeningStock({ T, onClose, toast }: { T: any; onClose: () => void; toast: any }) {
  const [pid, setPid] = useStatePu<any>('');
  const [qty, setQty] = useStatePu<any>('');
  const [busy, setBusy] = useStatePu(false);
  const [tick, setTick] = useStatePu(0);
  const [catalog, setCatalog] = useStatePu<any[]>(PRODUCTS);
  useEffectPu(() => { if (API.config?.isReal?.()) API.product.list({ per_page: 200 }).then((r: any) => setCatalog(r.items || [])).catch(() => {}); }, []);
  const products = catalog.filter((p: any) => p.enable_stock !== false && p.type !== 'combo');
  const current: any = products.find((p: any) => p.id === pid);

  async function apply() {
    if (!pid || qty === '') return;
    setBusy(true);
    try { await API.openingStock.set({ product_id: pid, qty: Number(qty) }); setQty(''); setTick((t: any) => t + 1); toast('Opening stock updated'); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title="Opening stock" subtitle="Seed or adjust a product's quantity" width={460} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Done</Btn><Btn T={T} kind="accent" onClick={apply} disabled={busy || !pid || qty === ''}>{busy ? 'Applying…' : 'Apply'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Product" full>
          <SelectField T={T} value={pid} options={['', ...products.map((p: any) => p.id)]} onChange={setPid} render={(v: any) => v ? (products.find((p: any) => p.id === v) || {}).name : 'Select product…'} />
        </Field>
      </FormGrid>
      {current && (
        <div key={tick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', marginTop: 12, borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 13, color: T.inkMid }}>Current on-hand</span>
          <span style={{ fontFamily: T.fMono, fontSize: 18, fontWeight: 600, color: T.ink }}>{current.stock} {current.unit}</span>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <Field T={T} label="Quantity to add (use a negative number to reduce)" full><TextField T={T} type="number" value={qty} onChange={setQty} placeholder="e.g. 50 or −10" /></Field>
      </div>
      <div style={{ fontSize: 11, color: T.inkMute, marginTop: 8, lineHeight: 1.5 }}>This adds to the current on-hand. To zero a product with 10 in stock, add −10.</div>
    </Modal>
  );
}
