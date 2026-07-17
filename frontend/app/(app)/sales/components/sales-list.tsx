'use client';
// ─────────────────────────────────────────────────────────────────
// Sales — every sale, POS and invoice alike.
//
// Payment status is derived from the money columns (amountPaid /
// amountDue), never a separate flag, so it can never disagree with
// them. Draft / Quotation / Proforma owe nothing yet, so they show
// no payment status at all.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Badge, Panel, Field, TextField, SelectField, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { money } from '@/lib/theme';
import { formatDate, todayLocal } from '@/lib/business-settings';
import { API } from '@/lib/api';
import { LuEye, LuUndo2, LuBadgeCheck, LuTruck, LuPrinter, LuClipboardList, LuFileText, LuWallet, LuLink, LuMail, LuPencil, LuTrash2 } from 'react-icons/lu';
import { ActionsMenu } from '../../products/components/list-table';
import { ConfirmModal } from '../../purchase-orders/components/bits';
import { SellReturnModal } from './sell-return-modal';
import { SellDetailsModal, printInvoice, printPackingSlip, printDeliveryNote } from './sell-details-modal';
import { EditShippingModal } from './edit-shipping-modal';
import { ViewPaymentsModal, InvoiceUrlModal, SendNotificationModal } from './sale-action-modals';

const { useState, useEffect, useMemo, useCallback } = React;

const PAYMENT_STATUSES: [string, string][] = [['', 'All'], ['paid', 'Paid'], ['partial', 'Partial'], ['due', 'Due']];
const SHIPPING_STATUSES: [string, string][] = [['', 'All'], ['pending', 'Pending'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];
const SALE_STATUSES: [string, string][] = [['', 'All'], ['completed', 'Final'], ['draft', 'Draft'], ['quotation', 'Quotation'], ['proforma', 'Proforma'], ['refunded', 'Refunded']];

const COLUMNS: { key: string; label: string; num?: boolean }[] = [
  { key: 'date', label: 'Date' },
  { key: 'invoice_no', label: 'Invoice No.' },
  { key: 'customer_name', label: 'Customer name' },
  { key: 'contact_number', label: 'Contact Number' },
  { key: 'location_name', label: 'Location' },
  { key: 'payment_status', label: 'Payment Status' },
  { key: 'payment_method', label: 'Payment Method' },
  { key: 'total', label: 'Total amount', num: true },
  { key: 'paid', label: 'Total paid', num: true },
  { key: 'due', label: 'Sell Due', num: true },
  { key: 'sell_return', label: 'Sell Return', num: true },
  { key: 'shipping_status', label: 'Shipping Status' },
  { key: 'total_items', label: 'Total Items', num: true },
  { key: 'added_by', label: 'Added By' },
  { key: 'sell_note', label: 'Sell note' },
  { key: 'staff_note', label: 'Staff note' },
];

const STATUS_TONE: Record<string, any> = { paid: 'green', partial: 'amber', due: 'red' };
const DOC_TONE: Record<string, any> = { draft: 'gray', quotation: 'blue', proforma: 'blue', refunded: 'red' };
const title = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ') : '');

// A preset pins the list to one slice (List POS / Drafts / Quotations / Sell
// Returns / Shipments): it is merged into every query underneath the user's own
// filters and names the page.
export type SalesPreset = { type?: string; status?: string; has_returns?: boolean; has_shipping?: boolean; title: string };

export function SalesList({ T, onAdd, onEdit, flash, preset }:
  { T: any; onAdd: () => void; onEdit?: (row: any) => void; flash?: React.MutableRefObject<string>; preset?: SalesPreset }) {
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [filters, setFilters] = useState<any>({
    location_id: '', customer_id: '', payment_status: '', cashier_id: '',
    shipping_status: '', payment_method: '', status: '', from: '', to: '', search: '',
  });
  const [showFilters, setShowFilters] = useState(true);
  const [perPage, setPerPage] = useState('25');
  const [hidden, setHidden] = useState<Record<string, boolean>>({ sell_note: true, staff_note: true });
  const [showCols, setShowCols] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [returning, setReturning] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [shipping, setShipping] = useState<any>(null);
  const [payments, setPayments] = useState<any>(null);
  const [invoiceUrl, setInvoiceUrl] = useState<any>(null);
  const [notify, setNotify] = useState<{ row: any; template: 'sale' | 'payment' } | null>(null);
  const [show, toastNode] = useToast();

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    API.location.list().then(setLocations).catch(() => {});
    API.contact.list({ type: 'customer' }).then(setCustomers).catch(() => {});
    API.user.list().then(setUsers).catch(() => {});
    // A confirmation handed over from the Add Sale screen we just came back from.
    if (flash && flash.current) { show(flash.current); flash.current = ''; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced, and the last response to arrive is ignored unless it is the last
  // one asked for — otherwise typing "abc" can leave the grid showing "a".
  useEffect(() => {
    let dead = false;
    setLoading(true);
    const timer = setTimeout(() => {
      API.sell.rows({ ...filters,
        ...(preset?.type && { type: preset.type }),
        ...(preset?.status && { status: preset.status }),
        ...(preset?.has_returns && { has_returns: '1' }),
        ...(preset?.has_shipping && { has_shipping: '1' }),
        limit: perPage })
        .then((r: any) => { if (dead) return; setRows(r.rows); setTotals(r.totals); })
        .catch(() => { if (dead) return; setRows([]); setTotals(null); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 250);
    return () => { dead = true; clearTimeout(timer); };
  }, [filters, perPage, nonce, preset?.type, preset?.status, preset?.has_returns, preset?.has_shipping]);

  const setF = (k: string, v: any) => setFilters((p: any) => ({ ...p, [k]: v }));
  const clear = () => setFilters({ location_id: '', customer_id: '', payment_status: '', cashier_id: '', shipping_status: '', payment_method: '', status: '', from: '', to: '', search: '' });
  const activeCount = Object.values(filters).filter(Boolean).length;
  const cols = useMemo(() => COLUMNS.filter((c) => !hidden[c.key]), [hidden]);

  const rangeLabel = filters.from || filters.to
    ? `${formatDate(filters.from || '')} ~ ${formatDate(filters.to || todayLocal())}`
    : 'All time';

  function exportCSV() {
    const head = ['Action', ...cols.map((c) => c.label)];
    const body = rows.map((r) => ['', ...cols.map((c) => {
      const v = r[c.key];
      return c.num ? String(v ?? 0) : String(v ?? '');
    })]);
    const csv = [head, ...body].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `sales-${todayLocal()}.csv`; a.click();
    URL.revokeObjectURL(url);
    show(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`);
  }

  async function exportXLSX() {
    try {
      const XLSX: any = await import('xlsx');
      const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c.label, r[c.key]])));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Sales');
      XLSX.writeFile(wb, `sales-${todayLocal()}.xlsx`);
    } catch { show('Could not build the spreadsheet.'); }
  }

  async function finalize(row: any) {
    setBusyId(row.id);
    try {
      await API.sell.finalize(row.id, []);
      show(`${row.invoice_no} finalised · stock and ledger updated`);
      reload();
    } catch (e: any) { show(e.message || 'Could not finalise that document.'); }
    finally { setBusyId(null); }
  }

  async function doDelete(row: any) {
    try {
      const res: any = await API.sell.remove(row.id);
      show(res.deleted
        ? `${row.invoice_no} deleted`
        : `${row.invoice_no} reversed and cancelled · stock and ledger restored`);
      reload();
    } catch (e: any) { show(e.message || 'Could not delete that sale.'); }
    finally { setDeleting(null); }
  }

  // Print straight from the row: fetch the full sale + the business header once,
  // then hand a self-contained page to the browser's print dialog.
  const bizRef = React.useRef<any>(undefined);
  async function printDoc(row: any, kind: 'invoice' | 'packing' | 'delivery') {
    try {
      if (bizRef.current === undefined) bizRef.current = await API.business.get().catch(() => null);
      const s = await API.sell.get(row.id);
      ({ invoice: printInvoice, packing: printPackingSlip, delivery: printDeliveryNote })[kind](s, bizRef.current);
    } catch (e: any) { show(e.message || 'Could not load that sale.'); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, whiteSpace: 'nowrap' };
  const mono = { fontFamily: T.fMono } as React.CSSProperties;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title={preset ? preset.title : 'Sales'} subtitle={rangeLabel}
        right={<Btn T={T} kind="accent" onClick={onAdd}>+ Add</Btn>} />

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 1500, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          <Panel T={T} pad={false}>
            <button onClick={() => setShowFilters((v) => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.fBody }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>▼ Filters {activeCount > 0 && <span style={{ color: T.accent.text }}>({activeCount})</span>}</span>
              <span style={{ fontSize: 11, color: T.inkSub }}>{showFilters ? '▴' : '▾'}</span>
            </button>
            {showFilters && (
              <div style={{ padding: '0 18px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
                <Field T={T} label="Business Location">
                  <SelectField T={T} value={filters.location_id} options={['', ...locations.map((l: any) => String(l.id))]} onChange={(v: any) => setF('location_id', v)}
                    render={(v: any) => (v ? (locations.find((l: any) => String(l.id) === v) || {}).name : 'All')} />
                </Field>
                <Field T={T} label="Customer">
                  <SelectField T={T} value={filters.customer_id} options={['', ...customers.map((c: any) => String(c.id))]} onChange={(v: any) => setF('customer_id', v)}
                    render={(v: any) => (v ? (customers.find((c: any) => String(c.id) === v) || {}).name : 'All')} />
                </Field>
                <Field T={T} label="Payment Status">
                  <SelectField T={T} value={filters.payment_status} options={PAYMENT_STATUSES.map(([k]) => k)} onChange={(v: any) => setF('payment_status', v)}
                    render={(v: any) => PAYMENT_STATUSES.find(([k]) => k === v)?.[1]} />
                </Field>
                <Field T={T} label="From"><TextField T={T} type="date" value={filters.from} onChange={(v: any) => setF('from', v)} /></Field>
                <Field T={T} label="To"><TextField T={T} type="date" value={filters.to} onChange={(v: any) => setF('to', v)} /></Field>
                <Field T={T} label="User">
                  <SelectField T={T} value={filters.cashier_id} options={['', ...users.map((u: any) => String(u.id))]} onChange={(v: any) => setF('cashier_id', v)}
                    render={(v: any) => (v ? (users.find((u: any) => String(u.id) === v) || {}).name : 'All')} />
                </Field>
                <Field T={T} label="Shipping Status">
                  <SelectField T={T} value={filters.shipping_status} options={SHIPPING_STATUSES.map(([k]) => k)} onChange={(v: any) => setF('shipping_status', v)}
                    render={(v: any) => SHIPPING_STATUSES.find(([k]) => k === v)?.[1]} />
                </Field>
                {/* The Document filter disappears when the page itself IS one document kind. */}
                {!preset?.status && (
                  <Field T={T} label="Document">
                    <SelectField T={T} value={filters.status} options={SALE_STATUSES.map(([k]) => k)} onChange={(v: any) => setF('status', v)}
                      render={(v: any) => SALE_STATUSES.find(([k]) => k === v)?.[1]} />
                  </Field>
                )}
                <Field T={T} label="Payment Method">
                  <SelectField T={T} value={filters.payment_method} options={['', ...Object.keys((totals && totals.by_payment_method) || {})]} onChange={(v: any) => setF('payment_method', v)}
                    render={(v: any) => (v ? title(v) : 'All')} />
                </Field>
                <div><Btn T={T} kind="ghost" onClick={clear} disabled={!activeCount}>Clear</Btn></div>
              </div>
            )}
          </Panel>

          <Panel T={T} pad={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px', borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, marginRight: 'auto' }}>{preset ? `List ${preset.title}` : 'All sales'}</span>
              <span style={{ fontSize: 12, color: T.inkSub }}>Show</span>
              <SelectField T={T} value={perPage} options={['25', '50', '100', '250']} onChange={setPerPage} style={{ width: 80, padding: '6px 8px', fontSize: 12 }} />
              <span style={{ fontSize: 12, color: T.inkSub, marginRight: 8 }}>entries</span>
              <Btn T={T} kind="ghost" onClick={exportCSV} disabled={!rows.length}>Export CSV</Btn>
              <Btn T={T} kind="ghost" onClick={exportXLSX} disabled={!rows.length}>Export Excel</Btn>
              <Btn T={T} kind="ghost" onClick={() => window.print()} disabled={!rows.length}>Print</Btn>
              <div style={{ position: 'relative' }}>
                <Btn T={T} kind="ghost" onClick={() => setShowCols((v) => !v)}>Column visibility</Btn>
                {showCols && (
                  <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 40, background: T.paper, border: `1px solid ${T.line}`, borderRadius: T.r, boxShadow: T.shModal, padding: 10, minWidth: 200, maxHeight: 300, overflowY: 'auto' }}>
                    {COLUMNS.map((c) => (
                      <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', fontSize: 12.5, color: T.inkMid, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!hidden[c.key]} onChange={() => setHidden((h) => ({ ...h, [c.key]: !h[c.key] }))} style={{ accentColor: T.accent.base }} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ width: 190 }}><TextField T={T} value={filters.search} onChange={(v: any) => setF('search', v)} placeholder="Search …" /></div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                <thead><tr>
                  <th style={th}>Action</th>
                  {cols.map((c) => <th key={c.key} style={{ ...th, textAlign: c.num ? 'right' : 'left' }}>{c.label}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const nonPosting = ['draft', 'quotation', 'proforma'].includes(r.status);
    // Editable/deletable: any non-posting draft, or a posted sale with no
                    // sell returns. An invoice edits in the form; a POS sale edits in the
                    // TILL (its original is voided when the replacement completes). The
                    // server still refuses the cases it cannot faithfully reverse —
                    // fiscalised, closed register session, recipe or sell-by-unit lines.
                    const mutable = nonPosting ||
                      (r.status === 'completed' && ['invoice', 'pos'].includes(r._real?.type) && !(r.sell_return > 0));
                    return (
                      <tr key={r.id} onClick={() => setViewing(r)} style={{ cursor: 'pointer' }}
                        onMouseEnter={(e: any) => (e.currentTarget.style.background = T.paperAlt)}
                        onMouseLeave={(e: any) => (e.currentTarget.style.background = 'transparent')}>
                        <td style={td} onClick={(e: any) => e.stopPropagation()}>
                          <ActionsMenu T={T} open={openMenu === r.id} onToggle={() => setOpenMenu((m) => (m === r.id ? null : r.id))}
                            items={[
                              { label: 'View', icon: <LuEye size={15} />, on: () => setViewing(r) },
                              ...(mutable && onEdit ? [{ label: 'Edit', icon: <LuPencil size={15} />, on: () => onEdit(r) }] : []),
                              ...(mutable ? [{ label: 'Delete', icon: <LuTrash2 size={15} />, on: () => setDeleting(r), danger: true }] : []),
                              ...(nonPosting
                                ? [{ label: busyId === r.id ? 'Finalising…' : 'Finalise this document', icon: <LuBadgeCheck size={15} />, on: () => finalize(r) }]
                                : [{ label: 'Sell return', icon: <LuUndo2 size={15} />, on: () => setReturning(r), danger: r.status === 'refunded' }]),
                              { label: 'Edit Shipping', icon: <LuTruck size={15} />, on: () => setShipping(r) },
                              { sep: true },
                              { label: 'Print Invoice', icon: <LuPrinter size={15} />, on: () => printDoc(r, 'invoice') },
                              { label: 'Packing Slip', icon: <LuClipboardList size={15} />, on: () => printDoc(r, 'packing') },
                              { label: 'Delivery Note', icon: <LuFileText size={15} />, on: () => printDoc(r, 'delivery') },
                              { sep: true },
                              { label: 'View Payments', icon: <LuWallet size={15} />, on: () => setPayments(r) },
                              { label: 'Invoice URL', icon: <LuLink size={15} />, on: () => setInvoiceUrl(r) },
                              { label: 'New Sale Notification', icon: <LuMail size={15} />, on: () => setNotify({ row: r, template: 'sale' }) },
                            ]} />
                        </td>
                        {cols.map((c) => {
                          if (c.key === 'payment_status') {
                            return <td key={c.key} style={td}>{r.payment_status
                              ? <Badge T={T} tone={STATUS_TONE[r.payment_status] || 'gray'}>{title(r.payment_status)}</Badge>
                              : <span style={{ color: T.inkMute }}>—</span>}</td>;
                          }
                          if (c.key === 'invoice_no') {
                            return (
                              <td key={c.key} style={{ ...td, ...mono, fontWeight: 600, color: T.accent.text }}>
                                {r.invoice_no}
                                {nonPosting && <Badge T={T} tone={DOC_TONE[r.status] || 'gray'} style={{ marginLeft: 6 }}>{title(r.status)}</Badge>}
                              </td>
                            );
                          }
                          if (c.key === 'date') return <td key={c.key} style={{ ...td, ...mono, color: T.inkMid }}>{formatDate(r.date)}</td>;
                          if (c.key === 'payment_method') return <td key={c.key} style={{ ...td, color: T.inkSub }}>{title(r.payment_method) || '—'}</td>;
                          if (c.key === 'shipping_status') return <td key={c.key} style={{ ...td, color: T.inkSub }}>{title(r.shipping_status) || '—'}</td>;
                          if (c.key === 'due') return <td key={c.key} style={{ ...td, ...mono, textAlign: 'right', color: r.due > 0 ? T.redText : T.inkSub, fontWeight: r.due > 0 ? 600 : 400 }}>{money(r.due)}</td>;
                          if (c.num) return <td key={c.key} style={{ ...td, ...mono, textAlign: 'right', color: c.key === 'total' ? T.ink : T.inkSub, fontWeight: c.key === 'total' ? 600 : 400 }}>{c.key === 'total_items' ? r.total_items : money(r[c.key])}</td>;
                          return <td key={c.key} style={{ ...td, color: c.key === 'customer_name' ? T.ink : T.inkSub, fontWeight: c.key === 'customer_name' ? 600 : 400, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r[c.key] || '—'}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {!!rows.length && totals && (
                  <tfoot><tr>
                    <td style={{ ...td, background: T.paperAlt, fontWeight: 700, color: T.ink }}>Total:</td>
                    {cols.map((c) => {
                      const f: React.CSSProperties = { ...td, background: T.paperAlt, fontWeight: 700, color: T.ink, textAlign: c.num ? 'right' : 'left', ...mono };
                      if (c.key === 'payment_status') return <td key={c.key} style={{ ...f, fontFamily: T.fBody, fontSize: 11.5 }}>{Object.entries(totals.by_payment_status || {}).filter(([, n]: any) => n > 0).map(([k, n]) => `${title(k)} - ${n}`).join(', ') || '—'}</td>;
                      if (c.key === 'payment_method') return <td key={c.key} style={{ ...f, fontFamily: T.fBody, fontSize: 11.5 }}>{Object.entries(totals.by_payment_method || {}).map(([k, n]) => `${title(k)} - ${n}`).join(', ') || '—'}</td>;
                      if (c.key === 'total') return <td key={c.key} style={f}>{money(totals.total_amount)}</td>;
                      if (c.key === 'paid') return <td key={c.key} style={f}>{money(totals.total_paid)}</td>;
                      if (c.key === 'due') return <td key={c.key} style={{ ...f, color: totals.total_due > 0 ? T.redText : T.ink }}>{money(totals.total_due)}</td>;
                      if (c.key === 'sell_return') return <td key={c.key} style={f}>{money(totals.sell_return)}</td>;
                      return <td key={c.key} style={{ ...f, background: T.paperAlt }} />;
                    })}
                  </tr></tfoot>
                )}
              </table>
            </div>

            {loading && <div style={{ padding: 44, textAlign: 'center', ...mono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>}
            {!loading && !rows.length && (
              <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>
                {activeCount ? 'No sales match these filters.' : 'No sales yet.'}
              </div>
            )}
            {!loading && !!rows.length && (
              <div style={{ padding: '10px 16px', fontSize: 11.5, color: T.inkMute, borderTop: `1px solid ${T.line}` }}>
                Showing {rows.length} of {totals ? totals.count : rows.length}. The Total row sums every sale that matches the filters, not just this page.
                {' '}Sell Return is what customers sent back; refunds are settled when recorded, so nothing is outstanding.
              </div>
            )}
          </Panel>
        </div>
      </div>
      {viewing && (
        <SellDetailsModal T={T} sale={viewing} onClose={() => setViewing(null)}
          onSellReturn={(row: any) => { setViewing(null); setReturning(row); }} />
      )}
      {deleting && (
        <ConfirmModal T={T} title={`Delete ${deleting.invoice_no}?`}
          confirmLabel={['draft', 'quotation', 'proforma'].includes(deleting.status) ? 'Delete' : 'Reverse & cancel'}
          body={['draft', 'quotation', 'proforma'].includes(deleting.status)
            ? 'This document never posted anything, so it will be removed outright.'
            : 'This sale is on the books. Deleting it reverses everything it did — goods go back on the shelf, the journal is mirrored out, the customer’s balance is released and its payments are marked refunded — and the record stays as Cancelled so the books remain auditable. Hand any money back to the customer yourself.'}
          onConfirm={() => doDelete(deleting)} onClose={() => setDeleting(null)} />
      )}
      {returning && (
        <SellReturnModal T={T} sale={returning} onClose={() => setReturning(null)}
          onDone={(msg: string) => { setReturning(null); show(msg); reload(); }} />
      )}
      {shipping && (
        <EditShippingModal T={T} sale={shipping} onClose={() => setShipping(null)}
          onSaved={(msg: string) => { setShipping(null); show(msg); reload(); }} />
      )}
      {payments && (
        <ViewPaymentsModal T={T} sale={payments} onClose={() => setPayments(null)}
          onNotify={() => { const row = payments; setPayments(null); setNotify({ row, template: 'payment' }); }} />
      )}
      {invoiceUrl && <InvoiceUrlModal T={T} sale={invoiceUrl} onClose={() => setInvoiceUrl(null)} />}
      {notify && (
        <SendNotificationModal T={T} sale={notify.row} template={notify.template} onClose={() => setNotify(null)}
          onSent={(msg: string) => { setNotify(null); show(msg); }} />
      )}
      {toastNode}
    </div>
  );
}
