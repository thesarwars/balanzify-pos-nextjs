// ─────────────────────────────────────────────────────────────────
// Table exporters — CSV, Excel, and a printable view that doubles as
// the PDF path via the browser's print dialog.
//
// Pulled out of the reports table so the HRM screens get the same
// toolbar rather than a second, thinner implementation of it. Callers
// hand over already-resolved strings/numbers, so what is exported is
// exactly what was on screen.
// ─────────────────────────────────────────────────────────────────

export type ExportTable = {
  title: string;
  subtitle?: string;
  fileName: string;
  cols: string[];
  rows: any[][];
  /** Optional totals row, same width as `cols`. */
  totals?: any[];
  /** Column indexes to right-align in the printable view. */
  rightAlign?: number[];
};

const escHtml = (v: any) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Spreadsheets execute a leading =, +, - or @ as a formula, so anything that
// is not plainly a number gets quoted out of harm's way.
export const escCsv = (v: any) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportTableCSV(t: ExportTable) {
  const lines = [t.cols.map(escCsv).join(',')];
  for (const r of t.rows) lines.push(r.map(escCsv).join(','));
  if (t.totals) lines.push(t.totals.map(escCsv).join(','));
  download(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `${t.fileName}.csv`);
}

export async function exportTableExcel(t: ExportTable) {
  const XLSX: any = await import('xlsx');
  const aoa = [t.cols, ...t.rows, ...(t.totals ? [t.totals] : [])];
  const wb = XLSX.utils.book_new();
  // Sheet names are capped at 31 characters by the format itself.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), t.title.slice(0, 30));
  XLSX.writeFile(wb, `${t.fileName}.xlsx`);
}

/** Opens a print window. With an orientation it sets @page, which is how the
 *  browser's "Save as PDF" ends up portrait or landscape. */
export function printTable(t: ExportTable, orientation?: 'portrait' | 'landscape') {
  const right = new Set(t.rightAlign || []);
  const cell = (v: any, i: number, tag = 'td') =>
    `<${tag}${right.has(i) ? ' class="r"' : ''}>${escHtml(v)}</${tag}>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(t.title)}</title>
<style>
  ${orientation ? `@page{size:A4 ${orientation};margin:12mm}` : ''}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;margin:24px;font-size:12px}
  h1{font-size:16px;margin:0 0 2px} .sub{color:#666;margin-bottom:12px;font-size:12px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #ddd;padding:5px 7px;text-align:left} th{background:#f3f4f6}
  .r{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:700;background:#fafafa}
</style></head><body>
  <h1>${escHtml(t.title)}</h1>${t.subtitle ? `<div class="sub">${escHtml(t.subtitle)}</div>` : ''}
  <table>
    <thead><tr>${t.cols.map((c, i) => cell(c, i, 'th')).join('')}</tr></thead>
    <tbody>${t.rows.map(r => `<tr>${r.map((v, i) => cell(v, i)).join('')}</tr>`).join('')}</tbody>
    ${t.totals ? `<tfoot><tr>${t.totals.map((v, i) => cell(v, i)).join('')}</tr></tfoot>` : ''}
  </table>
  <script>window.onload=function(){window.print()}</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=1100,height=760');
  if (w) { w.document.write(html); w.document.close(); }
}
