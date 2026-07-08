'use client';
import React from 'react';
import { Modal, Btn, Badge, TextField, SelectField } from '@/components/kit';
import { API } from '@/lib/api';
const { useState: useStatePr } = React;

// ── Units manager  /connector/api/unit ──────────────────────────────
export function UnitManager({ T, units, onClose, onChange, toast }: any) {
  const [name, setName] = useStatePr('');
  const [short, setShort] = useStatePr('');
  const [dec, setDec] = useStatePr(false);
  const [asMultiple, setAsMultiple] = useStatePr(false);
  const [baseId, setBaseId] = useStatePr('');
  const [mult, setMult] = useStatePr('');
  const [busy, setBusy] = useStatePr(false);
  async function add() {
    if (!name.trim()) return;
    if (asMultiple && (!baseId || !parseFloat(mult))) { toast('Pick a base unit and how many it equals.'); return; }
    setBusy(true);
    try {
      await API.unit.create({ actual_name: name, short_name: short || name, allow_decimal: dec, base_unit_id: asMultiple ? baseId : null, base_multiplier: asMultiple ? parseFloat(mult) : null });
      setName(''); setShort(''); setDec(false); setAsMultiple(false); setBaseId(''); setMult('');
      onChange(); toast('Unit added');
    }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }
  async function del(u: any) { try { await API.unit.remove(u.id); onChange(); toast('Unit removed'); } catch (e: any) { toast(e.message); } }
  return (
    <Modal T={T} title="Units" subtitle="Measurement units for products" width={520} onClose={onClose} footer={null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {units.map((u: any) => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>{u.actual_name} <span style={{ color: T.inkSub, fontWeight: 400 }}>({u.short_name})</span></span>
            {u.base_unit_id && <Badge T={T} tone="blue">= {u.base_unit_multiplier} × {u.base_unit_name || 'base'}</Badge>}
            {u.allow_decimal ? <Badge T={T} tone="gray">decimals</Badge> : null}
            <button onClick={() => del(u)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Unit name</div><TextField T={T} value={name} onChange={setName} placeholder="e.g. Dozen" /></div>
          <div style={{ width: 100 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Short</div><TextField T={T} value={short} onChange={setShort} placeholder="dz" /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.inkSub, cursor: 'pointer', paddingBottom: 11 }}><input type="checkbox" checked={dec} onChange={e => setDec(e.target.checked)} style={{ accentColor: T.accent.base }} />Decimals</label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: T.inkMid, cursor: 'pointer', marginTop: 12 }}>
          <input type="checkbox" checked={asMultiple} onChange={e => setAsMultiple(e.target.checked)} style={{ accentColor: T.accent.base }} />
          Add as multiple of another unit <span style={{ fontWeight: 400, color: T.inkSub }}>(e.g. 1 dozen = 12 pieces)</span>
        </label>
        {asMultiple && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap' }}>1 {name.trim() || 'unit'} =</span>
            <div style={{ width: 110 }}><TextField T={T} type="number" value={mult} onChange={setMult} placeholder="e.g. 12" /></div>
            <span style={{ fontSize: 13, color: T.inkSub }}>×</span>
            <div style={{ flex: 1 }}>
              <SelectField T={T} value={baseId} options={['', ...units.filter((u: any) => !u.base_unit_id).map((u: any) => u.id)]} onChange={setBaseId}
                render={(v: any) => { if (!v) return 'Select base unit'; const u = units.find((x: any) => x.id === v) || {}; return `${u.actual_name} (${u.short_name})`; }} />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <Btn T={T} kind="accent" onClick={add} disabled={busy}>{busy ? 'Saving…' : 'Add unit'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Price-group manager  /connector/api/selling-price-group ─────────
export function PriceGroupManager({ T, groups, onClose, onChange, toast }: any) {
  const [name, setName] = useStatePr('');
  const [pct, setPct] = useStatePr('');
  const [busy, setBusy] = useStatePr(false);
  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try { await API.priceGroup.create({ name, percent: Number(pct || 0) }); setName(''); setPct(''); onChange(); toast('Price group added'); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }
  async function del(g: any) { try { await API.priceGroup.remove(g.id); onChange(); toast('Price group removed'); } catch (e: any) { toast(e.message); } }
  return (
    <Modal T={T} title="Selling Price Groups" subtitle="Wholesale / retail / per-location pricing" width={520} onClose={onClose} footer={null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {groups.map((g: any) => (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>{g.name}{g.is_default && <Badge T={T} tone="gray" style={{ marginLeft: 7 }}>Default</Badge>}</span>
            {g.percent ? <Badge T={T} tone={g.percent < 0 ? 'green' : 'amber'}>{g.percent > 0 ? '+' : ''}{g.percent}% on price</Badge> : null}
            {!g.is_default && <button onClick={() => del(g)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 12 }}>✕</button>}
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Group name</div><TextField T={T} value={name} onChange={setName} placeholder="e.g. Bulk price" /></div>
        <div style={{ width: 120 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Adjust %</div><TextField T={T} type="number" value={pct} onChange={setPct} placeholder="-10" /></div>
        <Btn T={T} kind="accent" onClick={add} disabled={busy}>Add</Btn>
      </div>
      <div style={{ fontSize: 11, color: T.inkMute, marginTop: 12, lineHeight: 1.5 }}>The % adjusts the default selling price for that group (negative = discount). At the till, pick a price group to apply it; per-product overrides can be set in the product editor.</div>
    </Modal>
  );
}

// ── Variations manager  /connector/api/variation ────────────────────
export function VariationManager({ T, templates, onClose, onChange, toast }: any) {
  const [name, setName] = useStatePr('');
  const [vals, setVals] = useStatePr('');
  const [busy, setBusy] = useStatePr(false);
  async function add() {
    if (!name.trim() || !vals.trim()) return;
    setBusy(true);
    try { await API.variation.create({ name, values: vals.split(',').map((v: any) => v.trim()) }); setName(''); setVals(''); onChange(); toast('Variation added'); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }
  async function del(t: any) { try { await API.variation.remove(t.id); onChange(); toast('Variation removed'); } catch (e: any) { toast(e.message); } }
  return (
    <Modal T={T} title="Variations" subtitle="Templates for variable products" width={520} onClose={onClose} footer={null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {templates.map((t: any) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{t.name}</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>{t.values.map((v: any) => <Badge key={v.id} T={T} tone="gray">{v.name}</Badge>)}</div>
            </div>
            <button onClick={() => del(t)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ width: 130 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Name</div><TextField T={T} value={name} onChange={setName} placeholder="e.g. Size" /></div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Values (comma-separated)</div><TextField T={T} value={vals} onChange={setVals} placeholder="Small, Medium, Large" /></div>
        <Btn T={T} kind="accent" onClick={add} disabled={busy}>Add</Btn>
      </div>
    </Modal>
  );
}
