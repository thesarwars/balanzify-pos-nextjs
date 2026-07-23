'use client';
// ─────────────────────────────────────────────────────────────────
// Purchase & Sale report — purchase totals, returns and supplier dues
// against sale totals, sell returns and receivables for a date range,
// with the reference's Overall (sale − return) − (purchase − return)
// and net-due lines.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting } from '@/lib/business-settings';
import { DATE_PRESETS, presetRange } from './date-presets';
import { LuPrinter, LuChevronDown, LuCalendarDays } from 'react-icons/lu';

const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const PURCHASE_ROWS: [string, string][] = [
  ['total_ex_tax', 'Total purchase (exc. tax)'],
  ['total_inc_tax', 'Purchase including tax'],
  ['returns', 'Total purchase return (exc. tax)'],
  ['due', 'Purchase due'],
];
const SALE_ROWS: [string, string][] = [
  ['total_ex_tax', 'Total sale (exc. tax)'],
  ['total_inc_tax', 'Sale including tax'],
  ['returns', 'Total sell return (exc. tax)'],
  ['due', 'Sale due'],
];

export function PurchaseSaleReport({ T }: { T: Theme }) {
  const fyStart = Number(getSetting('fy_start_month', 1)) || 1;
  const [preset, setPreset] = React.useState('this_month');
  const [locs, setLocs] = React.useState<any[]>([]);
  const [filters, setFilters] = React.useState<any>(() => {
    const [from, to] = presetRange('this_month', 1)!;
    return { location_id: '', from, to };
  });
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => { API.location.list().then(setLocs).catch(() => {}); }, []);

  React.useEffect(() => {
    let dead = false;
    setLoading(true); setErr('');
    const timer = setTimeout(() => {
      const params: any = { from: filters.from, to: filters.to };
      if (filters.location_id) params.location_id = filters.location_id;
      API.report.purchaseSale(params)
        .then((r: any) => { if (!dead) setData(r); })
        .catch((e: any) => { if (!dead) setErr(e?.message || 'Could not load the report.'); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 250);
    return () => { dead = true; clearTimeout(timer); };
  }, [filters]);

  const setF = (k: string, v: any) => {
    if (k === 'from' || k === 'to') setPreset('custom');
    setFilters((p: any) => ({ ...p, [k]: v }));
  };
  function pickPreset(key: string) {
    setMenu(false);
    setPreset(key);
    const range = presetRange(key, fyStart);
    if (range) setFilters((p: any) => ({ ...p, from: range[0], to: range[1] }));
  }

  const td = (): React.CSSProperties => ({ padding: '10px 14px', borderBottom: `1px solid ${T.line}`, fontSize: 13 });
  const moneyTd = (): React.CSSProperties => ({ ...td(), textAlign: 'right', fontFamily: T.fMono });
  const section = (title: string, side: 'purchases' | 'sales', rows: [string, string][]) => (
    <Panel T={T} title={title} pad={false}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([k, label]) => (
            <tr key={k}>
              <td style={{ ...td(), color: T.inkMid, fontWeight: k === 'due' ? 600 : 450 }}>{label}</td>
              <td style={{ ...moneyTd(), color: T.ink }}>{money(Number(data?.[side]?.[k] || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );

  const overall = data?.overall || {};
  const tone = (n: number) => n < 0 ? T.red : T.ink;

  function printReport() {
    if (!data || loading) return;
    const pFrom = data.period?.from || filters.from, pTo = data.period?.to || filters.to;
    const locName = data.location_id ? ((locs.find((l: any) => String(l.id) === String(data.location_id)) || {}).name || '') : 'All locations';
    const rowsHtml = (side: 'purchases' | 'sales', rows: [string, string][]) =>
      rows.map(([k, label]) => `<tr><td>${esc(label)}</td><td class="r">${esc(money(Number(data[side]?.[k] || 0)))}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Purchase &amp; Sale ${esc(pFrom)} – ${esc(pTo)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;margin:28px;font-size:13px}
  h1{font-size:18px;margin:0 0 2px} .sub{color:#666;margin-bottom:18px}
  .cols{display:flex;gap:24px} .cols>table{flex:1}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left} th{background:#f3f4f6}
  .r{text-align:right;font-variant-numeric:tabular-nums}
  .neg{color:#c0392b} .overall td{font-weight:700}
</style></head><body>
  <h1>Purchase &amp; Sale Report</h1>
  <div class="sub">${esc(pFrom)} to ${esc(pTo)} · ${esc(locName)}</div>
  <div class="cols">
    <table><thead><tr><th colspan="2">Purchases</th></tr></thead><tbody>${rowsHtml('purchases', PURCHASE_ROWS)}</tbody></table>
    <table><thead><tr><th colspan="2">Sales</th></tr></thead><tbody>${rowsHtml('sales', SALE_ROWS)}</tbody></table>
  </div>
  <table style="width:420px"><thead><tr><th colspan="2">Overall ((Sale − Sell Return) − (Purchase − Purchase Return))</th></tr></thead><tbody class="overall">
    <tr><td>Sale − Purchase</td><td class="r${(overall.sale_minus_purchase || 0) < 0 ? ' neg' : ''}">${esc(money(overall.sale_minus_purchase || 0))}</td></tr>
    <tr><td>Due amount</td><td class="r${(overall.due_amount || 0) < 0 ? ' neg' : ''}">${esc(money(overall.due_amount || 0))}</td></tr>
  </tbody></table>
  <script>window.onload=function(){window.print()}</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=980,height=720');
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <>
      {/* filters */}
      <div style={{ padding: '16px 20px', background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', paddingBottom: 2 }}>
            <Btn T={T} kind="accent" onClick={() => setMenu(!menu)}>
              <LuCalendarDays size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
              {(DATE_PRESETS.find(([k]) => k === preset) || [, 'Filter by date'])[1]}
              <LuChevronDown size={12} style={{ verticalAlign: -1, marginLeft: 6 }} />
            </Btn>
            {menu && (
              <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 30, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, minWidth: 190, maxHeight: 340, overflowY: 'auto' }}>
                {DATE_PRESETS.map(([k, lbl]) => (
                  <button key={k} onClick={() => pickPreset(k)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: T.fBody, fontWeight: preset === k ? 700 : 450, background: preset === k ? T.accent.base : 'transparent', color: preset === k ? T.accent.on : T.ink }}
                    onMouseEnter={e => { if (preset !== k) e.currentTarget.style.background = T.paperAlt; }}
                    onMouseLeave={e => { if (preset !== k) e.currentTarget.style.background = 'transparent'; }}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
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
            <Btn T={T} kind="ghost" onClick={printReport} disabled={!data || loading}><LuPrinter size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Print</Btn>
          </div>
        </div>
      </div>
      {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}

      {err && <Panel T={T}><div style={{ color: T.red, fontSize: 13 }}>{err}</div></Panel>}

      {!err && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16, opacity: loading ? 0.6 : 1 }}>
            {section('Purchases', 'purchases', PURCHASE_ROWS)}
            {section('Sales', 'sales', SALE_ROWS)}
          </div>
          <Panel T={T} title="Overall ((Sale − Sell Return) − (Purchase − Purchase Return))">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: loading ? 0.6 : 1 }}>
              <div style={{ fontSize: 15.5 }}>
                <span style={{ color: T.inkMid }}>Sale − Purchase: </span>
                <b style={{ fontFamily: T.fMono, color: tone(overall.sale_minus_purchase || 0) }}>{money(overall.sale_minus_purchase || 0)}</b>
              </div>
              <div style={{ fontSize: 15.5 }}>
                <span style={{ color: T.inkMid }}>Due amount: </span>
                <b style={{ fontFamily: T.fMono, color: tone(overall.due_amount || 0) }}>{money(overall.due_amount || 0)}</b>
              </div>
              <div style={{ fontSize: 12, color: T.inkMute }}>
                Due amount = sale receivables − supplier dues for orders in the range. Sell returns are ex-tax
                (refunds are recorded from ex-tax unit prices).
              </div>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
