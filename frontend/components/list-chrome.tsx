'use client';
// ─────────────────────────────────────────────────────────────────
// The list chrome the reference puts above and below every table:
// the export toolbar (CSV / Excel / Print / Column visibility /
// Export PDF ▾) and the "Show N entries … Previous | Next" footer.
//
// Split from the reports table so screens with bespoke rows — badges,
// row buttons, drill-downs — get the same toolbar without having to
// give up their own markup.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn } from '@/components/kit';
import { exportTableCSV, exportTableExcel, printTable, type ExportTable } from '@/lib/table-export';
import { LuPrinter, LuDownload, LuFileSpreadsheet, LuColumns3, LuFileText, LuChevronDown } from 'react-icons/lu';

/** Page a list. Returns the slice plus everything the footer needs. */
export function usePaged<T>(rows: T[], initial = 25) {
  const [perPage, setPerPage] = React.useState(initial);
  const [page, setPage] = React.useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  // Filtering can shrink the list under the current page; clamp rather than
  // showing an empty table with no way back.
  React.useEffect(() => { if (page > pages) setPage(1); }, [pages, page]);
  const from = (page - 1) * perPage;
  return {
    slice: rows.slice(from, from + perPage),
    page, setPage, perPage, setPerPage, pages, total: rows.length,
    first: rows.length ? from + 1 : 0,
    last: Math.min(from + perPage, rows.length),
  };
}

export function ListToolbar({
  T, table, columns, hidden, onToggleColumn, right,
}: {
  T: Theme;
  /** Resolved rows — exactly what is on screen. */
  table: () => ExportTable;
  /** Column labels offered in the visibility menu; omit to hide the menu. */
  columns?: string[];
  hidden?: Record<string, boolean>;
  onToggleColumn?: (label: string) => void;
  right?: React.ReactNode;
}) {
  const [menu, setMenu] = React.useState<null | 'cols' | 'pdf'>(null);
  const btn = { fontSize: 12 } as React.CSSProperties;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <Btn T={T} kind="ghost" onClick={() => exportTableCSV(table())} style={btn}>
        <LuDownload size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Export CSV
      </Btn>
      <Btn T={T} kind="ghost" onClick={() => exportTableExcel(table())} style={btn}>
        <LuFileSpreadsheet size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Export Excel
      </Btn>
      <Btn T={T} kind="ghost" onClick={() => printTable(table())} style={btn}>
        <LuPrinter size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Print
      </Btn>

      {columns && columns.length > 0 && (
        <div style={{ position: 'relative' }}>
          <Btn T={T} kind="ghost" onClick={() => setMenu(menu === 'cols' ? null : 'cols')} style={btn}>
            <LuColumns3 size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Column visibility
          </Btn>
          {menu === 'cols' && (
            <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 30, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, minWidth: 190, maxHeight: 320, overflowY: 'auto' }}>
              {columns.map(label => (
                <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: T.ink }}>
                  <input type="checkbox" checked={!hidden?.[label]} onChange={() => onToggleColumn?.(label)} />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <Btn T={T} kind="ghost" onClick={() => setMenu(menu === 'pdf' ? null : 'pdf')} style={btn}>
          <LuFileText size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Export PDF
          <LuChevronDown size={12} style={{ verticalAlign: -1, marginLeft: 5 }} />
        </Btn>
        {menu === 'pdf' && (
          <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 30, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, minWidth: 150 }}>
            {(['portrait', 'landscape'] as const).map(o => (
              <button key={o} onClick={() => { setMenu(null); printTable(table(), o); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: T.fBody, background: 'transparent', color: T.ink, textTransform: 'capitalize' }}>
                {o}
              </button>
            ))}
          </div>
        )}
      </div>

      {menu && <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}
      {right && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>{right}</div>}
    </div>
  );
}

export function ListFooter({ T, paged }: { T: Theme; paged: ReturnType<typeof usePaged<any>> }) {
  const nav = (label: string, to: number, disabled: boolean) => (
    <button onClick={() => paged.setPage(to)} disabled={disabled}
      style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${T.line}`, background: T.paper, color: disabled ? T.inkMute : T.inkMid, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: T.fBody, fontSize: 12, opacity: disabled ? 0.5 : 1 }}>
      {label}
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 2px 2px' }}>
      <span style={{ fontSize: 12, color: T.inkSub }}>Show</span>
      <select value={paged.perPage} onChange={e => { paged.setPerPage(Number(e.target.value)); paged.setPage(1); }}
        style={{ padding: '5px 8px', fontSize: 12, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none' }}>
        {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <span style={{ fontSize: 12, color: T.inkSub }}>entries</span>
      <span style={{ flex: 1, minWidth: 12 }} />
      <span style={{ fontSize: 12, color: T.inkSub }}>
        Showing {paged.first} to {paged.last} of {paged.total} entries
      </span>
      {nav('Previous', paged.page - 1, paged.page <= 1)}
      {nav('Next', paged.page + 1, paged.page >= paged.pages)}
    </div>
  );
}
