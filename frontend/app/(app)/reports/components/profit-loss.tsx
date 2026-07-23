'use client';
// ─────────────────────────────────────────────────────────────────
// Profit / Loss report — reference-parity statement: Costs & Deductions
// vs Revenue & Income, periodic COGS, gross/net profit, tax summary,
// and "Profit by" breakdowns (product, category, brand, …).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid, StatCard } from '@/components/kit';
import { API } from '@/lib/api';
import { toLocalYmd, todayLocal } from '@/lib/business-settings';
import { LuPrinter, LuDownload, LuSearch, LuFileSpreadsheet, LuColumns3, LuFileText, LuChevronDown } from 'react-icons/lu';

// [key, label, informational] — informational rows sit outside the column
// totals and the profit formulas: stock at sale price is indicative, and
// purchase shipping/additional costs are already inside COGS (landed cost).
const LEFT_ROWS: [string, string, boolean?][] = [
  ['opening_stock_purchase', 'Opening stock (by purchase price)'],
  ['opening_stock_sale', 'Opening stock (by sale price)', true],
  ['total_purchase', 'Total purchase (exc. tax, discount)'],
  ['stock_adjustment', 'Total stock adjustment'],
  ['total_expense', 'Total expense'],
  ['purchase_shipping', 'Purchase shipping (in landed cost)', true],
  ['purchase_additional_expenses', 'Purchase additional exp. (in landed cost)', true],
  ['transfer_shipping', 'Total transfer shipping charge'],
  ['sell_discount', 'Total sell discount'],
  ['customer_reward', 'Total customer reward'],
  ['sell_return', 'Total sell return (exc. tax)'],
  ['payroll', 'Total payroll'],
  ['project_materials', 'Project materials issued'],
];
const RIGHT_ROWS: [string, string, boolean?][] = [
  ['closing_stock_purchase', 'Closing stock (by purchase price)'],
  ['closing_stock_sale', 'Closing stock (by sale price)', true],
  ['total_sales', 'Total sales (exc. tax, discount)'],
  ['sell_shipping', 'Total sell shipping charge'],
  ['sell_additional_expenses', 'Sell additional expenses'],
  ['pos_charges', 'Packing, service charges & tips'],
  ['stock_recovered', 'Total stock recovered'],
  ['purchase_return', 'Total purchase return (exc. tax)'],
  ['purchase_discount', 'Total purchase discount'],
  ['round_off', 'Total sell round off'],
];

const GROUPS: [string, string, string][] = [
  ['product', 'Products', 'Product'],
  ['category', 'Categories', 'Category'],
  ['brand', 'Brands', 'Brand'],
  ['location', 'Locations', 'Location'],
  ['invoice', 'Invoice', 'Invoice No.'],
  ['date', 'Date', 'Date'],
  ['customer', 'Customer', 'Customer'],
  ['day', 'Day', 'Day'],
  ['staff', 'Service Staff', 'Service Staff'],
];

const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function ProfitLossReport({ T }: { T: Theme }) {
  const now = new Date();
  const [locs, setLocs] = React.useState<any[]>([]);
  const [filters, setFilters] = React.useState<any>({
    location_id: '',
    from: toLocalYmd(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: todayLocal(),
  });
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [group, setGroup] = React.useState('product');
  const [by, setBy] = React.useState<any>(null);
  const [q, setQ] = React.useState('');
  // Breakdown-table toolbar: toggleable columns + which dropdown menu is open.
  const [cols, setCols] = React.useState<Record<string, boolean>>({ sub: true, qty: true, sales: true, profit: true });
  const [menu, setMenu] = React.useState<null | 'cols' | 'pdf'>(null);

  React.useEffect(() => { API.location.list().then(setLocs).catch(() => {}); }, []);

  // Clear the breakdown as soon as the group changes so the table never shows
  // the previous group's rows under the new group's header.
  React.useEffect(() => { setBy(null); }, [group]);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const timer = setTimeout(() => {
      const params: any = { from: filters.from, to: filters.to };
      if (filters.location_id) params.location_id = filters.location_id;
      Promise.all([API.report.profitLoss(params), API.report.profitLossBy(group, params)])
        .then(([pl, byRes]: any[]) => { if (!dead) { setData(pl); setBy(byRes); } })
        .catch((e: any) => { if (!dead) { setErr(e?.message || 'Could not load the report.'); } })
        .finally(() => { if (!dead) setLoading(false); });
    }, 250);
    return () => { dead = true; clearTimeout(timer); };
  }, [filters, group]);

  const setF = (k: string, v: any) => setFilters((p: any) => ({ ...p, [k]: v }));
  const val = (side: 'left' | 'right', key: string) => Number(data?.[side]?.[key] || 0);
  const colTotal = (side: 'left' | 'right', rows: [string, string, boolean?][]) =>
    rows.reduce((s, [k, , info]) => info ? s : s + val(side, k), 0);
  const sum = data?.summary;

  // ── Profit-by table (client-side search + totals over the filtered set) ──
  const groupDef = GROUPS.find(g => g[0] === group) || GROUPS[0];
  const rows: any[] = (by?.rows || []).filter((r: any) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return String(r.label).toLowerCase().includes(needle) || String(r.sub || '').toLowerCase().includes(needle);
  });
  // Server totals cover the whole set (even past the 1,000-row cap); fall back
  // to summing the visible rows only while a search filter is active.
  const byTotals = q.trim()
    ? rows.reduce((a, r) => ({ qty: a.qty + (r.qty || 0), sales: a.sales + (r.sales || 0), profit: a.profit + (r.profit || 0) }), { qty: 0, sales: 0, profit: 0 })
    : { qty: by?.totals?.qty || 0, sales: by?.totals?.sales || 0, profit: by?.totals?.profit || 0 };

  // Visible columns beside the always-on label column; exports honour them too,
  // like the reference's DataTables toolbar.
  const colDefs = ([
    { key: 'sub', label: 'Details', right: false },
    { key: 'qty', label: 'Qty', right: true },
    { key: 'sales', label: 'Sales', right: true },
    { key: 'profit', label: 'Gross Profit', right: true },
  ] as const).filter(c => cols[c.key]);
  const cellOf = (r: any, key: string) => key === 'sub' ? (r.sub || '') : key === 'qty' ? r.qty : key === 'sales' ? r.sales : r.profit;
  const totalOf = (key: string) => key === 'sub' ? '' : (byTotals as any)[key];
  const exportName = () => {
    const period = data?.period || {};
    return `profit-by-${group}-${period.from || filters.from}-to-${period.to || filters.to}`;
  };

  function exportCSV() {
    const escCsv = (v: any) => {
      let s = String(v ?? '');
      // Formula-injection guard: neutralise leading =, +, -, @, tab, CR so a
      // product named "=HYPERLINK(...)" cannot execute when the CSV is opened.
      // Plain numbers (incl. negatives like -12.50) are data, not formulas.
      if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const fmt = (key: string, v: any) => (key === 'sales' || key === 'profit') ? Number(v).toFixed(2) : v;
    const head = [groupDef[2], ...colDefs.map(c => c.label)];
    const body = rows.map((r: any) => [r.label, ...colDefs.map(c => fmt(c.key, cellOf(r, c.key)))].map(escCsv).join(',')).join('\n');
    const totals = ['Total', ...colDefs.map(c => fmt(c.key, totalOf(c.key)))].map(escCsv).join(',');
    const blob = new Blob([head.join(',') + '\n' + body + '\n' + totals], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportExcel() {
    const XLSX: any = await import('xlsx');
    const aoa = [
      [groupDef[2], ...colDefs.map(c => c.label)],
      ...rows.map((r: any) => [r.label, ...colDefs.map(c => cellOf(r, c.key))]),
      ['Total', ...colDefs.map(c => totalOf(c.key))],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Profit by ' + groupDef[1]);
    XLSX.writeFile(wb, `${exportName()}.xlsx`);
  }

  // Print / Export PDF: standalone window, browser print dialog. For PDF the
  // user picks "Save as PDF"; @page pins the chosen orientation.
  function printBreakdown(orientation?: 'portrait' | 'landscape') {
    if (!rows.length || loading) return;
    const period = data?.period || {};
    const numCell = (key: string, v: any) => (key === 'sales' || key === 'profit') ? esc(money(v)) : esc(v);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Profit by ${esc(groupDef[1])} ${esc(period.from || filters.from)} – ${esc(period.to || filters.to)}</title>
<style>
  ${orientation ? `@page{size:A4 ${orientation};margin:14mm}` : ''}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;margin:28px;font-size:12.5px}
  h1{font-size:17px;margin:0 0 2px} .sub{color:#666;margin-bottom:14px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #ddd;padding:5px 8px;text-align:left} th{background:#f3f4f6}
  .r{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:700;background:#fafafa}
</style></head><body>
  <h1>Profit by ${esc(groupDef[1])}</h1>
  <div class="sub">${esc(period.from || filters.from)} to ${esc(period.to || filters.to)}</div>
  <table>
    <thead><tr><th>${esc(groupDef[2])}</th>${colDefs.map(c => `<th${c.right ? ' class="r"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r: any) => `<tr><td>${esc(r.label)}</td>${colDefs.map(c => `<td${c.right ? ' class="r"' : ''}>${numCell(c.key, cellOf(r, c.key))}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td>${colDefs.map(c => `<td${c.right ? ' class="r"' : ''}>${c.key === 'sub' ? '' : numCell(c.key, totalOf(c.key))}</td>`).join('')}</tr></tfoot>
  </table>
  <script>window.onload=function(){window.print()}</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=980,height=760');
    if (w) { w.document.write(html); w.document.close(); }
  }

  function printStatement() {
    if (!data || loading) return;
    // Label the printout with the period the DATA answers, not the possibly
    // newer filter values still loading behind the debounce.
    const pFrom = data.period?.from || filters.from, pTo = data.period?.to || filters.to;
    const locName = data.location_id ? ((locs.find((l: any) => String(l.id) === String(data.location_id)) || {}).name || '') : 'All locations';
    const row = (label: string, amount: number, info?: boolean) =>
      `<tr${info ? ' class="info"' : ''}><td>${esc(label)}</td><td class="r">${esc(money(amount))}</td></tr>`;
    const col = (title: string, side: 'left' | 'right', defs: [string, string, boolean?][]) => `
      <table><thead><tr><th colspan="2">${esc(title)}</th></tr></thead><tbody>
        ${defs.map(([k, label, info]) => row(label, val(side, k), info)).join('')}
        <tr class="grand"><td>Total</td><td class="r">${esc(money(colTotal(side, defs)))}</td></tr>
      </tbody></table>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Profit / Loss ${esc(pFrom)} – ${esc(pTo)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;margin:28px;font-size:13px}
  h1{font-size:18px;margin:0 0 2px} .sub{color:#666;margin-bottom:18px}
  .cols{display:flex;gap:24px;align-items:flex-start} .cols>table{flex:1}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left} th{background:#f3f4f6}
  .r{text-align:right;font-variant-numeric:tabular-nums}
  .info td{color:#888;font-style:italic}
  .grand{font-weight:700;background:#fafafa}
  .kpis{display:flex;gap:24px;margin:6px 0 18px} .kpis div{flex:1;border:1px solid #ddd;border-radius:6px;padding:10px}
  .kpis b{display:block;font-size:15px} .kpis span{color:#666;font-size:11.5px}
  @media print{button{display:none}}
</style></head><body>
  <h1>Profit / Loss Report</h1>
  <div class="sub">${esc(pFrom)} to ${esc(pTo)} · ${esc(locName)}</div>
  <div class="kpis">
    <div><span>Net sales</span><b>${esc(money(sum?.net_sales || 0))}</b></div>
    <div><span>COGS</span><b>${esc(money(sum?.cogs || 0))}</b></div>
    <div><span>Gross profit (${esc(sum?.gross_margin_pct ?? 0)}%)</span><b>${esc(money(sum?.gross_profit || 0))}</b></div>
    <div><span>Net profit (${esc(sum?.net_margin_pct ?? 0)}%)</span><b>${esc(money(sum?.net_profit || 0))}</b></div>
  </div>
  <div class="cols">
    ${col('Costs & Deductions', 'left', LEFT_ROWS)}
    ${col('Revenue & Income', 'right', RIGHT_ROWS)}
  </div>
  <table style="width:340px;margin-left:auto"><thead><tr><th colspan="2">Tax summary (informational)</th></tr></thead><tbody>
    <tr><td>Tax collected on sales</td><td class="r">${esc(money(data.tax?.output_tax || 0))}</td></tr>
    <tr><td>Tax paid on purchases</td><td class="r">${esc(money(data.tax?.input_tax_purchases || 0))}</td></tr>
    <tr><td>Tax paid on expenses</td><td class="r">${esc(money(data.tax?.input_tax_expenses || 0))}</td></tr>
    <tr class="grand"><td>Net tax</td><td class="r">${esc(money(data.tax?.net_tax || 0))}</td></tr>
  </tbody></table>
  <script>window.onload=function(){window.print()}</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=980,height=760');
    if (w) { w.document.write(html); w.document.close(); }
  }

  const th = (align: 'l' | 'r' = 'l'): React.CSSProperties => ({
    textAlign: align === 'r' ? 'right' : 'left', padding: '10px 14px', fontSize: 9.5, fontWeight: 700,
    letterSpacing: 0.8, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt,
    borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap',
  });
  const td = (): React.CSSProperties => ({ padding: '9px 14px', borderBottom: `1px solid ${T.line}`, verticalAlign: 'middle', fontSize: 13 });
  const moneyTd = (): React.CSSProperties => ({ ...td(), textAlign: 'right', fontFamily: T.fMono });

  const statementCol = (title: string, side: 'left' | 'right', defs: [string, string, boolean?][]) => (
    <Panel T={T} title={title} pad={false}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {defs.map(([k, label, info]) => (
            <tr key={k}>
              <td style={{ ...td(), color: info ? T.inkMute : T.inkMid, fontStyle: info ? 'italic' : 'normal' }}>{label}</td>
              <td style={{ ...moneyTd(), color: info ? T.inkMute : T.ink, fontStyle: info ? 'italic' : 'normal' }}>{money(val(side, k))}</td>
            </tr>
          ))}
          <tr style={{ background: T.paperAlt }}>
            <td style={{ ...td(), fontWeight: 700, color: T.ink }}>Total</td>
            <td style={{ ...moneyTd(), fontWeight: 700 }}>{money(colTotal(side, defs))}</td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );

  return (
    <>
      {/* filters + actions */}
      <div style={{ padding: '16px 20px', background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 420 }}>
            <FormGrid cols={3}>
              <Field T={T} label="Location">
                <SelectField T={T} value={filters.location_id}
                  options={['', ...locs.map((l: any) => String(l.id))]}
                  onChange={(v: any) => setF('location_id', v)}
                  render={(o: any) => o === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
              </Field>
              <Field T={T} label="From"><TextField T={T} type="date" value={filters.from} onChange={(v: any) => setF('from', v)} /></Field>
              <Field T={T} label="To"><TextField T={T} type="date" value={filters.to} onChange={(v: any) => setF('to', v)} /></Field>
            </FormGrid>
          </div>
          <div style={{ display: 'flex', gap: 8, paddingBottom: 2 }}>
            <Btn T={T} kind="ghost" onClick={printStatement} disabled={!data || loading}><LuPrinter size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Print</Btn>
          </div>
        </div>
      </div>

      {err && (
        <Panel T={T}>
          <div style={{ color: T.red, fontSize: 13 }}>{err}</div>
        </Panel>
      )}

      {!err && (
        <>
          {/* summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16, opacity: loading ? 0.6 : 1 }}>
            <StatCard T={T} label="Net sales" value={money(sum?.net_sales || 0)} sub="Sales − discounts − rewards − returns" />
            <StatCard T={T} label="COGS" value={money(sum?.cogs || 0)} sub="FIFO cost of goods sold, net of restocked returns" />
            <StatCard T={T} label="Gross profit" value={money(sum?.gross_profit || 0)} sub={`Net sales − COGS · ${sum?.gross_margin_pct ?? 0}% margin`} />
            <StatCard T={T} label="Net profit" value={money(sum?.net_profit || 0)} sub={`Gross + other income − expenses · ${sum?.net_margin_pct ?? 0}% margin`} />
          </div>

          {/* two-column statement */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16, opacity: loading ? 0.6 : 1 }}>
            {statementCol('Costs & Deductions', 'left', LEFT_ROWS)}
            {statementCol('Revenue & Income', 'right', RIGHT_ROWS)}
          </div>

          {/* tax summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Panel T={T} title="Tax summary (informational)" pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={td()}>Tax collected on sales</td><td style={moneyTd()}>{money(data?.tax?.output_tax || 0)}</td></tr>
                  <tr><td style={td()}>Tax paid on purchases</td><td style={moneyTd()}>{money(data?.tax?.input_tax_purchases || 0)}</td></tr>
                  <tr><td style={td()}>Tax paid on expenses</td><td style={moneyTd()}>{money(data?.tax?.input_tax_expenses || 0)}</td></tr>
                  <tr style={{ background: T.paperAlt }}>
                    <td style={{ ...td(), fontWeight: 700 }}>Net tax</td>
                    <td style={{ ...moneyTd(), fontWeight: 700 }}>{money(data?.tax?.net_tax || 0)}</td>
                  </tr>
                </tbody>
              </table>
            </Panel>
            <Panel T={T} title="Notes">
              <div style={{ fontSize: 12.5, color: T.inkMid, lineHeight: 1.7 }}>
                Profit is computed from the sold lines&apos; FIFO costs — the same basis as the &quot;Profit by&quot;
                breakdowns and the ledger. The two columns are the reconciliation view: stock values are
                reconstructed from cost layers at each boundary date (sale-price rows use today&apos;s selling
                prices and are indicative), the purchase row shows purchase documents, and italic rows are
                informational — freight and duties already reach COGS inside landed layer costs.
                Stock received in this period at landed cost:{' '}
                <b style={{ color: T.ink }}>{money(sum?.purchases_received || 0)}</b> from purchases,{' '}
                <b style={{ color: T.ink }}>{money(sum?.stock_received_other || 0)}</b> from opening stock,
                restocked returns and other inflows. Payroll is recorded by month, so a partial-month
                range includes each touched month&apos;s full payroll.
              </div>
            </Panel>
          </div>

          {/* profit by … */}
          <Panel T={T} title="Profit by" pad={false}>
            <div style={{ padding: '14px 16px 0' }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', background: T.paperAlt, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
                {GROUPS.map(([gid, lbl]) => (
                  <button key={gid} onClick={() => setGroup(gid)}
                    style={{ padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: group === gid ? 700 : 500, background: group === gid ? T.accent.base : 'transparent', color: group === gid ? T.accent.on : T.inkMid }}>{lbl}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 320 }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.inkMute, display: 'inline-flex' }}><LuSearch size={14} /></span>
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
                    style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }} />
                {by?.limited && <span style={{ fontSize: 11.5, color: T.inkMute }}>Showing the first 1,000 rows</span>}
                <Btn T={T} kind="ghost" onClick={exportCSV} disabled={!rows.length || loading}><LuDownload size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Export CSV</Btn>
                <Btn T={T} kind="ghost" onClick={exportExcel} disabled={!rows.length || loading}><LuFileSpreadsheet size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Export Excel</Btn>
                <Btn T={T} kind="ghost" onClick={() => printBreakdown()} disabled={!rows.length || loading}><LuPrinter size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Print</Btn>
                <div style={{ position: 'relative' }}>
                  <Btn T={T} kind="ghost" onClick={() => setMenu(menu === 'cols' ? null : 'cols')}><LuColumns3 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Column visibility<LuChevronDown size={12} style={{ verticalAlign: -1, marginLeft: 5 }} /></Btn>
                  {menu === 'cols' && (
                    <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 30, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, minWidth: 170 }}>
                      {([['sub', 'Details'], ['qty', 'Qty'], ['sales', 'Sales'], ['profit', 'Gross Profit']] as const).map(([k, lbl]) => (
                        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontFamily: T.fBody, color: T.ink }}>
                          <input type="checkbox" checked={cols[k]} onChange={() => setCols(p => ({ ...p, [k]: !p[k] }))} />
                          {lbl}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <Btn T={T} kind="ghost" onClick={() => setMenu(menu === 'pdf' ? null : 'pdf')} disabled={!rows.length || loading}><LuFileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Export PDF<LuChevronDown size={12} style={{ verticalAlign: -1, marginLeft: 5 }} /></Btn>
                  {menu === 'pdf' && (
                    <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 30, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, minWidth: 140 }}>
                      {(['portrait', 'landscape'] as const).map(o => (
                        <button key={o} onClick={() => { setMenu(null); printBreakdown(o); }}
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
            </div>
            {menu && <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead><tr>
                  <th style={th()}>{groupDef[2]}</th>
                  {colDefs.map(c => <th key={c.key} style={th(c.right ? 'r' : 'l')}>{c.label}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((r: any, i: number) => (
                    <tr key={i}>
                      <td style={{ ...td(), color: T.ink, fontWeight: 550 }}>{r.label}</td>
                      {colDefs.map(c => c.key === 'sub'
                        ? <td key={c.key} style={{ ...td(), color: T.inkMute, fontSize: 12 }}>{r.sub || ''}</td>
                        : c.key === 'qty'
                          ? <td key={c.key} style={moneyTd()}>{r.qty}</td>
                          : <td key={c.key} style={{ ...moneyTd(), color: c.key === 'profit' && r.profit < 0 ? T.red : T.ink }}>{money(cellOf(r, c.key))}</td>)}
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={1 + colDefs.length} style={{ ...td(), textAlign: 'center', color: T.inkMute, padding: 26 }}>
                      {loading ? 'Loading…' : 'No sales in this period.'}
                    </td></tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot><tr style={{ background: T.paperAlt }}>
                    <td style={{ ...td(), fontWeight: 700 }}>Total</td>
                    {colDefs.map(c => c.key === 'sub'
                      ? <td key={c.key} style={td()} />
                      : c.key === 'qty'
                        ? <td key={c.key} style={{ ...moneyTd(), fontWeight: 700 }}>{byTotals.qty}</td>
                        : <td key={c.key} style={{ ...moneyTd(), fontWeight: 700 }}>{money(totalOf(c.key))}</td>)}
                  </tr></tfoot>
                )}
              </table>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
