// ─────────────────────────────────────────────────────────────────
// CSV / XLSX → purchase lines. xlsx is dynamically imported so the
// SheetJS chunk only loads when someone actually imports a workbook.
// ─────────────────────────────────────────────────────────────────

// ── CSV / XLSX import → product lines ────────────────────────────────
// Returns a grid (array of rows, each an array of cell strings).
export async function readSheet(file: any): Promise<string[][]> {
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX: any = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    return rows.map((r: any[]) => r.map((c: any) => (c == null ? '' : String(c))));
  }
  const text = await file.text();
  return text.split(/\r?\n/).filter((l: string) => l.trim() !== '').map(splitCsvLine);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Map an imported grid to purchase lines by matching SKU / barcode / name.
export function mapImportRows(grid: string[][], products: any[]): { lines: any[]; matched: number; total: number } {
  if (!grid.length) return { lines: [], matched: 0, total: 0 };
  const find = (cands: string[], header: string[]) => header.findIndex((h) => cands.includes(h.trim().toLowerCase()));
  const first = grid[0].map((c) => c.trim().toLowerCase());
  const looksHeader = first.some((c) => ['sku', 'name', 'product', 'qty', 'quantity', 'cost', 'unit cost', 'price'].includes(c));
  let idx = { sku: 0, name: -1, qty: 1, cost: 2, sell: 3 };
  let body = grid;
  if (looksHeader) {
    idx = {
      sku: find(['sku', 'code', 'barcode', 'item code'], first),
      name: find(['name', 'product', 'product name', 'item', 'item name'], first),
      qty: find(['qty', 'quantity', 'purchase quantity', 'purchase qty'], first),
      cost: find(['cost', 'unit cost', 'unit_cost', 'purchase price', 'purchase_price', 'buy price'], first),
      sell: find(['selling', 'selling price', 'price', 'sale price', 'unit selling price', 'mrp'], first),
    };
    body = grid.slice(1);
  }
  const cell = (row: string[], i: number) => (i >= 0 && i < row.length ? String(row[i] || '').trim() : '');
  const lines: any[] = []; let matched = 0; let total = 0;
  for (const row of body) {
    if (!row.length || row.every((c) => !c || !c.trim())) continue;
    total++;
    const skuV = cell(row, idx.sku), nameV = cell(row, idx.name >= 0 ? idx.name : idx.sku);
    const p = matchProduct(products, skuV, nameV);
    if (!p) continue;
    matched++;
    const qty = cell(row, idx.qty), cost = cell(row, idx.cost), sell = cell(row, idx.sell);
    lines.push({
      product_id: p.id, unit_id: '',
      qty: qty && !isNaN(Number(qty)) ? String(Number(qty)) : '1',
      unit_cost: cost && !isNaN(Number(cost)) ? String(Number(cost)) : (p.cost != null ? String(p.cost) : ''),
      discount_percent: '',
      selling_price: sell && !isNaN(Number(sell)) ? String(Number(sell)) : (p.price != null ? String(p.price) : ''),
    });
  }
  return { lines, matched, total };
}

function matchProduct(products: any[], skuV: string, nameV: string): any {
  const s = String(skuV || '').trim().toLowerCase();
  const n = String(nameV || '').trim().toLowerCase();
  if (s) { const bySku = products.find((p: any) => String(p.sku || '').toLowerCase() === s || String(p.barcode || '').toLowerCase() === s); if (bySku) return bySku; }
  if (n) {
    let byName = products.find((p: any) => String(p.name || '').toLowerCase() === n); if (byName) return byName;
    byName = products.find((p: any) => String(p.name || '').toLowerCase().includes(n) && n.length >= 3); if (byName) return byName;
    const asSku = products.find((p: any) => String(p.sku || '').toLowerCase() === n || String(p.barcode || '').toLowerCase() === n); if (asSku) return asSku;
  }
  return null;
}
