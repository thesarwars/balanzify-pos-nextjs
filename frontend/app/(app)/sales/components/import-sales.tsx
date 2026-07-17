'use client';
// ─────────────────────────────────────────────────────────────────
// Import Sales — bulk-load historical invoices from a spreadsheet.
// The workbook is parsed in the browser (SheetJS, loaded on demand),
// columns are auto-mapped to sale fields (and can be re-pointed), rows
// sharing an Invoice No. are grouped into one sale, and the batch is
// posted to /sales/import where each invoice is rung up through the
// same engine as a normal sale. Every past batch is listed below and
// can be reversed in one action.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Field, SelectField } from '@/components/kit';
import { useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { readSheet } from '../../purchase-orders/components/import-lines';
import { ConfirmModal } from '../../purchase-orders/components/bits';
import { LuUpload, LuDownload, LuTrash2, LuTriangleAlert, LuCircleCheck, LuFileSpreadsheet } from 'react-icons/lu';

// The columns a sheet may carry. `label` is the exact template header and the
// text the auto-mapper matches; `aliases` catch common variants.
const FIELDS: { key: string; label: string; aliases: string[]; hint?: string }[] = [
  { key: 'invoice_no',     label: 'Invoice No.',           aliases: ['invoice no', 'invoice', 'invoice number', 'invoice_no', 'ref', 'reference', 'ref no'] },
  { key: 'customer_name',  label: 'Customer name',         aliases: ['customer name', 'customer', 'name', 'client'] },
  { key: 'customer_phone', label: 'Customer Phone number', aliases: ['customer phone number', 'phone', 'mobile', 'customer phone', 'phone number'], hint: 'Either email or phone' },
  { key: 'customer_email', label: 'Customer Email',        aliases: ['customer email', 'email', 'e-mail'], hint: 'Either email or phone' },
  { key: 'sale_date',      label: 'Sale Date',             aliases: ['sale date', 'date', 'sale_date', 'invoice date'], hint: 'Y-m-d H:i:s' },
  { key: 'product_name',   label: 'Product Name',          aliases: ['product name', 'product', 'item', 'item name'], hint: 'Name or SKU' },
  { key: 'sku',            label: 'Product SKU',           aliases: ['product sku', 'sku', 'code', 'barcode', 'item code'], hint: 'Name or SKU' },
  { key: 'quantity',       label: 'Quantity',              aliases: ['quantity', 'qty'], hint: 'Required' },
  { key: 'unit',           label: 'Product Unit',          aliases: ['product unit', 'unit'] },
  { key: 'unit_price',     label: 'Unit Price',            aliases: ['unit price', 'price', 'rate', 'unit_price'] },
  { key: 'item_tax',       label: 'Item Tax',              aliases: ['item tax', 'tax', 'tax %', 'tax percent'], hint: 'Percentage' },
  { key: 'discount',       label: 'Item Discount',         aliases: ['item discount', 'discount'] },
  { key: 'description',    label: 'Item Description',      aliases: ['item description', 'description', 'note'] },
  { key: 'order_total',    label: 'Order Total',           aliases: ['order total', 'total', 'grand total'] },
];

const norm = (s: string) => String(s || '').trim().toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');
const numOr = (v: any, d?: number) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : d; };

export function ImportSales({ T }: { T: Theme }) {
  const [show, toastNode] = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [body, setBody] = React.useState<string[][]>([]);
  const [map, setMap] = React.useState<Record<string, string>>({}); // field.key -> column index (as string) or ''
  const [locations, setLocations] = React.useState<any[]>([]);
  const [locationId, setLocationId] = React.useState('');
  const [paid, setPaid] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [imports, setImports] = React.useState<any[]>([]);
  const [confirmDel, setConfirmDel] = React.useState<any>(null);

  const reloadImports = React.useCallback(() => { API.sell.imports().then(setImports).catch(() => setImports([])); }, []);
  React.useEffect(() => { reloadImports(); }, [reloadImports]);
  React.useEffect(() => { API.location.list().then((l: any) => { setLocations(l); if (l[0]) setLocationId(String(l[0].id)); }).catch(() => {}); }, []);

  // ── Parse the chosen workbook and auto-map its columns ───────────────
  async function uploadAndReview() {
    if (!file) { show('Choose a file first.'); return; }
    setBusy(true); setResult(null);
    try {
      const grid = await readSheet(file);
      if (!grid.length) { show('That file has no rows.'); setBusy(false); return; }
      const head = grid[0].map((c) => String(c || ''));
      const rows = grid.slice(1).filter((r) => r.some((c) => String(c || '').trim() !== ''));
      const nheads = head.map(norm);
      const auto: Record<string, string> = {};
      for (const f of FIELDS) {
        const wanted = [norm(f.label), ...f.aliases.map(norm)];
        const idx = nheads.findIndex((h) => wanted.includes(h));
        auto[f.key] = idx >= 0 ? String(idx) : '';
      }
      setHeaders(head); setBody(rows); setMap(auto);
      if (rows.length) show(`Loaded ${rows.length} row${rows.length === 1 ? '' : 's'} — check the mapping, then import.`);
    } catch (e: any) {
      show(e.message || 'Could not read that file.');
    } finally { setBusy(false); }
  }

  const cell = (row: string[], key: string) => {
    const i = map[key]; if (i === '' || i == null) return '';
    const n = Number(i); return n >= 0 && n < row.length ? String(row[n] || '').trim() : '';
  };

  // ── Group rows sharing an Invoice No. into one sale ──────────────────
  const invoices = React.useMemo(() => {
    if (!body.length) return [] as any[];
    const groups = new Map<string, any>();
    body.forEach((row, i) => {
      const inv = cell(row, 'invoice_no');
      const gkey = inv || `__row_${i}`; // no invoice number → its own sale
      let g = groups.get(gkey);
      if (!g) {
        g = {
          invoice_no: inv, customer_name: cell(row, 'customer_name'),
          customer_phone: cell(row, 'customer_phone'), customer_email: cell(row, 'customer_email'),
          sale_date: cell(row, 'sale_date'), order_total: numOr(cell(row, 'order_total')),
          items: [],
        };
        groups.set(gkey, g);
      }
      const product_name = cell(row, 'product_name');
      const sku = cell(row, 'sku');
      if (!product_name && !sku) return; // blank line
      g.items.push({
        product_name, sku,
        quantity: numOr(cell(row, 'quantity')),
        unit_price: cell(row, 'unit_price') ? numOr(cell(row, 'unit_price')) : undefined,
        item_tax: cell(row, 'item_tax') ? numOr(cell(row, 'item_tax')) : undefined,
        discount: cell(row, 'discount') ? numOr(cell(row, 'discount')) : undefined,
        description: cell(row, 'description') || undefined,
      });
    });
    return [...groups.values()].filter((g) => g.items.length);
  }, [body, map]);

  // Rows the backend will reject up front, flagged before the user commits.
  const issues = React.useMemo(() => {
    const list: string[] = [];
    invoices.forEach((g, i) => {
      const label = g.invoice_no || `Invoice ${i + 1}`;
      g.items.forEach((it: any) => {
        if (!it.product_name && !it.sku) list.push(`${label}: a line has no product name or SKU`);
        if (!(it.quantity > 0)) list.push(`${label}: "${it.product_name || it.sku}" has no quantity`);
      });
    });
    return list;
  }, [invoices]);

  // An estimate: the server recomputes the real total (and only applies Item Tax
  // when it matches an existing rate). A literal 0 in Order Total is treated as
  // "not provided" so it can't hide real line items.
  const lineTotal = (it: any) => {
    const base = Math.max(0, (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0));
    return base + base * ((Number(it.item_tax) || 0) / 100);
  };
  const estTotal = (g: any) => (g.order_total != null && g.order_total > 0 ? g.order_total : g.items.reduce((s: number, it: any) => s + lineTotal(it), 0));

  async function doImport() {
    if (!invoices.length) { show('Nothing to import.'); return; }
    setBusy(true); setResult(null);
    try {
      const res = await API.sell.importSales({ location_id: locationId || undefined, paid, invoices });
      setResult(res);
      if (res.imported) {
        show(`Imported ${res.imported} sale${res.imported === 1 ? '' : 's'}${res.failed ? `, ${res.failed} failed` : ''}.`);
        // Clear the staged file once anything landed; the batch shows below.
        setFile(null); setHeaders([]); setBody([]); setMap({});
        reloadImports();
      } else {
        show(`None imported — ${res.failed} row${res.failed === 1 ? '' : 's'} could not be posted.`);
      }
    } catch (e: any) {
      show(e.message || 'Import failed.');
    } finally { setBusy(false); }
  }

  async function deleteBatch(batch: string) {
    setConfirmDel(null);
    try {
      const r = await API.sell.deleteImport(batch);
      show(`Reversed ${r.reversed} sale${r.reversed === 1 ? '' : 's'}${r.failed ? `, ${r.failed} could not be reversed` : ''}.`);
      reloadImports();
    } catch (e: any) { show(e.message || 'Could not reverse that batch.'); }
  }

  function downloadTemplate() {
    const cols = FIELDS.map((f) => f.label);
    const example = [
      'INV-1001', 'Amina Yusuf', '+252613000000', 'amina@example.com', '2026-07-15 14:30:00',
      'Basmati Rice 5kg', 'RICE-5KG', '2', 'Pieces', '12.50', '5', '0', 'Bulk order', '26.25',
    ];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [cols.map(esc).join(','), example.map(esc).join(',')].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sales-import-template.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const colOptions = ['', ...headers.map((_, i) => String(i))];
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 11.5, fontWeight: 700, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${T.line}` };
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: T.ink, borderBottom: `1px solid ${T.line}` };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Import Sales" subtitle="Bulk-load historical invoices from a spreadsheet" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* ── File to import ─────────────────────────────────────── */}
          <Panel T={T} title="File to import">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end' }}>
              <div style={{ minWidth: 240 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.inkMid, marginBottom: 7 }}>File (.xlsx / .xls / .csv)</label>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setFile(e.target.files && e.target.files[0]); setHeaders([]); setBody([]); setResult(null); }}
                  style={{ fontSize: 13, color: T.inkMid }} />
              </div>
              <div style={{ minWidth: 190 }}>
                <Field T={T} label="Business location">
                  <SelectField T={T} value={locationId} options={['', ...locations.map((l: any) => String(l.id))]}
                    onChange={setLocationId} render={(o: any) => o === '' ? 'First / default location' : (locations.find((l: any) => String(l.id) === o) || {}).name || o} />
                </Field>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.inkMid, cursor: 'pointer', paddingBottom: 9 }}>
                <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
                Mark imported sales as paid (settle to cash)
              </label>
              <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', paddingBottom: 1 }}>
                <Btn T={T} kind="ghost" onClick={downloadTemplate}><LuDownload size={15} /> Download template</Btn>
                <Btn T={T} kind="accent" onClick={uploadAndReview} disabled={busy || !file}><LuUpload size={15} /> {busy ? 'Reading…' : 'Upload and review'}</Btn>
              </div>
            </div>
          </Panel>

          {/* ── Column mapping + preview (after a file is read) ────── */}
          {headers.length > 0 && (
            <Panel T={T} title={`Map columns  ·  ${body.length} row${body.length === 1 ? '' : 's'} → ${invoices.length} sale${invoices.length === 1 ? '' : 's'}`}>
              <p style={{ margin: '0 0 16px', fontSize: 12.5, color: T.inkSub }}>
                Columns were matched to sale fields by name. Re-point any that are wrong. Rows that share an <strong>Invoice No.</strong> become one sale.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 12 }}>
                {FIELDS.map((f) => (
                  <div key={f.key}>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 12, fontWeight: 600, color: T.inkMid, marginBottom: 5 }}>
                      {f.label}{f.hint && <span style={{ fontSize: 10.5, fontWeight: 500, color: T.inkSub }}>· {f.hint}</span>}
                    </label>
                    <SelectField T={T} value={map[f.key] ?? ''} options={colOptions}
                      onChange={(v: any) => setMap((m) => ({ ...m, [f.key]: v }))}
                      render={(o: any) => o === '' ? '— Not mapped —' : (headers[Number(o)] || `Column ${Number(o) + 1}`)} />
                  </div>
                ))}
              </div>

              {issues.length > 0 && (
                <div style={{ marginTop: 18, background: T.redSoft, border: `1px solid ${T.line}`, borderRadius: 9, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: T.redText, marginBottom: 6 }}>
                    <LuTriangleAlert size={15} /> {issues.length} row{issues.length === 1 ? '' : 's'} need attention
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: T.redText }}>
                    {issues.slice(0, 6).map((s, i) => <li key={i}>{s}</li>)}
                    {issues.length > 6 && <li>…and {issues.length - 6} more</li>}
                  </ul>
                </div>
              )}

              {/* Preview of the grouped sales */}
              <div style={{ marginTop: 18, border: `1px solid ${T.line}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead><tr>
                      <th style={th}>Invoice No.</th><th style={th}>Customer</th><th style={th}>Date</th>
                      <th style={{ ...th, textAlign: 'right' }}>Lines</th><th style={{ ...th, textAlign: 'right' }}>Est. total</th>
                    </tr></thead>
                    <tbody>
                      {invoices.slice(0, 25).map((g, i) => (
                        <tr key={i}>
                          <td style={td}>{g.invoice_no || <span style={{ color: T.inkSub }}>auto</span>}</td>
                          <td style={td}>{g.customer_name || g.customer_phone || g.customer_email || <span style={{ color: T.inkSub }}>Imported Customer</span>}</td>
                          <td style={{ ...td, color: T.inkSub }}>{g.sale_date || '—'}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{g.items.length}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{money(estTotal(g))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {invoices.length > 25 && <div style={{ padding: '9px 12px', fontSize: 12, color: T.inkSub, background: T.paperAlt }}>…and {invoices.length - 25} more sales</div>}
              </div>

              <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <Btn T={T} kind="ghost" onClick={() => { setFile(null); setHeaders([]); setBody([]); setMap({}); }}>Cancel</Btn>
                <Btn T={T} kind="primary" onClick={doImport} disabled={busy || !invoices.length}>
                  <LuFileSpreadsheet size={15} /> {busy ? 'Importing…' : `Import ${invoices.length} sale${invoices.length === 1 ? '' : 's'}`}
                </Btn>
              </div>
            </Panel>
          )}

          {/* ── Last import result ─────────────────────────────────── */}
          {result && (
            <Panel T={T} title="Import result">
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: result.errors?.length ? 14 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, color: '#0E9F6E' }}>
                  <LuCircleCheck size={18} /> {result.imported} imported
                </div>
                {!!result.failed && <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, color: T.redText }}>
                  <LuTriangleAlert size={18} /> {result.failed} failed
                </div>}
                {result.batch && <div style={{ fontSize: 12.5, color: T.inkSub, alignSelf: 'center' }}>Batch <code>{result.batch}</code></div>}
              </div>
              {result.errors?.length > 0 && (
                <div style={{ border: `1px solid ${T.line}`, borderRadius: 9, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Row</th><th style={th}>Invoice No.</th><th style={th}>Reason</th></tr></thead>
                    <tbody>
                      {result.errors.map((e: any, i: number) => (
                        <tr key={i}><td style={td}>{e.row}</td><td style={td}>{e.invoice_no || '—'}</td><td style={{ ...td, color: T.redText }}>{e.error}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {/* ── Instructions ───────────────────────────────────────── */}
          <Panel T={T} title="Instructions">
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: T.inkMid, lineHeight: 1.8 }}>
              <li>Upload sales data in .xlsx or .csv format — start from the template above.</li>
              <li>Choose the business location the sales belong to.</li>
              <li>After uploading, confirm each column is pointed at the right sale field.</li>
              <li>Rows that share an <strong>Invoice No.</strong> are grouped into a single sale.</li>
            </ol>
            <div style={{ marginTop: 16, border: `1px solid ${T.line}`, borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Importable field</th><th style={th}>Notes</th></tr></thead>
                <tbody>
                  {[
                    ['Invoice No.', 'Groups lines into one sale; auto-numbered if blank'],
                    ['Customer name', ''],
                    ['Customer Phone number', 'Matches an existing customer; either phone or email'],
                    ['Customer Email', 'Matches an existing customer; either phone or email'],
                    ['Sale Date', 'Format Y-m-d H:i:s (2026-07-15 14:30:00)'],
                    ['Product Name', 'Product name (single/combo) — or use SKU'],
                    ['Product SKU', 'Product or variant SKU — or use name'],
                    ['Quantity', 'Required'],
                    ['Product Unit', ''],
                    ['Unit Price', 'Defaults to the product’s selling price if blank'],
                    ['Item Tax', 'A percentage matched to an existing tax rate'],
                    ['Item Discount', 'Amount off the line'],
                    ['Item Description', ''],
                    ['Order Total', 'For your reference — the total is recomputed on import'],
                  ].map(([f, note], i) => (
                    <tr key={i}><td style={{ ...td, fontWeight: 600, width: 220 }}>{f}</td><td style={{ ...td, color: T.inkSub }}>{note || '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* ── Past imports ───────────────────────────────────────── */}
          <Panel T={T} title="Imports">
            {imports.length === 0 ? (
              <div style={{ padding: '18px 4px', fontSize: 13, color: T.inkSub }}>No imports yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead><tr>
                    <th style={th}>Import batch</th><th style={th}>Import time</th><th style={th}>Created by</th>
                    <th style={{ ...th, textAlign: 'right' }}>Invoices</th><th style={{ ...th, textAlign: 'right' }}>Action</th>
                  </tr></thead>
                  <tbody>
                    {imports.map((b: any) => (
                      <tr key={b.batch}>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: 12.5 }}>{b.batch}</td>
                        <td style={td}>{b.created_at ? new Date(b.created_at).toLocaleString() : '—'}</td>
                        <td style={td}>{b.created_by || '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{b.invoices}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <Btn T={T} kind="ghost" onClick={() => setConfirmDel(b)} style={{ padding: '6px 11px', color: T.redText, borderColor: T.line }}>
                            <LuTrash2 size={14} /> Delete
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {confirmDel && (
        <ConfirmModal T={T} title={`Delete import ${confirmDel.batch}?`}
          body={`This reverses and removes ${confirmDel.invoices} imported sale${confirmDel.invoices === 1 ? '' : 's'} — stock is put back and their journal entries are unwound. This cannot be undone.`}
          confirmLabel="Delete batch" confirmKind="danger"
          onConfirm={() => deleteBatch(confirmDel.batch)} onClose={() => setConfirmDel(null)} />
      )}
      {toastNode}
    </div>
  );
}
