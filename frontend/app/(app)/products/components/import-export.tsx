'use client';
import React from 'react';
import { Modal, Btn, Badge, Field, TextField, SelectField } from '@/components/kit';
import { API } from '@/lib/api';
import { CATEGORIES, PRODUCTS } from '@/lib/data';
import { money } from '@/lib/theme';

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

export function ImportExport({ T, onClose, onImported, toast }: any) {
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
