'use client';
import React from 'react';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast, useViewport, swatchBg } from '@/components/kit';
import { Topbar, useTheme } from '@/components/shell';
import { money } from '@/lib/theme';
import { API } from '@/lib/api';
import { BUSINESS, CATEGORIES, PRODUCTS } from '@/lib/data';

export default function ProductsPage() {
  const T = useTheme();
  return <Products T={T} />;
}

// ─────────────────────────────────────────────────────────────────
// Products — the data screen. Filter bar + table + slide-in detail.
// Demonstrates the redesigned table/detail vocabulary.
// ─────────────────────────────────────────────────────────────────
const { useState: useStatePr } = React;

function Products({ T }: { T: any }) {
  const { isMobile } = useViewport();
  const [q, setQ] = useStatePr('');
  const [cat, setCat] = useStatePr('');
  const [lowOnly, setLowOnly] = useStatePr(false);
  const [sel, setSel] = useStatePr<any>(null);
  const [list, setList] = useStatePr<any[]>([]);
  const [loading, setLoading] = useStatePr(true);
  const [open, setOpen] = useStatePr(false);
  const [editing, setEditing] = useStatePr<any>(null);
  const [form, setForm] = useStatePr<any>({});
  const [saving, setSaving] = useStatePr(false);
  const [formErr, setFormErr] = useStatePr<any>(null);
  const [refs, setRefs] = useStatePr<any>({ units: [], brands: [], variations: [], taxRates: [], priceGroups: [] });
  const [unitMgr, setUnitMgr] = useStatePr(false);
  const [varMgr, setVarMgr] = useStatePr(false);
  const [pgMgr, setPgMgr] = useStatePr(false);
  const [impExp, setImpExp] = useStatePr(false);
  const [labels, setLabels] = useStatePr(false);
  const [confirmDel, setConfirmDel] = useStatePr<any>(null);
  const [toast, toastNode] = useToast();
  const fileRef = React.useRef<any>(null);

  // Load the catalog from the API (GET /connector/api/product).
  const reload = React.useCallback(() => {
    setLoading(true);
    API.product.list({ per_page: 200 })
      .then((res: any) => setList(res.items))
      .catch(() => setList(PRODUCTS.slice()))
      .finally(() => setLoading(false));
  }, []);
  React.useEffect(() => { reload(); }, [reload]);

  // Load catalog reference data (units, brands, variation templates, taxes).
  const loadRefs = React.useCallback(() => {
    Promise.all([API.unit.list(), API.brand.list(), API.variation.list(), API.taxRate.list(), API.priceGroup.list()])
      .then(([units, brands, variations, taxRates, priceGroups]: any) => setRefs({ units, brands, variations, taxRates, priceGroups }))
      .catch(() => {});
  }, []);
  React.useEffect(() => { loadRefs(); }, [loadRefs]);

  function onPickImage(e: any) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Please choose an image file'); return; }
    const reader = new FileReader();
    reader.onload = () => setF('img', reader.result);
    reader.readAsDataURL(f);
    e.target.value = '';
  }

  let rows = list;
  if (q.trim()) { const s = q.toLowerCase(); rows = rows.filter((p: any) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s)); }
  if (cat) rows = rows.filter((p: any) => p.cat === cat);
  if (lowOnly) rows = rows.filter((p: any) => p.stock <= 12);

  const cats = CATEGORIES.filter((c: any) => c.id !== 'all');
  const stockTone = (n: number) => n <= 0 ? 'red' : n <= 12 ? 'amber' : 'green';
  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const SWATCHES = ['#E7B85C', '#7FB7D6', '#C0504D', '#5B8A4C', '#D9C9A3', '#9AC0CB', '#B5793F', '#7A4A2B'];

  function openNew() {
    setEditing(null); setFormErr(null);
    setForm({
      type: 'single', name: '', sku: '', sku_prefix: '', cat: cats[0].id,
      unit: (refs.units[0] || {}).short_name || 'Pc(s)', brand_id: '', tax_id: 0,
      alert_quantity: '', enable_stock: true, not_for_selling: false,
      price: '', cost: '', stock: '',
      var_template_id: '', variations: [], combo: [],
      sw: SWATCHES[Math.floor(Math.random() * SWATCHES.length)], img: null,
    });
    setOpen(true);
  }
  function openEdit(p: any) {
    setEditing(p); setFormErr(null);
    setForm({
      type: p.type || 'single', name: p.name, sku: p.sku, sku_prefix: '', cat: p.cat,
      unit: p.unit, brand_id: p.brand_id || '', tax_id: p.tax_id || 0,
      alert_quantity: p.alert_quantity ? String(p.alert_quantity) : '',
      enable_stock: p.enable_stock !== false, not_for_selling: !!p.not_for_selling,
      price: String(p.price ?? ''), cost: String(p.cost ?? ''), stock: p.stock === Infinity ? '' : String(p.stock ?? ''),
      var_template_id: '', variations: (p.variations || []).map((v: any) => ({ ...v, cost: String(v.cost), price: String(v.price), stock: String(v.stock) })),
      combo: (p.combo || []).map((c: any) => ({ ...c })), sw: p.sw, img: p.img || null,
    });
    setOpen(true);
  }

  // variable-product helpers
  function applyTemplate(tid: any) {
    const t = refs.variations.find((v: any) => v.id === Number(tid));
    setForm((f: any) => ({ ...f, var_template_id: tid, variations: t ? t.values.map((val: any) => ({ name: val.name, sku: '', cost: '', price: '', stock: '' })) : [] }));
  }
  const setVarRow = (i: number, k: string, v: any) => setForm((f: any) => ({ ...f, variations: f.variations.map((row: any, j: number) => j === i ? { ...row, [k]: v } : row) }));
  const fillDown = (k: string) => setForm((f: any) => { const v0 = f.variations[0] ? f.variations[0][k] : ''; return { ...f, variations: f.variations.map((row: any) => ({ ...row, [k]: v0 })) }; });
  // combo helpers
  const addCombo = () => setForm((f: any) => ({ ...f, combo: [...f.combo, { product_id: (list[0] || {}).id, qty: 1 }] }));
  const setComboRow = (i: number, k: string, v: any) => setForm((f: any) => ({ ...f, combo: f.combo.map((row: any, j: number) => j === i ? { ...row, [k]: v } : row) }));
  const rmCombo = (i: number) => setForm((f: any) => ({ ...f, combo: f.combo.filter((_: any, j: number) => j !== i) }));

  function validate() {
    if (!form.name.trim()) return 'Product name is required.';
    if (form.type === 'single' && form.enable_stock && form.price === '') return 'Enter a selling price.';
    if (form.type === 'variable') {
      if (!form.variations.length) return 'Add at least one variation.';
      if (form.variations.some((v: any) => v.price === '')) return 'Each variation needs a selling price.';
    }
    if (form.type === 'combo' && !form.combo.length) return 'Add at least one product to the combo.';
    return null;
  }
  async function save() {
    const err = validate();
    if (err) { setFormErr(err); return; }
    setFormErr(null); setSaving(true);
    const payload = {
      type: form.type, name: form.name.trim(), sku: form.sku.trim(), sku_prefix: form.sku_prefix,
      cat: form.cat, unit: form.unit, sw: form.sw, img: form.img,
      brand_id: form.brand_id ? Number(form.brand_id) : null, tax_id: Number(form.tax_id) || 0,
      alert_quantity: Number(form.alert_quantity || 0),
      enable_stock: form.type === 'combo' ? true : form.enable_stock, not_for_selling: form.not_for_selling,
      price: parseFloat(form.price || 0), cost: parseFloat(form.cost || 0), stock: parseInt(form.stock || 0),
      variations: form.variations.map((v: any) => ({ name: v.name, sku: v.sku, cost: parseFloat(v.cost || 0), price: parseFloat(v.price || 0), stock: parseInt(v.stock || 0) })),
      combo: form.combo,
    };
    try {
      if (editing) { const up = await API.product.update(editing.id, payload); if (sel && sel.id === editing.id) setSel(up); }
      else await API.product.create(payload);
      setOpen(false);
      toast(editing ? 'Product updated' : 'Product created');
      reload();
    } catch (ex: any) { setFormErr(ex.message || 'Could not save the product.'); }
    finally { setSaving(false); }
  }
  async function doDelete(p: any) {
    try { await API.product.remove(p.id); setConfirmDel(null); if (sel && sel.id === p.id) setSel(null); toast('Product deleted'); reload(); }
    catch (ex: any) { setConfirmDel(null); toast(ex.message || 'Delete failed'); }
  }
  async function duplicate(p: any) {
    try {
      const copy = { ...p, name: p.name + ' (copy)', sku: '', id: undefined, group_prices: { ...(p.group_prices || {}) } };
      await API.product.create(copy);
      toast('Product duplicated'); reload();
    } catch (ex: any) { toast(ex.message || 'Duplicate failed'); }
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: T.paperAlt }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar T={T} title="Products" subtitle={`${rows.length} of ${list.length} items`}
          right={<>
            <Btn T={T} kind="ghost" onClick={() => setImpExp(true)}>⤓ Import / Export</Btn>
            <Btn T={T} kind="ghost" onClick={() => setLabels(true)}>⌗ Labels</Btn>
            <Btn T={T} kind="ghost" onClick={() => setPgMgr(true)}>⊞ Price Groups</Btn>
            <Btn T={T} kind="ghost" onClick={() => setVarMgr(true)}>◑ Variations</Btn>
            <Btn T={T} kind="ghost" onClick={() => setUnitMgr(true)}>⚖ Units</Btn>
            <Btn T={T} kind="accent" onClick={openNew}>+ Add Product</Btn>
          </>} />

        <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <Panel T={T} pad={false}>
              {/* filter bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.inkMute, fontSize: 14 }}>⌕</span>
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or SKU…" style={{
                    width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, fontFamily: T.fBody, color: T.ink,
                    background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box',
                  }} />
                </div>
                <select value={cat} onChange={e => setCat(e.target.value)} style={{
                  padding: '9px 12px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper,
                  border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', cursor: 'pointer',
                }}>
                  <option value="">All categories</option>
                  {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: T.inkSub, cursor: 'pointer', fontWeight: 500 }}>
                  <input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} style={{ accentColor: T.accent.base, width: 15, height: 15 }} />
                  Low stock only
                </label>
              </div>

              {/* table */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{([['Product', 'l'], ['SKU', 'l'], ['Category', 'l'], ['Price', 'r'], ['Margin', 'r'], ['Stock', 'r']] as any[]).map(([h, a]: any) => (
                  <th key={h} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {rows.map((p: any) => {
                    const margin = p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
                    const active = sel?.id === p.id;
                    const typeTag = p.type === 'variable' ? ['Variable', 'violet'] : p.type === 'combo' ? ['Combo', 'blue'] : null;
                    return (
                      <tr key={p.id} onClick={() => setSel(p)} style={{ cursor: 'pointer', background: active ? T.accent.soft : 'transparent', transition: 'background .12s' }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = T.paperAlt; }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                            <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: swatchBg(p), border: p.img ? `1px solid ${T.line}` : 'none' }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, display: 'inline-flex', alignItems: 'center', gap: 7 }}>{p.name}{typeTag && <Badge T={T} tone={typeTag[1] as any}>{typeTag[0]}</Badge>}{p.rx && <Badge T={T} tone="blue">Rx</Badge>}{p.not_for_selling && <Badge T={T} tone="gray">Not for sale</Badge>}</span>
                          </div>
                        </td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{p.sku}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone="gray">{cats.find((c: any) => c.id === p.cat)?.name}</Badge></td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{money(p.price)}</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: margin >= 50 ? T.greenText : T.inkSub }}>{margin}%</td>
                        <td style={{ padding: '11px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>{p.stock === Infinity || p.enable_stock === false ? <Badge T={T} tone="gray">∞</Badge> : <Badge T={T} tone={stockTone(p.stock) as any}>{p.stock} {p.unit}</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && !loading && <div style={{ padding: '50px 20px', textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No products match your filters.</div>}
              {loading && (
                <div style={{ padding: '50px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: T.inkSub }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', border: `2.5px solid ${T.line}`, borderTopColor: T.accent.base, animation: 'spin .7s linear infinite' }} />
                  <span style={{ fontSize: 12.5, fontFamily: T.fMono }}>GET /connector/api/product…</span>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>

      {/* detail drawer */}
      {sel && (
        <div style={(isMobile
          ? { position: 'fixed', inset: 0, zIndex: 200, background: T.paper, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
          : { width: 340, minWidth: 340, borderLeft: `1px solid ${T.line}`, background: T.paper, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideLeft .2s ease' }) as React.CSSProperties}>
          <div style={{ height: 110, background: swatchBg(sel), position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 18 }}>
            {sel.img && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0.05) 60%)' }} />}
            <button onClick={() => setSel(null)} style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: 8, background: 'rgba(0,0,0,0.25)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, zIndex: 2 }}>✕</button>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ fontFamily: T.fDisplay, fontSize: 19, fontWeight: T.dispWeight, color: '#fff', letterSpacing: T.dispTrack, textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>{sel.name}</div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.9)', fontFamily: T.fMono, marginTop: 2 }}>{sel.sku}</div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
            {(sel.type === 'variable' || sel.type === 'combo') && (
              <div style={{ marginBottom: 14 }}><Badge T={T} tone={sel.type === 'variable' ? 'violet' : 'blue'}>{sel.type === 'variable' ? 'Variable product' : 'Combo / bundle'}</Badge></div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              <MiniStat T={T} label={sel.type === 'variable' ? 'From' : 'Selling'} value={money(sel.price)} />
              <MiniStat T={T} label="Cost" value={money(sel.cost)} />
              <MiniStat T={T} label="Margin" value={sel.price ? `${Math.round(((sel.price - sel.cost) / sel.price) * 100)}%` : '—'} tone={T.green} />
              <MiniStat T={T} label="In stock" value={sel.stock === Infinity || sel.enable_stock === false ? '∞' : `${sel.stock}`} tone={sel.stock <= (sel.alert_quantity || 12) ? T.amber : T.ink} />
            </div>

            {sel.type === 'variable' && sel.variations && sel.variations.length > 0 && (
              <div style={{ marginBottom: 16, border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr', padding: '7px 11px', background: T.paperAlt, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub } as React.CSSProperties}><span>Variation</span><span style={{ textAlign: 'right' }}>Price</span><span style={{ textAlign: 'right' }}>Stock</span></div>
                {sel.variations.map((v: any, i: number) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr', padding: '8px 11px', borderTop: `1px solid ${T.line}`, fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: T.ink }}>{v.name}</span>
                    <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.ink }}>{money(v.price)}</span>
                    <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{v.stock}</span>
                  </div>
                ))}
              </div>
            )}

            {sel.type === 'combo' && sel.combo && sel.combo.length > 0 && (
              <div style={{ marginBottom: 16, border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
                <div style={{ padding: '7px 11px', background: T.paperAlt, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub }}>Includes</div>
                {sel.combo.map((c: any, i: number) => {
                  const cp = PRODUCTS.find((p: any) => parseInt(String(p.id).replace(/\D/g, ''), 10) === c.product_id) || PRODUCTS.find((p: any) => p.id === c.product_id);
                  return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 11px', borderTop: `1px solid ${T.line}`, fontSize: 12 }}><span style={{ color: T.ink, fontWeight: 600 }}>{cp ? cp.name : 'Product'}</span><span style={{ fontFamily: T.fMono, color: T.inkSub }}>×{c.qty}</span></div>;
                })}
              </div>
            )}

            {([['Type', ({ single: 'Single', variable: 'Variable', combo: 'Combo' } as any)[sel.type || 'single']], ['Category', CATEGORIES.find((c: any) => c.id === sel.cat)?.name], ['Brand', (refs.brands.find((b: any) => b.id === sel.brand_id) || {}).name || '—'], ['Unit of measure', sel.unit], ['Tax', (refs.taxRates.find((t: any) => t.id === (sel.tax_id || 0)) || {}).name || 'None'], ['Alert quantity', (sel.alert_quantity || 0) + ' ' + sel.unit], ['Stock managed', sel.enable_stock === false ? 'No' : 'Yes'], ['For selling', sel.not_for_selling ? 'No' : 'Yes']] as any[]).map(([k, v]: any) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}>
                <span style={{ color: T.inkSub }}>{k}</span>
                <span style={{ fontWeight: 600, color: T.ink }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <Btn T={T} kind="primary" style={{ flex: 1 }} onClick={() => openEdit(sel)}>Edit product</Btn>
              <Btn T={T} kind="ghost" onClick={() => duplicate(sel)}>Duplicate</Btn>
              <Btn T={T} kind="danger" onClick={() => setConfirmDel(sel)}>Delete</Btn>
            </div>
          </div>
        </div>
      )}

      {open && (
        <Modal T={T} title={editing ? 'Edit product' : 'New product'} subtitle={editing ? editing.sku : 'Add an item to your catalog'} onClose={() => setOpen(false)} width={680}
          footer={<>
            <div style={{ flex: 1 }} />
            <Btn T={T} kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn T={T} kind="accent" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}</Btn>
          </>}>
          {/* product type */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSub, marginBottom: 8, letterSpacing: 0.3 }}>Product type</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {([['single', 'Single', 'One fixed price & stock'], ['variable', 'Variable', 'Sizes, colours, weights…'], ['combo', 'Combo', 'A bundle of products']] as any[]).map(([id, lbl, sub]: any) => (
                <button key={id} onClick={() => setF('type', id)} style={{
                  textAlign: 'left', padding: '11px 13px', borderRadius: T.r, cursor: 'pointer', fontFamily: T.fBody,
                  background: form.type === id ? T.accent.soft : T.paper, border: `1.5px solid ${form.type === id ? T.accent.base : T.line}`,
                } as React.CSSProperties}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: form.type === id ? T.accent.text : T.ink }}>{lbl}</div>
                  <div style={{ fontSize: 10.5, color: T.inkSub, marginTop: 2 }}>{sub}</div>
                </button>
              ))}
            </div>
          </div>

          <FormGrid>
            <Field T={T} label="Product photo" full>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 70, height: 70, borderRadius: T.r, flexShrink: 0, border: `1.5px solid ${T.line}`, background: swatchBg(form), position: 'relative' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} />
                  <Btn T={T} kind="ghost" onClick={() => fileRef.current && fileRef.current.click()}>{form.img ? '↻ Replace photo' : '⍑ Upload photo'}</Btn>
                  {form.img
                    ? <button onClick={() => setF('img', null)} style={{ background: 'none', border: 'none', color: T.redText, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: T.fBody } as React.CSSProperties}>Remove photo</button>
                    : <span style={{ fontSize: 11.5, color: T.inkMute }}>Falls back to the tile colour below.</span>}
                </div>
              </div>
            </Field>
            <Field T={T} label="Product name" full><TextField T={T} value={form.name} onChange={(v: any) => setF('name', v)} placeholder="e.g. Basmati Rice 5kg" /></Field>

            <Field T={T} label={form.sku ? 'SKU' : 'SKU (auto-generated if blank)'}><TextField T={T} value={form.sku} onChange={(v: any) => setF('sku', v)} placeholder="Scan barcode or leave blank" /></Field>
            <Field T={T} label="Category"><SelectField T={T} value={form.cat} options={cats.map((c: any) => c.id)} onChange={(v: any) => setF('cat', v)} /></Field>
            <Field T={T} label="Brand">
              <SelectField T={T} value={String(form.brand_id)} options={[{ v: '', l: '— None —' }, ...refs.brands.map((b: any) => ({ v: String(b.id), l: b.name }))].map((o: any) => o.v)} onChange={(v: any) => setF('brand_id', v)}
                render={(v: any) => (refs.brands.find((b: any) => String(b.id) === v) || {}).name || '— None —'} />
            </Field>
            <Field T={T} label="Unit"><SelectField T={T} value={form.unit} options={refs.units.map((u: any) => u.short_name)} onChange={(v: any) => setF('unit', v)} /></Field>
            <Field T={T} label="Applicable tax"><SelectField T={T} value={String(form.tax_id)} options={refs.taxRates.map((t: any) => String(t.id))} onChange={(v: any) => setF('tax_id', v)} render={(v: any) => (refs.taxRates.find((t: any) => String(t.id) === v) || {}).name || 'None'} /></Field>
            <Field T={T} label="Alert quantity"><TextField T={T} type="number" value={form.alert_quantity} onChange={(v: any) => setF('alert_quantity', v)} placeholder="Low-stock threshold" /></Field>

            {/* toggles */}
            <Field T={T} label="Inventory options" full>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                {form.type !== 'combo' && <Toggle T={T} on={form.enable_stock} onChange={(v: any) => setF('enable_stock', v)} label="Manage stock" hint="Off = sell unlimited (services)" />}
                <Toggle T={T} on={form.not_for_selling} onChange={(v: any) => setF('not_for_selling', v)} label="Not for selling" hint="Hide from POS & Sales" />
              </div>
            </Field>

            {/* SINGLE pricing */}
            {form.type === 'single' && <>
              <Field T={T} label="Cost price ($)"><TextField T={T} type="number" value={form.cost} onChange={(v: any) => setF('cost', v)} placeholder="0.00" /></Field>
              <Field T={T} label="Selling price ($)"><TextField T={T} type="number" value={form.price} onChange={(v: any) => setF('price', v)} placeholder="0.00" /></Field>
              {form.enable_stock && <Field T={T} label="Opening stock"><TextField T={T} type="number" value={form.stock} onChange={(v: any) => setF('stock', v)} placeholder="0" /></Field>}
              <Field T={T} label="Margin"><div style={{ padding: '10px 13px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}`, fontSize: 14, fontFamily: T.fMono, color: marginOf(form) >= 0 ? T.greenText : T.redText }}>{form.price && form.cost ? marginOf(form) + '%' : '—'}</div></Field>
            </>}
          </FormGrid>

          {/* VARIABLE */}
          {form.type === 'variable' && (
            <div style={{ marginTop: 16 }}>
              <Field T={T} label="Variation template" full>
                <SelectField T={T} value={form.var_template_id} options={['', ...refs.variations.map((v: any) => String(v.id))]} onChange={applyTemplate}
                  render={(v: any) => v ? (refs.variations.find((t: any) => String(t.id) === v) || {}).name + ' — ' + ((refs.variations.find((t: any) => String(t.id) === v) || {}).values || []).map((x: any) => x.name).join(', ') : 'Choose a template…'} />
              </Field>
              {form.variations.length > 0 && (
                <div style={{ marginTop: 12, border: `1px solid ${T.line}`, borderRadius: T.rLg, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 0, background: T.paperAlt, padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub } as React.CSSProperties}>
                    <span>Variation</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>Cost <FillBtn T={T} onClick={() => fillDown('cost')} /></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>Price <FillBtn T={T} onClick={() => fillDown('price')} /></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>Stock <FillBtn T={T} onClick={() => fillDown('stock')} /></span>
                  </div>
                  {form.variations.map((v: any, i: number) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 8, padding: '8px 12px', borderTop: `1px solid ${T.line}`, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{v.name}</span>
                      <MiniInp T={T} value={v.cost} onChange={(e: any) => setVarRow(i, 'cost', e.target.value)} placeholder="0.00" />
                      <MiniInp T={T} value={v.price} onChange={(e: any) => setVarRow(i, 'price', e.target.value)} placeholder="0.00" />
                      <MiniInp T={T} value={v.stock} onChange={(e: any) => setVarRow(i, 'stock', e.target.value)} placeholder="0" />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: T.inkMute, marginTop: 7 }}>Manage templates from the <b style={{ cursor: 'pointer', color: T.accent.text }} onClick={() => setVarMgr(true)}>Variations</b> button. The ⊕ icons copy the first row's value to all.</div>
            </div>
          )}

          {/* COMBO */}
          {form.type === 'combo' && (
            <div style={{ marginTop: 16 }}>
              <Field T={T} label="Combo selling price ($)"><div style={{ maxWidth: 200 }}><TextField T={T} type="number" value={form.price} onChange={(v: any) => setF('price', v)} placeholder="0.00" /></div></Field>
              <div style={{ marginTop: 12, marginBottom: 8, fontSize: 11.5, fontWeight: 700, color: T.inkSub }}>Products in this combo</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form.combo.map((c: any, i: number) => {
                  const p = list.find((x: any) => x.id === c.product_id) || PRODUCTS.find((x: any) => x.id === c.product_id);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
                      <select value={c.product_id} onChange={e => setComboRow(i, 'product_id', e.target.value)} style={{ flex: 1, padding: '8px 10px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none' }}>
                        {list.filter((x: any) => x.type !== 'combo').map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      <span style={{ fontSize: 11, color: T.inkSub }}>Qty</span>
                      <MiniInp T={T} value={c.qty} onChange={(e: any) => setComboRow(i, 'qty', e.target.value)} style={{ width: 56 }} />
                      <button onClick={() => rmCombo(i)} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.redSoft}`, background: T.redSoft, color: T.redText, cursor: 'pointer', fontSize: 13 }}>✕</button>
                    </div>
                  );
                })}
                <Btn T={T} kind="ghost" onClick={addCombo} style={{ alignSelf: 'flex-start' }}>+ Add product</Btn>
              </div>
              <div style={{ fontSize: 11, color: T.inkMute, marginTop: 9, lineHeight: 1.5 }}>Combo stock is the lowest available among its products. Selling a combo deducts each component's stock.</div>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <Field T={T} label="Tile colour" full>
              <div style={{ display: 'flex', gap: 8 }}>
                {SWATCHES.map((c: any) => (
                  <button key={c} onClick={() => setF('sw', c)} style={{ width: 32, height: 32, borderRadius: 9, cursor: 'pointer', background: `linear-gradient(135deg, ${c}, ${c}cc)`, border: form.sw === c ? `2.5px solid ${T.ink}` : `2px solid ${T.line}` }} />
                ))}
              </div>
            </Field>
          </div>

          {formErr && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 14 }}>⚠</span>{formErr}</div>}
        </Modal>
      )}

      {unitMgr && <UnitManager T={T} units={refs.units} onClose={() => setUnitMgr(false)} onChange={loadRefs} toast={toast} />}
      {pgMgr && <PriceGroupManager T={T} groups={refs.priceGroups} onClose={() => setPgMgr(false)} onChange={loadRefs} toast={toast} />}
      {varMgr && <VariationManager T={T} templates={refs.variations} onClose={() => setVarMgr(false)} onChange={loadRefs} toast={toast} />}
      {impExp && <ImportExport T={T} onClose={() => setImpExp(false)} onImported={reload} toast={toast} />}
      {labels && <PrintLabels T={T} initial={sel ? [sel] : []} onClose={() => setLabels(false)} />}
      {confirmDel && (
        <Modal T={T} title="Delete product?" subtitle={confirmDel.name} width={420} onClose={() => setConfirmDel(null)} onSave={() => doDelete(confirmDel)} saveLabel="Delete">
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>This removes <b style={{ color: T.ink }}>{confirmDel.name}</b> from your catalog. Products with sales or stock history can't be deleted.</div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}

function marginOf(f: any) { const p = parseFloat(f.price || 0), c = parseFloat(f.cost || 0); return p ? Math.round(((p - c) / p) * 100) : 0; }
function Toggle({ T, on, onChange, label, hint }: any) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' } as React.CSSProperties}>
      <span style={{ width: 40, height: 23, borderRadius: 99, background: on ? T.accent.base : T.lineMid, position: 'relative', flexShrink: 0, transition: 'background .18s' }}>
        <span style={{ position: 'absolute', top: 2.5, left: on ? 19 : 2.5, width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
      </span>
      <span><span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.inkMid }}>{label}</span><span style={{ display: 'block', fontSize: 10.5, color: T.inkSub }}>{hint}</span></span>
    </button>
  );
}
function MiniInp({ T, style, ...p }: any) {
  return <input {...p} type="number" style={{ width: '100%', padding: '7px 9px', fontSize: 13, fontFamily: T.fMono, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none', boxSizing: 'border-box', ...style }} />;
}
function FillBtn({ T, onClick }: any) {
  return <button title="Copy first row to all" onClick={onClick} style={{ width: 18, height: 18, borderRadius: 5, border: `1px solid ${T.line}`, background: T.paper, color: T.accent.text, cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>⊕</button>;
}

// ── Units manager  /connector/api/unit ──────────────────────────────
function UnitManager({ T, units, onClose, onChange, toast }: any) {
  const [name, setName] = useStatePr('');
  const [short, setShort] = useStatePr('');
  const [dec, setDec] = useStatePr(false);
  const [busy, setBusy] = useStatePr(false);
  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try { await API.unit.create({ actual_name: name, short_name: short || name, allow_decimal: dec }); setName(''); setShort(''); setDec(false); onChange(); toast('Unit added'); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }
  async function del(u: any) { try { await API.unit.remove(u.id); onChange(); toast('Unit removed'); } catch (e: any) { toast(e.message); } }
  return (
    <Modal T={T} title="Units" subtitle="Measurement units for products" width={520} onClose={onClose} footer={null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {units.map((u: any) => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>{u.actual_name} <span style={{ color: T.inkSub, fontWeight: 400 }}>({u.short_name})</span></span>
            {u.base_unit_id && <Badge T={T} tone="blue">×{u.base_unit_multiplier}</Badge>}
            {u.allow_decimal ? <Badge T={T} tone="gray">decimals</Badge> : null}
            <button onClick={() => del(u)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Unit name</div><TextField T={T} value={name} onChange={setName} placeholder="e.g. Carton" /></div>
        <div style={{ width: 100 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Short</div><TextField T={T} value={short} onChange={setShort} placeholder="ctn" /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.inkSub, cursor: 'pointer', paddingBottom: 11 }}><input type="checkbox" checked={dec} onChange={e => setDec(e.target.checked)} style={{ accentColor: T.accent.base }} />Decimals</label>
        <Btn T={T} kind="accent" onClick={add} disabled={busy}>Add</Btn>
      </div>
    </Modal>
  );
}

// ── Price-group manager  /connector/api/selling-price-group ─────────
function PriceGroupManager({ T, groups, onClose, onChange, toast }: any) {
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
function VariationManager({ T, templates, onClose, onChange, toast }: any) {
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

function MiniStat({ T, label, value, tone }: any) {
  return (
    <div style={{ background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r, padding: '11px 13px' }}>
      <div style={{ fontSize: 10, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 } as React.CSSProperties}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: tone || T.ink, fontFamily: T.fMono, marginTop: 4, letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Print Labels — the manual's barcode-label tool. Pick products and
// quantities, choose which info to show, preview a label sheet, print.
// Pure client-side (works on the live catalog); no API needed.
// ─────────────────────────────────────────────────────────────────
const { useState: useStateLb } = React;

// deterministic Code128-ish bar pattern from a string (visual only)
function barsFor(code: any) {
  let seed = 0; const s = String(code || 'SKU');
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  const bars = []; let x = seed;
  for (let i = 0; i < 34; i++) { x = (x * 1103515245 + 12345) >>> 0; bars.push({ w: 1 + (x % 3), on: i % 2 === 0 }); }
  return bars;
}
function Barcode({ code, height = 34, color = '#111' }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, height }}>
      {barsFor(code).map((b: any, i: number) => (
        <span key={i} style={{ width: b.w, height: '100%', background: b.on ? color : 'transparent' }} />
      ))}
    </div>
  );
}

function PrintLabels({ T, onClose, initial }: any) {
  const [items, setItems] = useStateLb(() => (initial || []).map((p: any) => ({ id: p.id, qty: 1 })));
  const [q, setQ] = useStateLb('');
  const [opts, setOpts] = useStateLb<any>({ business: true, name: true, price: true, sku: true });
  const [perRow, setPerRow] = useStateLb(3);

  const found = q.trim() ? PRODUCTS.filter((p: any) => p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  const add = (p: any) => { setItems((it: any) => it.find((x: any) => x.id === p.id) ? it : [...it, { id: p.id, qty: 1 }]); setQ(''); };
  const setQty = (id: any, v: any) => setItems((it: any) => it.map((x: any) => x.id === id ? { ...x, qty: Math.max(1, v) } : x));
  const rm = (id: any) => setItems((it: any) => it.filter((x: any) => x.id !== id));

  const labels: any[] = [];
  items.forEach((it: any) => { const p = PRODUCTS.find((p: any) => p.id === it.id); if (p) for (let i = 0; i < it.qty; i++) labels.push(p); });

  function doPrint() {
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    const cell = (p: any) => `<div style="border:1px dashed #ccc;border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;font-family:system-ui,sans-serif;">
      ${opts.business ? `<div style="font-size:9px;color:#666;font-weight:600;letter-spacing:.3px">${BUSINESS.name}</div>` : ''}
      ${opts.name ? `<div style="font-size:11px;font-weight:700;color:#111;line-height:1.15">${p.name}</div>` : ''}
      <div style="display:flex;align-items:flex-end;height:30px;margin:2px 0">${barsFor(p.sku).map((b: any) => `<span style="width:${b.w}px;height:100%;background:${b.on ? '#111' : 'transparent'}"></span>`).join('')}</div>
      ${opts.sku ? `<div style="font-size:9px;font-family:monospace;color:#333;letter-spacing:1px">${p.sku}</div>` : ''}
      ${opts.price ? `<div style="font-size:13px;font-weight:700;color:#111">$${p.price.toFixed(2)}</div>` : ''}
    </div>`;
    w.document.write(`<html><head><title>Labels — ${BUSINESS.name}</title></head><body style="margin:14px;background:#fff">
      <div style="display:grid;grid-template-columns:repeat(${perRow},1fr);gap:8px">${labels.map(cell).join('')}</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
      </body></html>`);
    w.document.close();
  }

  return (
    <Modal T={T} title="Print Labels" subtitle="Barcode labels for your products" width={720} onClose={onClose}
      footer={<><div style={{ flex: 1, fontSize: 13, color: T.inkSub }}>{labels.length} label{labels.length === 1 ? '' : 's'}</div><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={doPrint} disabled={!labels.length}>⎙ Print</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'min(100%, 280px) 1fr', gap: 18 }}>
        {/* left: add products + options */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 } as React.CSSProperties}>Products</div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or SKU…" style={{ width: '100%', padding: '9px 11px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box' }} />
            {found.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, background: T.paper, border: `1px solid ${T.line}`, borderRadius: T.r, boxShadow: T.sh2, overflow: 'hidden' }}>
                {found.map((p: any) => <button key={p.id} onClick={() => add(p)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', border: 'none', borderBottom: `1px solid ${T.line}`, background: T.paper, cursor: 'pointer', fontSize: 12.5, color: T.ink, fontFamily: T.fBody } as React.CSSProperties}>{p.name} <span style={{ color: T.inkSub, fontFamily: T.fMono, fontSize: 11 }}>{p.sku}</span></button>)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {items.length === 0 && <div style={{ fontSize: 12, color: T.inkMute, padding: '8px 0' }}>Search to add products.</div>}
            {items.map((it: any) => { const p = PRODUCTS.find((p: any) => p.id === it.id); if (!p) return null; return (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                <input type="number" value={it.qty} onChange={e => setQty(it.id, Number(e.target.value))} style={{ width: 50, padding: '5px 7px', fontSize: 12.5, fontFamily: T.fMono, textAlign: 'right', color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 6, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} />
                <button onClick={() => rm(it.id)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 11 }}>✕</button>
              </div>
            ); })}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 } as React.CSSProperties}>Show on label</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {([['business', 'Business name'], ['name', 'Product name'], ['price', 'Price'], ['sku', 'SKU / barcode']] as any[]).map(([k, lbl]: any) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.inkMid, cursor: 'pointer' }}>
                <input type="checkbox" checked={opts[k]} onChange={e => setOpts((o: any) => ({ ...o, [k]: e.target.checked }))} style={{ accentColor: T.accent.base, width: 15, height: 15 }} />{lbl}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: T.inkSub }}>Per row</span>
            <SelectField T={T} value={String(perRow)} options={['2', '3', '4', '5']} onChange={(v: any) => setPerRow(Number(v))} />
          </div>
        </div>

        {/* right: live preview */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 } as React.CSSProperties}>Preview</div>
          <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: T.r, padding: 12, minHeight: 220, maxHeight: 320, overflowY: 'auto' }}>
            {labels.length === 0 ? <div style={{ textAlign: 'center', color: T.inkMute, fontSize: 12.5, padding: '70px 0' }}>Add products to preview labels.</div> : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${perRow}, 1fr)`, gap: 8 }}>
                {labels.slice(0, 24).map((p: any, i: number) => (
                  <div key={i} style={{ border: '1px dashed #cbb', borderRadius: 6, padding: '8px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center' } as React.CSSProperties}>
                    {opts.business && <div style={{ fontSize: 8, color: '#888', fontWeight: 700 }}>{BUSINESS.name}</div>}
                    {opts.name && <div style={{ fontSize: 10, fontWeight: 700, color: '#111', lineHeight: 1.1 }}>{p.name}</div>}
                    <Barcode code={p.sku} height={26} />
                    {opts.sku && <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#444', letterSpacing: 1 }}>{p.sku}</div>}
                    {opts.price && <div style={{ fontSize: 12, fontWeight: 800, color: '#111' }}>${p.price.toFixed(2)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {labels.length > 24 && <div style={{ fontSize: 11, color: T.inkMute, marginTop: 6 }}>Showing first 24 — all {labels.length} print.</div>}
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────
// Import / Export products — the manual's bulk product tools.
// Export: download the catalog as CSV in the import-template format.
// Import: upload/paste CSV → validate per row (unit/category checks,
// like the manual's common errors) → create each via API.product.
// ─────────────────────────────────────────────────────────────────
const { useState: useStateIE, useEffect: useEffectIE } = React;

const IE_COLUMNS = ['Name', 'SKU', 'Category', 'Brand', 'Unit', 'Cost price', 'Selling price', 'Opening stock', 'Alert quantity', 'Product type'];

function csvEscape(v: any) { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function buildCatalogCSV(products: any, refs: any) {
  const catName = (id: any) => (CATEGORIES.find((c: any) => c.id === id) || {}).name || '';
  const brandName = (id: any) => (refs.brands.find((b: any) => b.id === id) || {}).name || '';
  const rows = products.map((p: any) => [p.name, p.sku, catName(p.cat), brandName(p.brand_id), p.unit, p.cost, p.price, p.stock === Infinity ? '' : p.stock, p.alert_quantity || 0, p.type || 'single']);
  return [IE_COLUMNS, ...rows].map((r: any) => r.map(csvEscape).join(',')).join('\n');
}
function downloadCSV(text: any, filename: any) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}
function parseCSV(text: any) {
  const rows: any[] = []; let row: any[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r: any) => r.some((c: any) => c.trim() !== ''));
}

function ImportExport({ T, onClose, onImported, toast }: any) {
  const [tab, setTab] = useStateIE('export');
  const [refs, setRefs] = useStateIE<any>({ brands: [], units: [] });
  const [raw, setRaw] = useStateIE('');
  const [parsed, setParsed] = useStateIE<any>(null);   // { rows: [{data, error}], valid }
  const [importing, setImporting] = useStateIE(false);
  const [result, setResult] = useStateIE<any>(null);
  const fileRef = React.useRef<any>(null);

  useEffectIE(() => { Promise.all([API.brand.list(), API.unit.list()]).then(([brands, units]: any) => setRefs({ brands, units })).catch(() => {}); }, []);

  function doExport() {
    downloadCSV(buildCatalogCSV(PRODUCTS, refs), 'balanzify-products.csv');
    toast('Catalog exported');
  }
  function downloadTemplate() {
    const sample = ['Basmati Rice 5kg', 'GRC-NEW', 'Grocery', 'Generic', 'kg', '6.20', '8.90', '40', '12', 'single'];
    downloadCSV([IE_COLUMNS, sample].map((r: any) => r.map(csvEscape).join(',')).join('\n'), 'balanzify-import-template.csv');
  }
  function onFile(e: any) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { setRaw(String(r.result)); validate(String(r.result)); }; r.readAsText(f); e.target.value = '';
  }
  function validate(text?: any) {
    const rows = parseCSV(text || raw);
    if (rows.length < 2) { setParsed({ rows: [], valid: 0, error: 'Need a header row and at least one product row.' }); return; }
    const header = rows[0].map((h: any) => h.trim().toLowerCase());
    const idx = (name: any) => header.findIndex((h: any) => h.includes(name));
    const ci: any = { name: idx('name'), sku: idx('sku'), cat: idx('categ'), brand: idx('brand'), unit: idx('unit'), cost: idx('cost'), price: idx('selling') >= 0 ? idx('selling') : idx('price'), stock: idx('stock'), alert: idx('alert'), type: idx('type') };
    const out = rows.slice(1).map((r: any) => {
      const get = (k: any) => ci[k] >= 0 ? (r[ci[k]] || '').trim() : '';
      const name = get('name');
      const catName = get('cat'), unitName = get('unit');
      const cat = CATEGORIES.find((c: any) => c.name.toLowerCase() === catName.toLowerCase());
      const unit = refs.units.find((u: any) => u.short_name.toLowerCase() === unitName.toLowerCase() || u.actual_name.toLowerCase() === unitName.toLowerCase());
      const brand = refs.brands.find((b: any) => b.name.toLowerCase() === get('brand').toLowerCase());
      let error = null;
      if (!name) error = 'Name is required';
      else if (catName && !cat) error = `Category “${catName}” not found`;
      else if (unitName && !unit) error = `Unit “${unitName}” not found`;
      else if (get('price') && isNaN(parseFloat(get('price')))) error = 'Selling price is not a number';
      const data = {
        type: (get('type') || 'single').toLowerCase(), name, sku: get('sku'),
        cat: cat ? cat.id : 'grocery', brand_id: brand ? brand.id : null, unit: unit ? unit.short_name : (unitName || 'Pc(s)'),
        cost: parseFloat(get('cost') || 0), price: parseFloat(get('price') || 0), stock: parseInt(get('stock') || 0), alert_quantity: parseInt(get('alert') || 0),
        enable_stock: true,
      };
      return { data, error, name: name || '(no name)', catName, unitName, price: data.price };
    });
    setParsed({ rows: out, valid: out.filter((r: any) => !r.error).length });
  }
  async function runImport() {
    if (!parsed) return;
    setImporting(true);
    let ok = 0, fail = 0;
    for (const r of parsed.rows) {
      if (r.error) { fail++; continue; }
      try { await API.product.create(r.data); ok++; } catch (e) { fail++; }
    }
    setImporting(false); setResult({ ok, fail });
    if (ok) { onImported && onImported(); toast(`Imported ${ok} product${ok === 1 ? '' : 's'}`); }
  }

  return (
    <Modal T={T} title="Import / Export products" subtitle="Bulk-manage your catalog" width={680} onClose={onClose} footer={null}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paperAlt, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
        {([['export', 'Export'], ['import', 'Import']] as any[]).map(([id, lbl]: any) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 20px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl}</button>
        ))}
      </div>

      {tab === 'export' && (
        <div>
          <div style={{ padding: '14px 16px', borderRadius: T.r, background: T.accent.soft, color: T.accent.text, fontSize: 12.5, lineHeight: 1.6, marginBottom: 18 }}>
            Exports all <b>{PRODUCTS.length}</b> products as a CSV using the same columns as the import template — so an export can be edited and re-imported.
          </div>
          <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 0, padding: '8px 12px', background: T.paperAlt, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, overflowX: 'auto', whiteSpace: 'nowrap' } as React.CSSProperties}>
              {IE_COLUMNS.map(c => <span key={c} style={{ marginRight: 18 }}>{c}</span>)}
            </div>
          </div>
          <Btn T={T} kind="accent" onClick={doExport}>⤓ Download CSV ({PRODUCTS.length} products)</Btn>
        </div>
      )}

      {tab === 'import' && (
        <div>
          {!result ? <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <Btn T={T} kind="ghost" onClick={downloadTemplate}>⤓ Download template</Btn>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
              <Btn T={T} kind="ghost" onClick={() => fileRef.current && fileRef.current.click()}>⍑ Upload CSV file</Btn>
            </div>
            <textarea value={raw} onChange={e => { setRaw(e.target.value); setParsed(null); }} placeholder="…or paste CSV here (Name, SKU, Category, Brand, Unit, Cost price, Selling price, Opening stock, Alert quantity, Product type)" style={{
              width: '100%', minHeight: 90, padding: '11px 13px', fontSize: 12, fontFamily: T.fMono, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5,
            } as React.CSSProperties} />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <Btn T={T} kind="ghost" onClick={() => validate()}>Preview</Btn>
              {parsed && parsed.valid > 0 && <Btn T={T} kind="accent" onClick={runImport} disabled={importing}>{importing ? 'Importing…' : `Import ${parsed.valid} product${parsed.valid === 1 ? '' : 's'}`}</Btn>}
            </div>

            {parsed && parsed.error && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {parsed.error}</div>}
            {parsed && parsed.rows.length > 0 && (
              <div style={{ marginTop: 16, border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.7fr 0.7fr 1.2fr', gap: 8, padding: '8px 12px', background: T.paperAlt, position: 'sticky', top: 0, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub } as React.CSSProperties}>
                  <span>Product</span><span>Category</span><span>Unit</span><span style={{ textAlign: 'right' }}>Price</span><span>Status</span>
                </div>
                {parsed.rows.map((r: any, i: number) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.7fr 0.7fr 1.2fr', gap: 8, padding: '8px 12px', borderTop: `1px solid ${T.line}`, fontSize: 12, alignItems: 'center', background: r.error ? T.redSoft + '55' : 'transparent' }}>
                    <span style={{ fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                    <span style={{ color: T.inkSub }}>{r.catName || '—'}</span>
                    <span style={{ color: T.inkSub }}>{r.unitName || '—'}</span>
                    <span style={{ textAlign: 'right', fontFamily: T.fMono, color: T.ink }}>{money(r.price)}</span>
                    <span>{r.error ? <span style={{ fontSize: 11, color: T.redText, fontWeight: 600 }}>{r.error}</span> : <Badge T={T} tone="green">Ready</Badge>}</span>
                  </div>
                ))}
              </div>
            )}
          </> : (
            <div style={{ textAlign: 'center', padding: '20px 10px' } as React.CSSProperties}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: T.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' }}>✓</div>
              <div style={{ fontFamily: T.fDisplay, fontSize: 22, fontWeight: T.dispWeight, color: T.ink, marginBottom: 6 }}>Import complete</div>
              <div style={{ fontSize: 13.5, color: T.inkSub, marginBottom: 20 }}><b style={{ color: T.greenText }}>{result.ok} added</b>{result.fail ? <> · <b style={{ color: T.redText }}>{result.fail} skipped</b></> : ''}</div>
              <Btn T={T} kind="accent" onClick={onClose}>Done</Btn>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
