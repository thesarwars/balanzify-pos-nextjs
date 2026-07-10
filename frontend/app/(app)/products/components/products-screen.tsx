'use client';
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast, useViewport, swatchBg } from '@/components/kit';
import { Topbar, useSession } from '@/components/shell';
import { money, qty } from '@/lib/theme';
import { getSetting, useBusinessSettings } from '@/lib/business-settings';
import { API } from '@/lib/api';
import { BUSINESS, CATEGORIES, PRODUCTS } from '@/lib/data';
import { marginOf, Toggle, MiniInp } from './form-bits';
import { UnitManager, PriceGroupManager, VariationManager } from './catalog-managers';
import { thStyle, tdStyle, FilterSel, ActionsMenu } from './list-table';
import { ViewProductModal, StockHistoryModal, OpeningStockModal } from './detail-modals';
import { PrintLabels } from './print-labels';
import { ImportExport } from './import-export';
import { StockReport } from './stock-report';

// ─────────────────────────────────────────────────────────────────
// Products — the data screen. Filter bar + table + slide-in detail.
// Demonstrates the redesigned table/detail vocabulary.
// ─────────────────────────────────────────────────────────────────
const { useState: useStatePr } = React;

export function Products({ T }: { T: any }) {
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
  const [refs, setRefs] = useStatePr<any>({ units: [], brands: [], variations: [], taxRates: [], priceGroups: [], cats: [], locations: [] });
  const [unitMgr, setUnitMgr] = useStatePr(false);
  const [varMgr, setVarMgr] = useStatePr(false);
  const [pgMgr, setPgMgr] = useStatePr(false);
  const [impExp, setImpExp] = useStatePr(false);
  const [labels, setLabels] = useStatePr(false);
  const [confirmDel, setConfirmDel] = useStatePr<any>(null);
  const [tab, setTab] = useStatePr('products'); // products | stock (Stock Report)
  // Filters bar + row actions + detail modals (reference product list parity).
  const [filtersOpen, setFiltersOpen] = useStatePr(true);
  const [fType, setFType] = useStatePr('');
  const [fBrand, setFBrand] = useStatePr('');
  const [fUnit, setFUnit] = useStatePr('');
  const [fTax, setFTax] = useStatePr('');
  const [fLoc, setFLoc] = useStatePr('');
  const [fNfs, setFNfs] = useStatePr(false);
  const [menuFor, setMenuFor] = useStatePr<any>(null);   // row id whose Actions menu is open
  const [viewProd, setViewProd] = useStatePr<any>(null);
  const [historyProd, setHistoryProd] = useStatePr<any>(null);
  const [openingProd, setOpeningProd] = useStatePr<any>(null);
  const [picked, setPicked] = useStatePr<any>(() => new Set());
  const [toast, toastNode] = useToast();
  const fileRef = React.useRef<any>(null);
  const brochureRef = React.useRef<any>(null);

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
    const safe = (fn: () => Promise<any>) => { try { return Promise.resolve(fn()).catch(() => []); } catch { return Promise.resolve([]); } };
    Promise.all([safe(() => API.unit.list()), safe(() => API.brand.list()), safe(() => API.variation.list()), safe(() => API.taxRate.list()), safe(() => API.priceGroup.list()), safe(() => API.category.list()), safe(() => API.location.list())])
      .then(([units, brands, variations, taxRates, priceGroups, cats, locations]: any) => setRefs({ units, brands, variations, taxRates, priceGroups, cats, locations }))
      .catch(() => {});
  }, []);
  React.useEffect(() => { loadRefs(); }, [loadRefs]);

  // Open a catalog tool (Units / Price Groups / Variations / Labels / Import)
  // when reached from the sidebar via /products?tool=…, then clear the param so
  // the modal can be reopened and the URL stays clean.
  const router = useRouter();
  const searchParams = useSearchParams();
  React.useEffect(() => {
    const tool = searchParams.get('tool');
    if (tool) {
      const openers: Record<string, (v: boolean) => void> = {
        units: setUnitMgr, 'price-groups': setPgMgr, variations: setVarMgr, labels: setLabels, import: setImpExp,
      };
      openers[tool]?.(true);
      router.replace('/products', { scroll: false });
      return;
    }
    // The active tab lives in the URL (?tab=stock) so refresh/links land right.
    const qtab = searchParams.get('tab');
    if (qtab === 'stock' || qtab === 'products') setTab(qtab);
  }, [searchParams, router]);
  const switchTab = (id: string) => { setTab(id); router.replace('/products' + (id === 'products' ? '' : '?tab=' + id), { scroll: false }); };

  function onPickImage(e: any) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Please choose an image file'); return; }
    const reader = new FileReader();
    reader.onload = () => setF('img', reader.result);
    reader.readAsDataURL(f);
    setF('_imgFile', f); // kept for the real S3 upload after save
    e.target.value = '';
  }
  async function onPickBrochure(e: any) {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const { url, key } = await API.upload.file(f);
      setForm((prev: any) => ({ ...prev, brochure_url: url, brochure_key: key }));
      toast('Brochure uploaded');
    } catch (ex: any) { toast(ex.message || 'Could not upload the brochure.'); }
  }

  let rows = list;
  if (q.trim()) { const s = q.toLowerCase(); rows = rows.filter((p: any) => p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s)); }
  if (cat) rows = rows.filter((p: any) => p.cat === cat);
  if (fType) rows = rows.filter((p: any) => (p.type || 'single') === fType);
  if (fBrand) rows = rows.filter((p: any) => String(p.brand_id) === String(fBrand));
  if (fUnit) rows = rows.filter((p: any) => p.unit === fUnit);
  if (fTax) rows = rows.filter((p: any) => String(p.tax_id || '') === String(fTax));
  if (fLoc) rows = rows.filter((p: any) => !Array.isArray(p.location_ids) || !p.location_ids.length || p.location_ids.some((id: any) => String(id) === String(fLoc)));
  if (fNfs) rows = rows.filter((p: any) => p.not_for_selling === true);
  if (lowOnly) rows = rows.filter((p: any) => p.stock <= (p.alert_quantity || 12));

  // Live categories in real mode; seed list is the mock fallback.
  // Real mode: show only real categories (mock seed categories silently drop on
  // save because they have no backend UUID). Mock mode keeps the seed list.
  const cats = (refs.cats && refs.cats.length) ? refs.cats : (API.config?.isReal?.() ? [] : CATEGORIES.filter((c: any) => c.id !== 'all'));
  const stockTone = (n: number) => n <= 0 ? 'red' : n <= 12 ? 'amber' : 'green';
  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const SWATCHES = ['#E7B85C', '#7FB7D6', '#C0504D', '#5B8A4C', '#D9C9A3', '#9AC0CB', '#B5793F', '#7A4A2B'];

  useBusinessSettings();   // re-render the form when Business Settings change
  // `default_unit_id` (Business Settings) picks the unit for a new product.
  const defaultUnitShortName = () => {
    const id = getSetting<string | null>('default_unit_id', null);
    const byId = id ? refs.units.find((u: any) => String(u.id) === String(id)) : null;
    return (byId || refs.units[0] || {}).short_name || 'Pc(s)';
  };
  const blankForm = () => ({
    // Business Settings seed the new-product defaults.
    type: 'single', name: '', sku: '', sku_prefix: getSetting<string>('sku_prefix', '') || '', cat: '',
    unit: defaultUnitShortName(), brand_id: '', tax_id: 0,
    alert_quantity: '', enable_stock: true, not_for_selling: false,
    price: '', cost: '', stock: '',
    var_sku_format: 'number', varGroups: [], combo: [],
    sw: SWATCHES[Math.floor(Math.random() * SWATCHES.length)], img: null, _imgFile: null,
    barcode: '', barcode_type: 'C128', weight: '', prep_time_minutes: '',
    is_serialized: false, selling_price_tax_type: 'exclusive',
    location_ids: [], description: '', brochure_url: '', brochure_key: '',
  });
  function openNew() {
    setEditing(null); setFormErr(null);
    setForm(blankForm());
    setOpen(true);
  }
  async function openEdit(p: any) {
    setEditing(p); setFormErr(null);
    setForm({
      type: p.type || 'single', name: p.name, sku: p.sku, sku_prefix: '', cat: p.cat,
      unit: p.unit, brand_id: p.brand_id || '', tax_id: p.tax_id || 0,
      alert_quantity: p.alert_quantity ? String(p.alert_quantity) : '',
      enable_stock: p.enable_stock !== false, not_for_selling: !!p.not_for_selling,
      price: String(p.price ?? ''), cost: String(p.cost ?? ''), stock: p.stock === Infinity ? '' : String(p.stock ?? ''),
      var_sku_format: 'number', varGroups: [],
      combo: (p.combo || []).map((c: any) => ({ ...c })), sw: p.sw, img: p.img || null, _imgFile: null,
      barcode: p.barcode || '', barcode_type: p.barcode_type || 'C128',
      weight: p.weight != null && p.weight !== '' ? String(p.weight) : '',
      prep_time_minutes: p.prep_time_minutes != null && p.prep_time_minutes !== '' ? String(p.prep_time_minutes) : '',
      is_serialized: !!p.is_serialized, selling_price_tax_type: p.selling_price_tax_type || 'exclusive',
      location_ids: Array.isArray(p.location_ids) ? [...p.location_ids] : [],
      description: p.description || '', brochure_url: p.brochure_url || '', brochure_key: p.brochure_key || '',
    });
    setOpen(true);
    // Rebuild variation groups from the product's real variants (grouped by attribute key).
    if (p.type === 'variable' && API.config?.isReal?.()) {
      try {
        const variants = await API.productVariant.list(p.id);
        const byKey: Record<string, any[]> = {};
        for (const v of variants) {
          const key = Object.keys(v.attributes || {})[0] || 'Variation';
          const value = (v.attributes || {})[key] || '';
          (byKey[key] = byKey[key] || []).push({ id: v.id, value, sku: v.sku || '', cost: String(v.cost || ''), price: String(v.price || ''), margin: recalcMargin(v.cost, v.price) });
        }
        const varGroups = Object.entries(byKey).map(([name, values]) => ({ name, template_id: '', values }));
        setForm((f: any) => ({ ...f, varGroups }));
      } catch {}
    }
  }

  // variable-product helpers — reference-style multi-group variation editor.
  // Each group is one attribute (Size / Colour); each value row → one variant.
  const recalcPrice = (cost: any, margin: any) => { const c = parseFloat(cost), m = parseFloat(margin); return (isFinite(c) && isFinite(m)) ? String(+(c * (1 + m / 100)).toFixed(2)) : ''; };
  const recalcMargin = (cost: any, price: any) => { const c = parseFloat(cost), p = parseFloat(price); return (isFinite(c) && c > 0 && isFinite(p)) ? String(+(((p - c) / c) * 100).toFixed(2)) : ''; };
  const blankVal = () => ({ value: '', sku: '', cost: '', margin: '25', price: '' });
  const addVarGroup = () => setForm((f: any) => ({ ...f, varGroups: [...f.varGroups, { name: '', template_id: '', values: [blankVal()] }] }));
  const rmVarGroup = (gi: number) => setForm((f: any) => ({ ...f, varGroups: f.varGroups.filter((_: any, j: number) => j !== gi) }));
  const pickGroupTemplate = (gi: number, tid: any) => setForm((f: any) => ({ ...f, varGroups: f.varGroups.map((g: any, j: number) => {
    if (j !== gi) return g;
    const t = refs.variations.find((v: any) => String(v.id) === String(tid));
    return t ? { ...g, template_id: tid, name: t.name, values: t.values.map((val: any) => ({ ...blankVal(), value: val.name })) } : { ...g, template_id: '' };
  }) }));
  const setGroupName = (gi: number, name: any) => setForm((f: any) => ({ ...f, varGroups: f.varGroups.map((g: any, j: number) => j === gi ? { ...g, name } : g) }));
  const addVarValue = (gi: number) => setForm((f: any) => ({ ...f, varGroups: f.varGroups.map((g: any, j: number) => j === gi ? { ...g, values: [...g.values, blankVal()] } : g) }));
  const rmVarValue = (gi: number, vi: number) => setForm((f: any) => ({ ...f, varGroups: f.varGroups.map((g: any, j: number) => j === gi ? { ...g, values: g.values.filter((_: any, k: number) => k !== vi) } : g) }));
  const setVarValue = (gi: number, vi: number, k: string, val: any) => setForm((f: any) => ({ ...f, varGroups: f.varGroups.map((g: any, j: number) => {
    if (j !== gi) return g;
    return { ...g, values: g.values.map((row: any, m: number) => {
      if (m !== vi) return row;
      const next: any = { ...row, [k]: val };
      if (k === 'cost' || k === 'margin') next.price = recalcPrice(k === 'cost' ? val : next.cost, k === 'margin' ? val : next.margin);
      else if (k === 'price') next.margin = recalcMargin(next.cost, val);
      return next;
    }) };
  }) }));
  // Auto-SKU for a value when left blank, honouring the chosen format.
  const autoSku = (base: string, value: string, seq: number) => form.var_sku_format === 'variation'
    ? `${base || 'SKU'}${String(value || '').trim().split(/\s+/).map((w: string) => w[0] || '').join('').toUpperCase()}`
    : `${base || 'SKU'}-${seq}`;
  // combo helpers
  const addCombo = () => setForm((f: any) => ({ ...f, combo: [...f.combo, { product_id: (list[0] || {}).id, qty: 1 }] }));
  const setComboRow = (i: number, k: string, v: any) => setForm((f: any) => ({ ...f, combo: f.combo.map((row: any, j: number) => j === i ? { ...row, [k]: v } : row) }));
  const rmCombo = (i: number) => setForm((f: any) => ({ ...f, combo: f.combo.filter((_: any, j: number) => j !== i) }));

  function validate() {
    if (!form.name.trim()) return 'Product name is required.';
    if (form.type === 'single' && form.enable_stock && form.price === '') return 'Enter a selling price.';
    if (form.type === 'variable') {
      const allValues = form.varGroups.flatMap((g: any) => g.values);
      if (!form.varGroups.length || !allValues.length) return 'Add at least one variation value.';
      if (form.varGroups.some((g: any) => !g.name.trim())) return 'Give each variation a name.';
      if (allValues.some((v: any) => !String(v.value).trim())) return 'Each variation value needs a name.';
      if (allValues.some((v: any) => v.price === '' || v.price == null)) return 'Each variation value needs a selling price.';
    }
    if (form.type === 'combo' && !form.combo.length) return 'Add at least one product to the combo.';
    return null;
  }
  async function save(andAnother = false) {
    const err = validate();
    if (err) { setFormErr(err); return; }
    // Business Settings → "Is product image required?"
    if (getSetting('product_image_required', false) && !form.img && !form._imgFile) {
      setFormErr('A product image is required.'); return;
    }
    setFormErr(null); setSaving(true);
    const payload = {
      type: form.type, name: form.name.trim(), sku: form.sku.trim(), sku_prefix: form.sku_prefix,
      cat: form.cat, unit: form.unit, sw: form.sw, img: form.img,
      brand_id: form.brand_id ? (/^\d+$/.test(String(form.brand_id)) ? Number(form.brand_id) : form.brand_id) : null, tax_id: form.tax_id || 0,
      alert_quantity: Number(form.alert_quantity || 0),
      enable_stock: form.type === 'combo' ? true : form.enable_stock, not_for_selling: form.not_for_selling,
      // For variable products the base price/cost mirror the first variant (variants carry the real prices).
      price: form.type === 'variable' ? parseFloat(form.varGroups[0]?.values[0]?.price || 0) : parseFloat(form.price || 0),
      cost: form.type === 'variable' ? parseFloat(form.varGroups[0]?.values[0]?.cost || 0) : parseFloat(form.cost || 0),
      stock: parseInt(form.stock || 0),
      combo: form.combo,
      barcode: form.barcode, barcode_type: form.barcode_type,
      weight: form.weight, prep_time_minutes: form.prep_time_minutes,
      is_serialized: form.is_serialized, selling_price_tax_type: form.selling_price_tax_type,
      location_ids: form.location_ids, description: form.description,
      brochure_url: form.brochure_url, brochure_key: form.brochure_key,
    };
    try {
      let savedId: any = editing && editing.id;
      if (editing) { const up = await API.product.update(editing.id, payload); if (sel && sel.id === editing.id) setSel(up); }
      else { const created = await API.product.create(payload); savedId = created && created.id; }
      // Real photo upload (S3) — the dataURL preview is only local.
      if (savedId && API.config?.isReal?.()) {
        try {
          if (form._imgFile) await API.upload.productImage(savedId, form._imgFile);
          else if (editing && editing.img && !form.img) await API.upload.removeProductImage(savedId);
        } catch { toast('Product saved, but the photo upload failed.'); }
      }
      // Sync variants for variable products (create / update / delete against the
      // existing set), each value row → one variant with attributes { name: value }.
      if (form.type === 'variable' && savedId && API.config?.isReal?.()) {
        try {
          const base = (form.sku || '').trim() || 'SKU';
          let seq = 0;
          const desired = form.varGroups.flatMap((g: any) => g.values.map((v: any) => {
            seq++;
            return { id: v.id, attributes: { [g.name.trim() || 'Variation']: String(v.value).trim() }, sku: (v.sku || '').trim() || autoSku(base, v.value, seq), cost: parseFloat(v.cost || 0), price: parseFloat(v.price || 0) };
          }));
          const existing = editing ? await API.productVariant.list(savedId).catch(() => []) : [];
          const desiredIds = new Set(desired.filter((d: any) => d.id).map((d: any) => d.id));
          for (const ex of existing) { if (!desiredIds.has(ex.id)) { try { await API.productVariant.remove(savedId, ex.id); } catch {} } }
          for (const d of desired) { try { d.id ? await API.productVariant.update(savedId, d.id, d) : await API.productVariant.create(savedId, d); } catch {} }
        } catch { toast('Product saved, but syncing variations failed.'); }
      }
      toast(editing ? 'Product updated' : 'Product created');
      if (andAnother) { setEditing(null); setForm(blankForm()); }
      else setOpen(false);
      reload();
    } catch (ex: any) { setFormErr(ex.message || 'Could not save the product.'); }
    finally { setSaving(false); }
  }
  async function doDelete(p: any) {
    try {
      if (p.bulk) {
        for (const id of p.bulk) { try { await API.product.remove(id); } catch {} }
        setConfirmDel(null); setPicked(new Set()); toast(`${p.bulk.length} product${p.bulk.length === 1 ? '' : 's'} deleted`); reload(); return;
      }
      await API.product.remove(p.id); setConfirmDel(null); if (sel && sel.id === p.id) setSel(null); toast('Product deleted'); reload();
    } catch (ex: any) { setConfirmDel(null); toast(ex.message || 'Delete failed'); }
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
            {/* tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
              {[['products', '⊞ All Products'], ['stock', '◱ Stock Report']].map(([id, lbl]: any) => (
                <button key={id} onClick={() => switchTab(id)} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid } as React.CSSProperties}>{lbl}</button>
              ))}
            </div>

            {tab === 'stock' && <StockReport T={T} list={list} onHistory={(r: any) => setHistoryProd({ id: r.product_id, name: r.product, unit: r.unit, stock: r.current_stock })} />}

            {tab === 'products' && <>
            {/* ── Filters ── */}
            <Panel T={T} pad={false} style={{ marginBottom: 16 }}>
              <button onClick={() => setFiltersOpen((o: boolean) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.fBody } as React.CSSProperties}>
                <span style={{ color: T.accent.text, fontSize: 14 }}>⛃</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Filters</span>
                <span style={{ flex: 1 }} />
                {(fType || cat || fBrand || fUnit || fTax || fLoc || fNfs) && <Badge T={T} tone="brass">Active</Badge>}
                <span style={{ fontSize: 11, color: T.inkSub, transition: 'transform .15s', transform: filtersOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
              </button>
              {filtersOpen && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, padding: '4px 16px 16px' }}>
                  <FilterSel T={T} label="Product Type" value={fType} onChange={setFType} options={[['', 'All'], ['single', 'Single'], ['variable', 'Variable'], ['combo', 'Combo']]} />
                  <FilterSel T={T} label="Category" value={cat} onChange={setCat} options={[['', 'All'], ...cats.map((c: any) => [c.id, c.name])]} />
                  <FilterSel T={T} label="Brand" value={fBrand} onChange={setFBrand} options={[['', 'All'], ...refs.brands.map((b: any) => [String(b.id), b.name])]} />
                  <FilterSel T={T} label="Unit" value={fUnit} onChange={setFUnit} options={[['', 'All'], ...refs.units.map((u: any) => [u.short_name, u.short_name])]} />
                  <FilterSel T={T} label="Tax" value={fTax} onChange={setFTax} options={[['', 'All'], ...refs.taxRates.map((t: any) => [String(t.id), t.name])]} />
                  <FilterSel T={T} label="Business Location" value={fLoc} onChange={setFLoc} options={[['', 'All'], ...refs.locations.map((l: any) => [String(l.id), l.name])]} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.inkMid, cursor: 'pointer', alignSelf: 'end', paddingBottom: 8 }}>
                    <input type="checkbox" checked={fNfs} onChange={e => setFNfs(e.target.checked)} style={{ accentColor: T.accent.base, width: 15, height: 15 }} />Not for selling
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.inkMid, cursor: 'pointer', alignSelf: 'end', paddingBottom: 8 }}>
                    <input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} style={{ accentColor: T.accent.base, width: 15, height: 15 }} />Low stock only
                  </label>
                </div>
              )}
            </Panel>

            <Panel T={T} pad={false}>
              {/* toolbar: search + bulk actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.inkMute, fontSize: 14 }}>⌕</span>
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or SKU…" style={{
                    width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, fontFamily: T.fBody, color: T.ink,
                    background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box',
                  }} />
                </div>
                <span style={{ flex: 1 }} />
                {picked.size > 0 && <>
                  <span style={{ fontSize: 12.5, color: T.inkSub }}>{picked.size} selected</span>
                  <Btn T={T} kind="ghost" onClick={() => setLabels(true)}>⌗ Labels</Btn>
                  <Btn T={T} kind="ghost" style={{ color: T.redText }} onClick={() => setConfirmDel({ bulk: [...picked] })}>Delete</Btn>
                </>}
                <span style={{ fontSize: 12, color: T.inkSub }}>{rows.length} of {list.length}</span>
              </div>

              {/* table */}
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>
                  <th style={thStyle(T, 'l', 40)}><input type="checkbox" checked={rows.length > 0 && rows.every((p: any) => picked.has(p.id))} onChange={e => { const n = new Set(picked); if (e.target.checked) rows.forEach((p: any) => n.add(p.id)); else rows.forEach((p: any) => n.delete(p.id)); setPicked(n); }} style={{ accentColor: T.accent.base }} /></th>
                  <th style={thStyle(T, 'l')}>Image</th>
                  <th style={thStyle(T, 'l')}>Action</th>
                  <th style={thStyle(T, 'l')}>Product</th>
                  <th style={thStyle(T, 'l')}>Location</th>
                  <th style={thStyle(T, 'r')}>Purchase</th>
                  <th style={thStyle(T, 'r')}>Selling</th>
                  <th style={thStyle(T, 'r')}>Stock</th>
                  <th style={thStyle(T, 'l')}>Type</th>
                  <th style={thStyle(T, 'l')}>Category</th>
                  <th style={thStyle(T, 'l')}>Brand</th>
                  <th style={thStyle(T, 'l')}>Tax</th>
                  <th style={thStyle(T, 'l')}>SKU</th>
                </tr></thead>
                <tbody>
                  {rows.map((p: any) => {
                    const typeTag = p.type === 'variable' ? ['Variable', 'violet'] : p.type === 'combo' ? ['Combo', 'blue'] : ['Single', 'gray'];
                    const locNames = (Array.isArray(p.location_ids) && p.location_ids.length)
                      ? p.location_ids.map((id: any) => (refs.locations.find((l: any) => String(l.id) === String(id)) || {}).name).filter(Boolean).join(', ')
                      : 'All locations';
                    const taxName = (refs.taxRates.find((t: any) => String(t.id) === String(p.tax_id)) || {}).name || '—';
                    const catName = p.category_name || cats.find((c: any) => c.id === p.cat)?.name;
                    return (
                      <tr key={p.id} style={{ transition: 'background .12s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = T.paperAlt; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <td style={tdStyle(T)}><input type="checkbox" checked={picked.has(p.id)} onChange={e => { const n = new Set(picked); e.target.checked ? n.add(p.id) : n.delete(p.id); setPicked(n); }} style={{ accentColor: T.accent.base }} /></td>
                        <td style={tdStyle(T)}><span style={{ width: 34, height: 34, borderRadius: 8, display: 'block', background: swatchBg(p), border: p.img ? `1px solid ${T.line}` : 'none', backgroundSize: 'cover' } as React.CSSProperties} /></td>
                        <td style={tdStyle(T)}>
                          <ActionsMenu T={T} open={menuFor === p.id} onToggle={() => setMenuFor(menuFor === p.id ? null : p.id)}
                            items={[
                              { label: '⌗ Labels', on: () => { setSel(p); setLabels(true); } },
                              { label: '◉ View', on: () => setViewProd(p) },
                              { label: '✎ Edit', on: () => openEdit(p) },
                              { label: '🗑 Delete', on: () => setConfirmDel(p), danger: true },
                              { sep: true },
                              { label: '▤ Add/edit opening stock', on: () => setOpeningProd(p) },
                              { label: '↻ Product stock history', on: () => setHistoryProd(p) },
                              { label: '⧉ Duplicate product', on: () => duplicate(p) },
                            ]} />
                        </td>
                        <td style={tdStyle(T)}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, display: 'inline-flex', alignItems: 'center', gap: 7 }}>{p.name}{p.rx && <Badge T={T} tone="blue">Rx</Badge>}{p.not_for_selling && <Badge T={T} tone="gray">Not for sale</Badge>}</span>
                        </td>
                        <td style={{ ...tdStyle(T), fontSize: 12, color: T.inkMid, maxWidth: 160 }}>{locNames}</td>
                        <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{money(p.cost)}</td>
                        <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{money(p.price)}</td>
                        <td style={{ ...tdStyle(T), textAlign: 'right' }}>{p.stock === Infinity || p.enable_stock === false ? <Badge T={T} tone="gray">∞</Badge> : <Badge T={T} tone={stockTone(p.stock) as any}>{qty(p.stock)} {p.unit}</Badge>}</td>
                        <td style={tdStyle(T)}><Badge T={T} tone={typeTag[1] as any}>{typeTag[0]}</Badge></td>
                        <td style={tdStyle(T)}>{catName ? <Badge T={T} tone="gray">{catName}</Badge> : <span style={{ color: T.inkMute }}>—</span>}</td>
                        <td style={{ ...tdStyle(T), fontSize: 12.5, color: T.inkMid }}>{p.brand_name || (refs.brands.find((b: any) => String(b.id) === String(p.brand_id)) || {}).name || '—'}</td>
                        <td style={{ ...tdStyle(T), fontSize: 12, color: T.inkSub }}>{taxName}</td>
                        <td style={{ ...tdStyle(T), fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{p.sku}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              {rows.length === 0 && !loading && <div style={{ padding: '50px 20px', textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No products match your filters.</div>}
              {loading && (
                <div style={{ padding: '50px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: T.inkSub }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', border: `2.5px solid ${T.line}`, borderTopColor: T.accent.base, animation: 'spin .7s linear infinite' }} />
                  <span style={{ fontSize: 12.5, fontFamily: T.fMono }}>GET /connector/api/product…</span>
                </div>
              )}
            </Panel>
            </>}
          </div>
        </div>
      </div>

      {/* View / stock history / opening stock */}
      {viewProd && <ViewProductModal T={T} product={viewProd} refs={refs} cats={cats} onClose={() => setViewProd(null)} onEdit={() => { const p = viewProd; setViewProd(null); openEdit(p); }} />}
      {historyProd && <StockHistoryModal T={T} product={historyProd} onClose={() => setHistoryProd(null)} />}
      {openingProd && <OpeningStockModal T={T} product={openingProd} refs={refs} onClose={() => setOpeningProd(null)} onSaved={reload} toast={toast} />}

      {open && (
        <Modal T={T} title={editing ? 'Edit product' : 'New product'} subtitle={editing ? editing.sku : 'Add an item to your catalog'} onClose={() => setOpen(false)} width={680}
          footer={<>
            <div style={{ flex: 1 }} />
            <Btn T={T} kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            {!editing && <Btn T={T} kind="ghost" onClick={() => save(true)} disabled={saving}>{saving ? '…' : 'Save & add another'}</Btn>}
            <Btn T={T} kind="accent" onClick={() => save()} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}</Btn>
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

            <Field T={T} label={form.sku ? 'SKU' : 'SKU (auto-generated if blank)'}><TextField T={T} value={form.sku} onChange={(v: any) => setF('sku', v)} placeholder="Leave blank to auto-generate" /></Field>
            <Field T={T} label="Barcode"><TextField T={T} value={form.barcode} onChange={(v: any) => setF('barcode', v)} placeholder="Scan or type barcode" /></Field>
            <Field T={T} label="Barcode type"><SelectField T={T} value={form.barcode_type} options={['C128', 'C39', 'EAN13', 'EAN8', 'UPCA', 'UPCE']} onChange={(v: any) => setF('barcode_type', v)} render={(v: any) => (({ C128: 'Code 128 (C128)', C39: 'Code 39 (C39)', EAN13: 'EAN-13', EAN8: 'EAN-8', UPCA: 'UPC-A', UPCE: 'UPC-E' } as any)[v] || v)} /></Field>
            {getSetting('enable_categories', true) && <Field T={T} label="Category"><SelectField T={T} value={form.cat} options={['', ...cats.map((c: any) => c.id)]} onChange={(v: any) => setF('cat', v)} render={(v: any) => (v ? ((cats.find((c: any) => c.id === v) || {}).name || v) : '— None —')} /></Field>}
            {getSetting('enable_brands', true) && <Field T={T} label="Brand">
              <SelectField T={T} value={String(form.brand_id)} options={[{ v: '', l: '— None —' }, ...refs.brands.map((b: any) => ({ v: String(b.id), l: b.name }))].map((o: any) => o.v)} onChange={(v: any) => setF('brand_id', v)}
                render={(v: any) => (refs.brands.find((b: any) => String(b.id) === v) || {}).name || '— None —'} />
            </Field>}
            <Field T={T} label="Unit"><SelectField T={T} value={form.unit} options={refs.units.map((u: any) => u.short_name)} onChange={(v: any) => setF('unit', v)} /></Field>
            {getSetting('enable_price_tax', true) && <>
              <Field T={T} label="Applicable tax"><SelectField T={T} value={String(form.tax_id)} options={['', ...refs.taxRates.map((t: any) => String(t.id))]} onChange={(v: any) => setF('tax_id', v)} render={(v: any) => (refs.taxRates.find((t: any) => String(t.id) === v) || {}).name || 'None'} /></Field>
              <Field T={T} label="Selling price tax type"><SelectField T={T} value={form.selling_price_tax_type} options={['exclusive', 'inclusive']} onChange={(v: any) => setF('selling_price_tax_type', v)} render={(v: any) => (v === 'inclusive' ? 'Inclusive' : 'Exclusive')} /></Field>
            </>}
            <Field T={T} label="Alert quantity"><TextField T={T} type="number" value={form.alert_quantity} onChange={(v: any) => setF('alert_quantity', v)} placeholder="Low-stock threshold" /></Field>
            <Field T={T} label="Weight"><TextField T={T} type="number" value={form.weight} onChange={(v: any) => setF('weight', v)} placeholder="e.g. 0.5" /></Field>
            <Field T={T} label="Preparation time (minutes)"><TextField T={T} type="number" value={form.prep_time_minutes} onChange={(v: any) => setF('prep_time_minutes', v)} placeholder="Service staff timer" /></Field>

            {/* toggles */}
            <Field T={T} label="Inventory options" full>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                {form.type !== 'combo' && <Toggle T={T} on={form.enable_stock} onChange={(v: any) => setF('enable_stock', v)} label="Manage stock" hint="Off = sell unlimited (services)" />}
                <Toggle T={T} on={form.not_for_selling} onChange={(v: any) => setF('not_for_selling', v)} label="Not for selling" hint="Hide from POS & Sales" />
                <Toggle T={T} on={form.is_serialized} onChange={(v: any) => setF('is_serialized', v)} label="IMEI / serial number" hint="Track each unit's serial" />
              </div>
            </Field>

            {/* per-location availability */}
            {refs.locations.length >= 1 && (
              <Field T={T} label="Business locations" hint="Which locations sell this — none selected = all" full>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {refs.locations.map((l: any) => {
                    const on = form.location_ids.includes(l.id);
                    return (
                      <button key={l.id} onClick={() => setF('location_ids', on ? form.location_ids.filter((x: any) => x !== l.id) : [...form.location_ids, l.id])} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 99, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: 600, background: on ? T.accent.soft : T.paper, border: `1.5px solid ${on ? T.accent.base : T.line}`, color: on ? T.accent.text : T.inkMid }}>
                        <span style={{ fontSize: 11 }}>{on ? '✓' : '+'}</span>{l.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}

            <Field T={T} label="Product description" full>
              <textarea value={form.description} onChange={e => setF('description', e.target.value)} placeholder="Optional description shown on catalogs & invoices" rows={3}
                style={{ width: '100%', padding: '10px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </Field>

            <Field T={T} label="Product brochure" hint="PDF, CSV, ZIP, DOC, DOCX or image · up to 5 MB" full>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input ref={brochureRef} type="file" accept=".pdf,.csv,.zip,.doc,.docx,.jpeg,.jpg,.png" onChange={onPickBrochure} style={{ display: 'none' }} />
                <Btn T={T} kind="ghost" onClick={() => brochureRef.current && brochureRef.current.click()}>{form.brochure_url ? '↻ Replace file' : '⍑ Choose file'}</Btn>
                {form.brochure_url && <a href={form.brochure_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: T.accent.text, fontWeight: 600 }}>View uploaded file</a>}
                {form.brochure_url && <button onClick={() => { setF('brochure_url', ''); setF('brochure_key', ''); }} style={{ background: 'none', border: 'none', color: T.redText, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: T.fBody }}>Remove</button>}
              </div>
            </Field>

            {/* SINGLE pricing — margin drives the selling price (reference behaviour) */}
            {form.type === 'single' && <>
              <Field T={T} label="Purchase price ($)"><TextField T={T} type="number" value={form.cost}
                onChange={(v: any) => {
                  setF('cost', v);
                  // Business Settings → "Default profit percent" seeds the selling price the
                  // first time a cost is entered. Same margin-on-price formula as marginOf().
                  const pct = Number(getSetting('default_profit_percent', 0));
                  const c = parseFloat(v || '0');
                  if (pct > 0 && c > 0 && !form.price) setF('price', (Math.round((c / (1 - Math.min(pct, 99.99) / 100)) * 100) / 100).toFixed(2));
                }} placeholder="0.00" /></Field>
              <Field T={T} label="Margin (%)">
                <TextField T={T} type="number" value={form.price && form.cost ? String(marginOf(form)) : ''} placeholder="e.g. 25"
                  onChange={(v: any) => { const c = parseFloat(form.cost || 0); const m = parseFloat(v); if (c > 0 && !isNaN(m)) setF('price', (Math.round(c / (1 - Math.min(m, 99.99) / 100) * 100) / 100).toFixed(2)); }} />
              </Field>
              <Field T={T} label="Selling price ($)"><TextField T={T} type="number" value={form.price} onChange={(v: any) => setF('price', v)} placeholder="0.00" /></Field>
              {form.enable_stock && <Field T={T} label="Opening stock"><TextField T={T} type="number" value={form.stock} onChange={(v: any) => setF('stock', v)} placeholder="0" /></Field>}
            </>}
          </FormGrid>

          {/* VARIABLE */}
          {form.type === 'variable' && (
            <div style={{ marginTop: 16 }}>
              {/* SKU format */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSub, marginBottom: 8 }}>Variation SKU format</div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  {[['number', 'SKU-Number', 'e.g. ABC-1, ABC-2'], ['variation', 'SKU + Variation', 'e.g. ABCS, ABCM']].map(([id, lbl, hint]: any) => (
                    <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <span style={{ width: 15, height: 15, borderRadius: 99, flexShrink: 0, border: `1.5px solid ${form.var_sku_format === id ? T.accent.base : T.lineMid}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{form.var_sku_format === id && <span style={{ width: 7, height: 7, borderRadius: 99, background: T.accent.base }} />}</span>
                      <input type="radio" checked={form.var_sku_format === id} onChange={() => setF('var_sku_format', id)} style={{ display: 'none' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{lbl}</span>
                      <span style={{ fontSize: 11, color: T.inkMute }}>{hint}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* variation groups */}
              {form.varGroups.map((g: any, gi: number) => (
                <div key={gi} style={{ marginBottom: 14, border: `1px solid ${T.line}`, borderRadius: T.rLg, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSub }}>Variation</span>
                    <div style={{ minWidth: 180 }}>
                      {refs.variations.length > 0
                        ? <SelectField T={T} value={g.template_id} options={['', ...refs.variations.map((v: any) => String(v.id))]} onChange={(tid: any) => pickGroupTemplate(gi, tid)} render={(v: any) => v ? (refs.variations.find((t: any) => String(t.id) === v) || {}).name : 'Please select…'} />
                        : <MiniInp T={T} type="text" value={g.name} onChange={(e: any) => setGroupName(gi, e.target.value)} placeholder="Variation name (e.g. Colour)" />}
                    </div>
                    {refs.variations.length > 0 && <MiniInp T={T} type="text" value={g.name} onChange={(e: any) => setGroupName(gi, e.target.value)} placeholder="or type a name" style={{ maxWidth: 160 }} />}
                    <span style={{ flex: 1 }} />
                    <button onClick={() => rmVarGroup(gi)} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.redSoft}`, background: T.redSoft, color: T.redText, cursor: 'pointer', fontSize: 13 }}>✕</button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ minWidth: 620 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.9fr 0.7fr 0.9fr 34px', gap: 8, padding: '7px 12px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub } as React.CSSProperties}>
                        <span>Value</span><span>SKU</span><span>Purchase (exc)</span><span>Margin %</span><span>Selling (exc)</span><span />
                      </div>
                      {g.values.map((v: any, vi: number) => (
                        <div key={vi} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.9fr 0.7fr 0.9fr 34px', gap: 8, padding: '6px 12px', borderTop: `1px solid ${T.line}`, alignItems: 'center' }}>
                          <MiniInp T={T} type="text" value={v.value} onChange={(e: any) => setVarValue(gi, vi, 'value', e.target.value)} placeholder="e.g. Small" />
                          <MiniInp T={T} type="text" value={v.sku} onChange={(e: any) => setVarValue(gi, vi, 'sku', e.target.value)} placeholder="auto" />
                          <MiniInp T={T} value={v.cost} onChange={(e: any) => setVarValue(gi, vi, 'cost', e.target.value)} placeholder="0.00" />
                          <MiniInp T={T} value={v.margin} onChange={(e: any) => setVarValue(gi, vi, 'margin', e.target.value)} placeholder="0" />
                          <MiniInp T={T} value={v.price} onChange={(e: any) => setVarValue(gi, vi, 'price', e.target.value)} placeholder="0.00" />
                          <button onClick={() => rmVarValue(gi, vi)} disabled={g.values.length === 1} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: g.values.length === 1 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: g.values.length === 1 ? 0.4 : 1 }}>✕</button>
                        </div>
                      ))}
                      <div style={{ padding: '7px 12px', borderTop: `1px solid ${T.line}` }}>
                        <button onClick={() => addVarValue(gi)} style={{ background: 'none', border: 'none', color: T.accent.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.fBody }}>+ Add value</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Btn T={T} kind="ghost" onClick={addVarGroup}>+ Add Variation</Btn>
                <span style={{ fontSize: 11, color: T.inkMute }}>Each value becomes a sellable variant. Manage reusable templates from the <b style={{ cursor: 'pointer', color: T.accent.text }} onClick={() => setVarMgr(true)}>Variations</b> button.</span>
              </div>
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
      {labels && <PrintLabels T={T} products={list} initial={sel ? [sel] : []} onClose={() => setLabels(false)} />}
      {confirmDel && (
        <Modal T={T} title={confirmDel.bulk ? 'Delete products?' : 'Delete product?'} subtitle={confirmDel.bulk ? `${confirmDel.bulk.length} selected` : confirmDel.name} width={420} onClose={() => setConfirmDel(null)} onSave={() => doDelete(confirmDel)} saveLabel="Delete">
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>{confirmDel.bulk ? <>This removes <b style={{ color: T.ink }}>{confirmDel.bulk.length} products</b> from your catalog.</> : <>This removes <b style={{ color: T.ink }}>{confirmDel.name}</b> from your catalog.</>} Products with sales or stock history can't be deleted.</div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
