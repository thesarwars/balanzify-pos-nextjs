'use client';
// ─────────────────────────────────────────────────────────────────
// Stock Report — per variation × location valuation. Current stock
// valued by purchase (cost layers) and sale price, potential profit,
// and units sold / transferred / adjusted. Wired to
// GET /products/stock-report.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Panel } from '@/components/kit';
import { money } from '@/lib/theme';
import { API } from '@/lib/api';
import { thStyle, tdStyle } from './list-table';

export function StockReport({ T, onHistory }: { T: any; onHistory: (row: any) => void }) {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState('');

  React.useEffect(() => {
    setLoading(true);
    API.product.stockReport().then((r: any) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  const filtered = q.trim()
    ? rows.filter((r: any) => [r.product, r.sku, r.variation, r.category, r.location].some((f: any) => String(f || '').toLowerCase().includes(q.toLowerCase())))
    : rows;

  const tot = filtered.reduce((a: any, r: any) => ({
    stock: a.stock + (r.current_stock || 0),
    vp: a.vp + (r.stock_value_purchase || 0),
    vs: a.vs + (r.stock_value_sale || 0),
    pp: a.pp + (r.potential_profit || 0),
  }), { stock: 0, vp: 0, vs: 0, pp: 0 });

  function exportCSV() {
    const head = ['SKU', 'Product', 'Variation', 'Category', 'Location', 'Unit Selling Price', 'Current stock', 'Stock Value (purchase)', 'Stock Value (sale)', 'Potential profit', 'Total sold', 'Total transferred', 'Total adjusted'];
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const body = filtered.map((r: any) => [r.sku, r.product, r.variation, r.category, r.location, r.unit_selling_price, r.current_stock, r.stock_value_purchase, r.stock_value_sale, r.potential_profit, r.total_sold, r.total_transferred, r.total_adjusted].map(esc).join(',')).join('\n');
    const blob = new Blob([head.join(',') + '\n' + body], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stock-report.csv'; a.click();
  }

  const H = [
    ['Action', 'l'], ['SKU', 'l'], ['Product', 'l'], ['Variation', 'l'], ['Category', 'l'], ['Location', 'l'],
    ['Unit Selling Price', 'r'], ['Current stock', 'r'], ['Stock Value (purchase)', 'r'], ['Stock Value (sale)', 'r'],
    ['Potential profit', 'r'], ['Total sold', 'r'], ['Total transferred', 'r'], ['Total adjusted', 'r'],
  ] as any[];

  return (
    <Panel T={T} pad={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.inkMute, fontSize: 14 }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search product, SKU, variation…" style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} />
        </div>
        <span style={{ flex: 1 }} />
        <Btn T={T} kind="ghost" onClick={exportCSV}>⤓ Export CSV</Btn>
        <Btn T={T} kind="ghost" onClick={() => window.print()}>⎙ Print</Btn>
        <span style={{ fontSize: 12, color: T.inkSub }}>{filtered.length} rows</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1280 }}>
          <thead><tr>{H.map(([h, a]: any) => <th key={h} style={thStyle(T, a)}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map((r: any, i: number) => (
              <tr key={i} style={{ transition: 'background .12s' }} onMouseEnter={e => { e.currentTarget.style.background = T.paperAlt; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <td style={tdStyle(T)}><button onClick={() => onHistory(r)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.accent.base}`, background: T.accent.soft, color: T.accent.text, fontFamily: T.fBody, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' } as React.CSSProperties}>↻ Stock history</button></td>
                <td style={{ ...tdStyle(T), fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{r.sku}</td>
                <td style={{ ...tdStyle(T), fontWeight: 600, color: T.ink, minWidth: 150 }}>{r.product}</td>
                <td style={tdStyle(T)}>{r.variation || '—'}</td>
                <td style={tdStyle(T)}>{r.category || '—'}</td>
                <td style={tdStyle(T)}>{r.location || '—'}</td>
                <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono }}>{money(r.unit_selling_price)}</td>
                <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono }}>{r.current_stock} {r.unit}</td>
                <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono }}>{money(r.stock_value_purchase)}</td>
                <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono }}>{money(r.stock_value_sale)}</td>
                <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, color: r.potential_profit >= 0 ? T.greenText : T.redText }}>{money(r.potential_profit)}</td>
                <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{r.total_sold} {r.unit}</td>
                <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{r.total_transferred} {r.unit}</td>
                <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{r.total_adjusted} {r.unit}</td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot><tr style={{ background: T.paperAlt }}>
              <td style={{ ...tdStyle(T), fontWeight: 700 }} colSpan={7}>Total</td>
              <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, fontWeight: 700 }}>{tot.stock}</td>
              <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, fontWeight: 700 }}>{money(tot.vp)}</td>
              <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, fontWeight: 700 }}>{money(tot.vs)}</td>
              <td style={{ ...tdStyle(T), textAlign: 'right', fontFamily: T.fMono, fontWeight: 700, color: tot.pp >= 0 ? T.greenText : T.redText }}>{money(tot.pp)}</td>
              <td style={tdStyle(T)} colSpan={3} />
            </tr></tfoot>
          )}
        </table>
      </div>
      {loading && <div style={{ padding: 44, textAlign: 'center', fontSize: 12.5, color: T.inkSub }}>Loading stock report…</div>}
      {!loading && filtered.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>No stock data.</div>}
    </Panel>
  );
}
