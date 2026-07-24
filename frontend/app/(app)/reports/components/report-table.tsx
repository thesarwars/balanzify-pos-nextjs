'use client';
// ─────────────────────────────────────────────────────────────────
// Shared report table: search, the reference's export toolbar
// (CSV / Excel / Print / Column visibility / Export PDF ▾) and a
// totals row. Columns declare their own accessor and formatting so
// every export, the printable view and the on-screen table stay in
// lockstep.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn } from '@/components/kit';
import { LuPrinter, LuDownload, LuSearch, LuFileSpreadsheet, LuColumns3, LuFileText, LuChevronDown } from 'react-icons/lu';

export type ReportCol = {
  key: string;
  label: string;
  /** Raw value used for search, exports and totals. */
  value: (row: any) => any;
  /** 'money' right-aligns and formats; 'num' right-aligns raw. */
  kind?: 'text' | 'money' | 'num';
  /** Omit from the Column visibility menu (always shown). */
  fixed?: boolean;
  /** Sum this column into the totals row. */
  total?: boolean;
};

const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escCsv = (v: any) => {
  let s = String(v ?? '');
  // Formula-injection guard; plain numbers (incl. negatives) stay untouched.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function ReportTable({
  T, cols, rows, title, subtitle, fileName, extraTotals, empty = 'No data available in table', note, rowAction,
}: {
  T: Theme;
  cols: ReportCol[];
  rows: any[];
  title: string;
  subtitle?: string;
  fileName: string;
  /** Text rendered into the totals row under the given column key. A function
   *  receives the currently shown (searched) rows so the summary tracks the
   *  filter; the value also flows into CSV, Excel and the printable view. */
  extraTotals?: Record<string, string | ((shown: any[]) => string)>;
  empty?: string;
  note?: React.ReactNode;
  /** Optional leading action cell per row (e.g. a drill-down button). Excluded
   *  from exports and the printable view, which are data-only. */
  rowAction?: (row: any) => React.ReactNode;
}) {
  const [q, setQ] = React.useState('');
  const [hidden, setHidden] = React.useState<Record<string, boolean>>({});
  const [menu, setMenu] = React.useState<null | 'cols' | 'pdf'>(null);

  const visible = cols.filter(c => !hidden[c.key]);
  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r => cols.some(c => String(c.value(r) ?? '').toLowerCase().includes(needle)));
  }, [rows, q, cols]);

  const totalOf = (c: ReportCol) => shown.reduce((s, r) => s + (Number(c.value(r)) || 0), 0);
  // Resolved once per render so every renderer (screen, CSV, Excel, print)
  // shows the same totals-row text.
  const extraOf = (c: ReportCol) => {
    const e = extraTotals?.[c.key];
    return typeof e === 'function' ? e(shown) : (e ?? '');
  };
  const footCell = (c: ReportCol, i: number) =>
    c.total ? money(totalOf(c)) : (extraOf(c) || (i === 0 ? 'Total:' : ''));
  const fmt = (c: ReportCol, v: any) => c.kind === 'money' ? money(Number(v) || 0) : String(v ?? '');
  const right = (c: ReportCol) => c.kind === 'money' || c.kind === 'num';

  function exportCSV() {
    const head = visible.map(c => c.label).map(escCsv).join(',');
    const body = shown.map(r => visible.map(c => {
      const v = c.value(r);
      return escCsv(c.kind === 'money' ? (Number(v) || 0).toFixed(2) : v);
    }).join(',')).join('\n');
    const totals = visible.map((c, i) => escCsv(c.total ? totalOf(c).toFixed(2) : (extraOf(c) || (i === 0 ? 'Total' : '')))).join(',');
    const blob = new Blob([head + '\n' + body + '\n' + totals], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportExcel() {
    const XLSX: any = await import('xlsx');
    const aoa = [
      visible.map(c => c.label),
      ...shown.map(r => visible.map(c => c.value(r))),
      visible.map((c, i) => c.total ? totalOf(c) : (extraOf(c) || (i === 0 ? 'Total' : ''))),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), title.slice(0, 30));
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  }

  function printTable(orientation?: 'portrait' | 'landscape') {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  ${orientation ? `@page{size:A4 ${orientation};margin:12mm}` : ''}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;margin:24px;font-size:12px}
  h1{font-size:16px;margin:0 0 2px} .sub{color:#666;margin-bottom:12px;font-size:12px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #ddd;padding:5px 7px;text-align:left} th{background:#f3f4f6}
  .r{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:700;background:#fafafa}
</style></head><body>
  <h1>${esc(title)}</h1>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  <table>
    <thead><tr>${visible.map(c => `<th${right(c) ? ' class="r"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${shown.map(r => `<tr>${visible.map(c => `<td${right(c) ? ' class="r"' : ''}>${esc(fmt(c, c.value(r)))}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr>${visible.map((c, i) => `<td${right(c) ? ' class="r"' : ''}>${c.total ? esc(money(totalOf(c))) : esc(extraOf(c) || (i === 0 ? 'Total' : ''))}</td>`).join('')}</tr></tfoot>
  </table>
  <script>window.onload=function(){window.print()}</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=1100,height=760');
    if (w) { w.document.write(html); w.document.close(); }
  }

  const th = (c: ReportCol): React.CSSProperties => ({
    textAlign: right(c) ? 'right' : 'left', padding: '10px 12px', fontSize: 9.5, fontWeight: 700,
    letterSpacing: 0.8, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt,
    borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap',
  });
  const td = (c: ReportCol): React.CSSProperties => ({
    padding: '9px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5,
    textAlign: right(c) ? 'right' : 'left',
    ...(right(c) ? { fontFamily: T.fMono } : {}),
    whiteSpace: c.kind === 'text' ? 'normal' : 'nowrap',
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 170, maxWidth: 300 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.inkMute, display: 'inline-flex' }}><LuSearch size={14} /></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
            style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1 }} />
        <Btn T={T} kind="ghost" onClick={exportCSV} disabled={!shown.length}><LuDownload size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Export CSV</Btn>
        <Btn T={T} kind="ghost" onClick={exportExcel} disabled={!shown.length}><LuFileSpreadsheet size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Export Excel</Btn>
        <Btn T={T} kind="ghost" onClick={() => printTable()} disabled={!shown.length}><LuPrinter size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Print</Btn>
        <div style={{ position: 'relative' }}>
          <Btn T={T} kind="ghost" onClick={() => setMenu(menu === 'cols' ? null : 'cols')}><LuColumns3 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Column visibility<LuChevronDown size={12} style={{ verticalAlign: -1, marginLeft: 5 }} /></Btn>
          {menu === 'cols' && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 30, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, minWidth: 180, maxHeight: 320, overflowY: 'auto' }}>
              {cols.filter(c => !c.fixed).map(c => (
                <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontFamily: T.fBody, color: T.ink }}>
                  <input type="checkbox" checked={!hidden[c.key]} onChange={() => setHidden(p => ({ ...p, [c.key]: !p[c.key] }))} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <Btn T={T} kind="ghost" onClick={() => setMenu(menu === 'pdf' ? null : 'pdf')} disabled={!shown.length}><LuFileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Export PDF<LuChevronDown size={12} style={{ verticalAlign: -1, marginLeft: 5 }} /></Btn>
          {menu === 'pdf' && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 30, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, minWidth: 140 }}>
              {(['portrait', 'landscape'] as const).map(o => (
                <button key={o} onClick={() => { setMenu(null); printTable(o); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'transparent', fontSize: 12.5, fontFamily: T.fBody, color: T.ink }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.paperAlt; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  {o === 'portrait' ? 'Portrait' : 'Landscape'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {menu && <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}

      <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: T.r }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr>
            {rowAction && <th style={th(cols[0])}>Action</th>}
            {visible.map(c => <th key={c.key} style={th(c)}>{c.label}</th>)}
          </tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.id ?? i}>
                {rowAction && <td style={td(cols[0])}>{rowAction(r)}</td>}
                {visible.map(c => <td key={c.key} style={td(c)}>{fmt(c, c.value(r))}</td>)}
              </tr>
            ))}
            {!shown.length && (
              <tr><td colSpan={visible.length + (rowAction ? 1 : 0)} style={{ ...td(cols[0]), textAlign: 'center', color: T.inkMute, padding: 26 }}>{empty}</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ background: T.paperAlt }}>
              {rowAction && <td style={{ ...td(cols[0]), borderBottom: 'none' }} />}
              {visible.map((c, i) => (
                <td key={c.key} style={{ ...td(c), fontWeight: 700, borderBottom: 'none' }}>
                  {footCell(c, i)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 11.5, color: T.inkMute }}>
        <span>Showing {shown.length} of {rows.length} entries</span>
        {note}
      </div>
    </>
  );
}
