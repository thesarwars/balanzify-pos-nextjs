'use client';
/**
 * HRM — My Payrolls: what the logged-in employee is paid.
 *
 * Everything else in the module is scoped to the business and gated on a
 * manager role, so until now nobody could see their own payslip — the only
 * Print-payslip button in the product lived in the admin profile drawer.
 * These read /hrm/me/*, which resolve the caller through Employee.userId.
 */
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Badge } from '@/components/kit';
import { API } from '@/lib/api';
import { ListToolbar, ListFooter, usePaged } from '@/components/list-chrome';
import { LuTriangleAlert, LuPrinter } from 'react-icons/lu';

const TABS: [string, string][] = [['components', 'Pay Components'], ['payrolls', 'All Payrolls']];

// The payslip endpoint returns JSON behind a bearer token, so it cannot simply
// be opened in a tab — fetch it, then render.
async function printMyPayslip(row: any) {
  let ps: any = null;
  try { ps = await API.hrm.payslip(row.id); } catch { /* fall back to the row */ }
  const w = window.open('', '_blank', 'width=640,height=760');
  if (!w) return;
  const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const line = (label: string, val: number, neg = false) =>
    `<tr><td style="color:#555;padding:3px 0">${esc(label)}</td><td style="text-align:right;font-family:monospace;color:${neg ? '#b3261e' : '#1a1a1a'}">${neg ? '-' : ''}${Math.abs(Number(val) || 0).toFixed(2)}</td></tr>`;
  const earn = ps
    ? [line('Basic salary', ps.earnings.basic),
       ...(ps.earnings.allowance ? [line('Allowance', ps.earnings.allowance)] : []),
       ...(ps.earnings.overtime ? [line('Overtime', ps.earnings.overtime)] : []),
       ...(ps.earnings.bonus ? [line('Bonus', ps.earnings.bonus)] : []),
       ...(ps.earnings.incentive ? [line('Incentive', ps.earnings.incentive)] : []),
       ...(ps.earning_items || []).map((i: any) => line(i.description, i.amount))].join('')
    : line('Basic salary', row.basic);
  const ded = ps
    ? [...(ps.deductions.items || []).map((i: any) => line(i.description, i.amount, true)),
       ...(ps.deductions.advance_recovered ? [line('Advance recovered', ps.deductions.advance_recovered, true)] : []),
       ...(ps.statutory ? [line(`Statutory (${ps.statutory.country})`, ps.statutory.total, true)] : [])].join('')
    : line('Deductions', row.deduction, true);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${esc(row.reference_no || row.month)}</title></head>
<body style="font-family:system-ui,sans-serif;margin:32px;color:#1a1a1a;font-size:13px">
  <h1 style="font-size:18px;margin:0 0 2px">Payslip</h1>
  <div style="color:#666;margin-bottom:16px">${esc(row.month)}${row.reference_no ? ' · ' + esc(row.reference_no) : ''}</div>
  <table style="width:100%;border-collapse:collapse">
    <tr><td colspan="2" style="font-weight:700;padding-top:8px;border-bottom:1px solid #ddd">Earnings</td></tr>
    ${earn}
    <tr><td colspan="2" style="font-weight:700;padding-top:12px;border-bottom:1px solid #ddd">Deductions</td></tr>
    ${ded}
    <tr><td style="font-weight:700;padding-top:12px;border-top:2px solid #1a1a1a">Net pay</td>
        <td style="text-align:right;font-family:monospace;font-weight:700;padding-top:12px;border-top:2px solid #1a1a1a">${(Number(row.net) || 0).toFixed(2)}</td></tr>
  </table>
  <script>window.onload=function(){window.print()}</script>
</body></html>`);
  w.document.close();
}

export function MyPayrolls({ T }: { T: Theme }) {
  const [tab, setTab] = React.useState('components');
  const [comps, setComps] = React.useState<any[]>([]);
  const [rows, setRows] = React.useState<any[]>([]);
  const [err, setErr] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let dead = false;
    Promise.all([API.hrm.myPayComponents(), API.hrm.myPayroll()])
      .then(([c, p]: any[]) => { if (!dead) { setComps(c || []); setRows(p || []); } })
      .catch((e: any) => { if (!dead) setErr(e?.message || 'Could not load your payroll.'); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, []);

  const paged = usePaged(rows);
  const th = (align: 'l' | 'r' = 'l'): React.CSSProperties => ({
    padding: '10px 18px', textAlign: align === 'r' ? 'right' : 'left', fontSize: 11, fontWeight: 700,
    letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt,
    borderBottom: `1px solid ${T.line}`,
  });
  const td = (align: 'l' | 'r' = 'l'): React.CSSProperties => ({
    padding: '11px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5,
    textAlign: align === 'r' ? 'right' : 'left', color: T.inkSub,
  });

  const table = () => tab === 'components'
    ? { title: 'My pay components', fileName: 'my-pay-components',
        cols: ['Description', 'Type', 'Amount', 'Applicable date'],
        rows: comps.map(c => [c.description, c.type, c.amount_type === 'percentage' ? `${c.amount}%` : c.amount, c.applicable_date || '']) }
    : { title: 'My payrolls', fileName: 'my-payrolls',
        cols: ['Month/Year', 'Reference No', 'Total amount', 'Deduction', 'Net', 'Payment status'],
        rows: rows.map(p => [p.month, p.reference_no || '', p.gross, p.deduction, p.net, p.payment_status]) };

  if (err) {
    return (
      <Panel T={T}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: T.redText, fontSize: 13 }}>
          <LuTriangleAlert size={15} />{err}
        </div>
      </Panel>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
        {TABS.map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>
            {lbl}
          </button>
        ))}
      </div>

      <ListToolbar T={T} table={table} />

      {tab === 'components' && (
        <Panel T={T} title="Pay components" pad={false}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Description', 'Type', 'Amount', 'Applicable date'].map((h, i) => <th key={h} style={th(i === 2 ? 'r' : 'l')}>{h}</th>)}</tr></thead>
            <tbody>
              {comps.length === 0 && <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>{loading ? 'Loading…' : 'No data found'}</td></tr>}
              {comps.map((c: any) => (
                <tr key={c.id}>
                  <td style={{ ...td(), fontSize: 13, fontWeight: 600, color: T.ink }}>{c.description}</td>
                  <td style={td()}><Badge T={T} tone={c.type === 'earning' ? 'green' : 'red'}>{c.type}</Badge></td>
                  <td style={{ ...td('r'), fontFamily: T.fMono, color: T.ink }}>{c.amount_type === 'percentage' ? `${c.amount}% of basic` : money(c.amount)}</td>
                  <td style={{ ...td(), fontFamily: T.fMono }}>{c.applicable_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === 'payrolls' && (
        <Panel T={T} title="All payrolls" pad={false}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Month/Year', 'Reference No', 'Total amount', 'Deduction', 'Net', 'Payment status', ''].map((h, i) => <th key={h} style={th(i >= 2 && i <= 4 ? 'r' : 'l')}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>{loading ? 'Loading…' : 'No data available in table'}</td></tr>}
              {paged.slice.map((p: any) => (
                <tr key={p.id}>
                  <td style={{ ...td(), fontFamily: T.fMono, fontWeight: 600, color: T.ink }}>{p.month}</td>
                  <td style={{ ...td(), fontFamily: T.fMono }}>{p.reference_no || '—'}</td>
                  <td style={{ ...td('r'), fontFamily: T.fMono, color: T.ink }}>{money(p.gross)}</td>
                  <td style={{ ...td('r'), fontFamily: T.fMono, color: T.redText }}>−{money(p.deduction)}</td>
                  <td style={{ ...td('r'), fontFamily: T.fMono, fontWeight: 700, color: T.ink }}>{money(p.net)}</td>
                  <td style={td()}><Badge T={T} tone={p.payment_status === 'paid' ? 'green' : 'amber'}>{p.payment_status}</Badge></td>
                  <td style={{ ...td('r') }}>
                    {p.payment_status === 'paid' && (
                      <Btn T={T} kind="ghost" onClick={() => printMyPayslip(p)}>
                        <LuPrinter size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Payslip
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '0 18px' }}><ListFooter T={T} paged={paged} /></div>
        </Panel>
      )}
    </>
  );
}
