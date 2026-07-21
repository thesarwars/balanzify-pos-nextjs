'use client';
// ─────────────────────────────────────────────────────────────────
// Import expense — one expense per spreadsheet row, columns per the
// reference template. Parsed in the browser (SheetJS on demand),
// auto-mapped by header name, posted to /expenses/import which
// reports per-row results and creates missing categories on demand.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Panel } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { readSheet } from '../../purchase-orders/components/import-lines';
import { LuUpload, LuDownload, LuTriangleAlert, LuCircleCheck } from 'react-icons/lu';

// Template columns, in the reference's order. `aliases` drive the auto-map.
const COLS: { key: string; label: string; note?: string; aliases: string[] }[] = [
  { key: 'location',       label: 'Business Location',   aliases: ['business location', 'location'] },
  { key: 'category',       label: 'Expense Category',    note: 'Created if not found', aliases: ['expense category', 'category'] },
  { key: 'sub_category',   label: 'Sub category',        note: 'Created under the category if not found', aliases: ['sub category', 'subcategory', 'sub-category'] },
  { key: 'ref_no',         label: 'Reference No',        note: 'Leave empty to autogenerate', aliases: ['reference no', 'ref', 'reference'] },
  { key: 'date',           label: 'Date',                note: 'Y-m-d H:i:s (2026-07-15 17:45:32)', aliases: ['date', 'expense date'] },
  { key: 'expense_for',    label: 'Expense for',         note: 'Staff email or name', aliases: ['expense for', 'user'] },
  { key: 'contact_id',     label: 'Contact ID',          aliases: ['contact id', 'contact'] },
  { key: 'tax',            label: 'Applicable Tax',      note: 'Tax rate name', aliases: ['applicable tax', 'tax'] },
  { key: 'note',           label: 'Expense note',        aliases: ['expense note', 'note'] },
  { key: 'total_amount',   label: 'Total amount',        note: 'Required', aliases: ['total amount', 'amount', 'total'] },
  { key: 'paid_amount',    label: 'Paid Amount',         aliases: ['paid amount', 'paid'] },
  { key: 'paid_on',        label: 'Paid on',             note: 'Y-m-d H:i:s', aliases: ['paid on', 'payment date'] },
  { key: 'payment_method', label: 'Payment Method',      note: 'Cash, Card, Cheque, Bank Transfer, Other', aliases: ['payment method', 'method'] },
];

const norm = (s: string) => String(s || '').trim().toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');

export function ExpenseImport({ T, onBack }: { T: Theme; onBack: () => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit() {
    if (!file) { setErr('Choose a file first.'); return; }
    setBusy(true); setErr(null); setResult(null);
    try {
      const grid = await readSheet(file);
      if (grid.length < 1) { setErr('That file has no rows.'); setBusy(false); return; }
      const head = grid[0].map(norm);
      const idx: Record<string, number> = {};
      for (const c of COLS) idx[c.key] = head.findIndex((h) => [norm(c.label), ...c.aliases.map(norm)].includes(h));
      if (idx.total_amount < 0) { setErr('No "Total amount" column found — start from the template.'); setBusy(false); return; }
      const rows = grid.slice(1)
        .filter((r) => r.some((c) => String(c || '').trim() !== ''))
        .map((r) => {
          const cell = (k: string) => (idx[k] >= 0 && idx[k] < r.length ? String(r[idx[k]] || '').trim() : '');
          const num = (k: string) => { const n = parseFloat(cell(k).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : undefined; };
          // XLSX date cells arrive as Excel serial numbers (days since 1900) —
          // convert them, or every date would silently import as garbage.
          const dateCell = (k: string) => {
            const v = cell(k);
            if (!v) return undefined;
            if (/^\d{4,6}(\.\d+)?$/.test(v)) {
              const serial = parseFloat(v);
              const d = new Date(Math.round((serial - 25569) * 86400000));
              return Number.isNaN(d.getTime()) ? v : d.toISOString();
            }
            return v;
          };
          return {
            location: cell('location') || undefined, category: cell('category') || undefined,
            sub_category: cell('sub_category') || undefined, ref_no: cell('ref_no') || undefined,
            date: dateCell('date'), expense_for: cell('expense_for') || undefined,
            contact_id: cell('contact_id') || undefined, tax: cell('tax') || undefined,
            note: cell('note') || undefined, total_amount: num('total_amount'),
            paid_amount: num('paid_amount'), paid_on: dateCell('paid_on'),
            payment_method: cell('payment_method') || undefined,
          };
        });
      if (!rows.length) { setErr('No data rows found.'); setBusy(false); return; }
      const res = await API.expense.importRows(rows);
      setResult(res);
      if (res.imported) setFile(null);
    } catch (e: any) {
      setErr(e.message || 'Import failed.');
    } finally { setBusy(false); }
  }

  function downloadTemplate() {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const example = ['Main Store', 'Rent', 'Shop rent', '', '2026-07-15 17:45:32', '', '', '', 'July rent', '600', '600', '2026-07-15 17:45:32', 'Cash'];
    const csv = [COLS.map((c) => esc(c.label)).join(','), example.map(esc).join(',')].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'expenses-import-template.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '9px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` };
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12.5, color: T.ink, borderBottom: `1px solid ${T.line}` };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Import expense" subtitle="One expense per spreadsheet row"
        right={<Btn T={T} kind="ghost" onClick={onBack}>← Expenses</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <Panel T={T} title="File to import">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setFile(e.target.files && e.target.files[0]); setResult(null); setErr(null); }}
                style={{ fontSize: 13, color: T.inkMid }} />
              <Btn T={T} kind="accent" onClick={submit} disabled={busy || !file}><LuUpload size={15} /> {busy ? 'Importing…' : 'Submit'}</Btn>
              <div style={{ marginLeft: 'auto' }}>
                <Btn T={T} kind="ghost" onClick={downloadTemplate}><LuDownload size={15} /> Download template file</Btn>
              </div>
            </div>
            {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
          </Panel>

          {result && (
            <Panel T={T} title="Import result">
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: result.errors?.length ? 14 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, color: '#0E9F6E' }}>
                  <LuCircleCheck size={18} /> {result.imported} imported
                </div>
                {!!result.failed && <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, color: T.redText }}>
                  <LuTriangleAlert size={18} /> {result.failed} failed
                </div>}
              </div>
              {result.errors?.length > 0 && (
                <div style={{ border: `1px solid ${T.line}`, borderRadius: 9, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Row</th><th style={th}>Reason</th></tr></thead>
                    <tbody>{result.errors.map((e: any, i: number) => (
                      <tr key={i}><td style={td}>{e.row}</td><td style={{ ...td, color: T.redText }}>{e.error}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          <Panel T={T} title="Instructions">
            <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={{ ...th, width: 110 }}>Column</th><th style={th}>Column Name</th><th style={th}>Instruction</th></tr></thead>
                <tbody>
                  {COLS.map((c, i) => (
                    <tr key={c.key}>
                      <td style={{ ...td, fontFamily: T.fMono, color: T.inkSub }}>{i + 1}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{c.label}</td>
                      <td style={{ ...td, color: T.inkSub }}>{c.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
