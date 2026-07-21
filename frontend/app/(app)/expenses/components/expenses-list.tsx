'use client';
// ─────────────────────────────────────────────────────────────────
// Expenses — the reference list: Date, Reference No, Title, Payment
// To, Recurring details, Category, Sub category, Location, Payment
// Status, Tax, Total amount, Payment due, Expense for, Contact,
// Note, Added By + filters, footer totals, Import and Add.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { ActionsMenu } from '../../products/components/list-table';
import { ConfirmModal } from '../../purchase-orders/components/bits';
import { LuEye, LuPencil, LuTrash2, LuWallet, LuListFilter, LuRefreshCw } from 'react-icons/lu';

const { useState: useStateEx, useEffect: useEffectEx } = React;

const STATUS_TONE: any = { paid: 'green', partial: 'amber', due: 'red' };
const METHOD_LABEL: any = { cash: 'Cash', zaad: 'Zaad', evc: 'EVC Plus', card: 'Card', bank: 'Bank Transfer', cheque: 'Cheque', other: 'Other' };

export function ExpensesList({ T, flash, onAdd, onEdit, onImport, onCategories }:
  { T: Theme; flash?: React.MutableRefObject<string>; onAdd: () => void; onEdit: (e: any) => void; onImport: () => void; onCategories: () => void }) {
  const [rows, setRows] = useStateEx<any[]>([]);
  const [totals, setTotals] = useStateEx<any>({ total_amount: 0, total_due: 0 });
  const [loading, setLoading] = useStateEx(true);
  const [locs, setLocs] = useStateEx<any[]>([]);
  const [cats, setCats] = useStateEx<any[]>([]);
  const [filters, setFilters] = useStateEx<any>({ location_id: '', category_id: '', payment_status: '', from: '', to: '', search: '' });
  const [showFilters, setShowFilters] = useStateEx(false);
  const [view, setView] = useStateEx<any>(null);
  const [paying, setPaying] = useStateEx<any>(null);
  const [confirmDel, setConfirmDel] = useStateEx<any>(null);
  const [menu, setMenu] = useStateEx<any>(null);
  const [nonce, setNonce] = useStateEx(0);
  const [show, node] = useToast();

  useEffectEx(() => {
    let dead = false;
    setLoading(true);
    const timer = setTimeout(() => {
      API.expense.list(filters)
        .then((r: any) => { if (dead) return; setRows(r.items); setTotals(r.totals); })
        .catch(() => { if (dead) return; setRows([]); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 250);
    return () => { dead = true; clearTimeout(timer); };
  }, [filters, nonce]);
  useEffectEx(() => { API.location.list().then(setLocs).catch(() => {}); API.expense.categories().then(setCats).catch(() => {}); }, []);
  useEffectEx(() => { if (flash?.current) { show(flash.current); flash.current = ''; } }, [flash, show]);

  const setF = (k: string, v: any) => setFilters((p: any) => ({ ...p, [k]: v }));
  const reload = () => setNonce((n: number) => n + 1);

  async function doDelete(e: any) {
    try { await API.expense.remove(e.id); setConfirmDel(null); show('Expense deleted — ledger reversed'); reload(); }
    catch (x: any) { setConfirmDel(null); show(x.message); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '11px 14px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '11px 14px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink, whiteSpace: 'nowrap' };

  const actionsFor = (e: any) => [
    { label: 'View', icon: <LuEye size={14} />, on: () => setView(e) },
    { label: 'Edit', icon: <LuPencil size={14} />, on: () => onEdit(e) },
    ...(e.amount_due > 0.001 ? [{ label: 'Add payment', icon: <LuWallet size={14} />, on: () => setPaying(e) }] : []),
    { sep: true },
    { label: 'Delete', icon: <LuTrash2 size={14} />, danger: true, on: () => setConfirmDel(e) },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Expenses" subtitle={`${rows.length} expenses`}
        right={<>
          <Btn T={T} kind="ghost" onClick={onCategories}>Categories</Btn>
          <Btn T={T} kind="ghost" onClick={onImport}>+ Import expense</Btn>
          <Btn T={T} kind="accent" onClick={onAdd}>+ Add</Btn>
        </>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <Panel T={T} pad={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, marginRight: 'auto' }}>All expenses</span>
              <button onClick={() => setShowFilters(!showFilters)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 7, border: `1px solid ${T.line}`, background: showFilters ? T.accent.soft : T.paper, color: showFilters ? T.accent.text : T.inkMid, fontFamily: T.fBody, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                <LuListFilter size={14} /> Filters
              </button>
              <div style={{ width: 190 }}><TextField T={T} value={filters.search} onChange={(v: any) => setF('search', v)} placeholder="Search …" /></div>
            </div>
            {showFilters && (
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.line}`, background: T.paperAlt }}>
                <FormGrid cols={5}>
                  <Field T={T} label="Location">
                    <SelectField T={T} value={filters.location_id} options={['', ...locs.map((l: any) => String(l.id))]} onChange={(v: any) => setF('location_id', v)}
                      render={(o: any) => o === '' ? 'All' : (locs.find((l: any) => String(l.id) === o) || {}).name || o} />
                  </Field>
                  <Field T={T} label="Category">
                    <SelectField T={T} value={filters.category_id} options={['', ...cats.filter((c: any) => !c.parent_id).map((c: any) => String(c.id))]} onChange={(v: any) => setF('category_id', v)}
                      render={(o: any) => o === '' ? 'All' : (cats.find((c: any) => String(c.id) === o) || {}).name || o} />
                  </Field>
                  <Field T={T} label="Payment status">
                    <SelectField T={T} value={filters.payment_status} options={['', 'paid', 'partial', 'due']} onChange={(v: any) => setF('payment_status', v)}
                      render={(o: any) => o === '' ? 'All' : o[0].toUpperCase() + o.slice(1)} />
                  </Field>
                  <Field T={T} label="From"><TextField T={T} type="date" value={filters.from} onChange={(v: any) => setF('from', v)} /></Field>
                  <Field T={T} label="To"><TextField T={T} type="date" value={filters.to} onChange={(v: any) => setF('to', v)} /></Field>
                </FormGrid>
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1280 }}>
                <thead><tr>
                  <th style={th}>Date</th><th style={th}>Reference No</th><th style={th}>Expense Title</th><th style={th}>Payment To</th>
                  <th style={th}>Recurring details</th><th style={th}>Category</th><th style={th}>Sub category</th><th style={th}>Location</th>
                  <th style={th}>Payment Status</th><th style={th}>Tax</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total amount</th><th style={{ ...th, textAlign: 'right' }}>Payment due</th>
                  <th style={th}>Expense for</th><th style={th}>Contact</th><th style={th}>Note</th><th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr></thead>
                <tbody>
                  {rows.map((e: any) => (
                    <tr key={e.id} onMouseEnter={(ev) => ((ev.currentTarget as HTMLTableRowElement).style.background = T.paperAlt)} onMouseLeave={(ev) => ((ev.currentTarget as HTMLTableRowElement).style.background = 'transparent')}>
                      <td style={{ ...td, color: T.inkSub }}>{e.date}</td>
                      <td onClick={() => setView(e)} style={{ ...td, fontFamily: T.fMono, fontWeight: 600, color: T.accent.text, cursor: 'pointer' }}>{e.ref}{e.is_refund && <Badge T={T} tone="red" style={{ marginLeft: 6 }}>Refund</Badge>}</td>
                      <td style={td}>{e.title || '—'}</td>
                      <td style={td}>{e.payment_to || '—'}</td>
                      <td style={{ ...td, color: T.inkSub }}>{e.is_recurring ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><LuRefreshCw size={12} />{e.recurring_details}</span> : (e.recurring_details || '—')}</td>
                      <td style={td}>{e.category_name}</td>
                      <td style={td}>{e.sub_category_name || '—'}</td>
                      <td style={td}>{e.location_name}</td>
                      <td style={td}><Badge T={T} tone={STATUS_TONE[e.payment_status] || 'gray'}>{e.payment_status[0].toUpperCase() + e.payment_status.slice(1)}</Badge></td>
                      <td style={{ ...td, color: T.inkSub }}>{e.tax_name || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 600 }}>{money(e.amount)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, color: e.amount_due > 0 ? T.redText : T.inkSub }}>{money(e.amount_due)}</td>
                      <td style={td}>{e.expense_for || '—'}</td>
                      <td style={td}>{e.contact_name || '—'}</td>
                      <td style={{ ...td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', color: T.inkSub }} title={e.note}>{e.note || '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <ActionsMenu T={T} open={menu === e.id} onToggle={() => setMenu(menu === e.id ? null : e.id)} items={actionsFor(e)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot><tr>
                    <td colSpan={10} style={{ ...td, fontWeight: 700, textAlign: 'right', background: T.paperAlt }}>Total:</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 700, background: T.paperAlt }}>{money(totals.total_amount)}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 700, background: T.paperAlt, color: totals.total_due > 0 ? T.redText : T.ink }}>{money(totals.total_due)}</td>
                    <td colSpan={4} style={{ ...td, background: T.paperAlt }}></td>
                  </tr></tfoot>
                )}
              </table>
            </div>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading expenses…</div>}
            {!loading && rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No expenses match.</div>}
          </Panel>
        </div>
      </div>

      {view && <ExpenseView T={T} expense={view} onClose={() => setView(null)} />}
      {paying && <AddPaymentModal T={T} expense={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); show('Payment recorded'); reload(); }} />}
      {confirmDel && (
        <ConfirmModal T={T} title={`Delete ${confirmDel.ref}?`}
          body="Deleting this expense reverses its ledger entries — including any payments taken against it. This cannot be undone."
          confirmLabel="Delete" confirmKind="danger"
          onConfirm={() => doDelete(confirmDel)} onClose={() => setConfirmDel(null)} />
      )}
      {node}
    </div>
  );
}

function ExpenseView({ T, expense, onClose }: { T: Theme; expense: any; onClose: () => void }) {
  const e = expense;
  const row = (l: string, v: any) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}>
      <span style={{ color: T.inkSub }}>{l}</span><span style={{ color: T.ink, fontWeight: 600, textAlign: 'right' }}>{v || '—'}</span>
    </div>
  );
  return (
    <Modal T={T} title={e.ref} subtitle={`${e.location_name} · ${e.date}`} width={520} onClose={onClose} footer={null}>
      <div style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
        <Badge T={T} tone={STATUS_TONE[e.payment_status] || 'gray'}>{e.payment_status[0].toUpperCase() + e.payment_status.slice(1)}</Badge>
        {e.is_refund && <Badge T={T} tone="red">Refund</Badge>}
        {e.is_recurring && <Badge T={T} tone="blue">{e.recurring_details}</Badge>}
      </div>
      {row('Expense Title', e.title)}
      {row('Payment To', e.payment_to)}
      {row('Category', e.sub_category_name ? `${e.category_name} → ${e.sub_category_name}` : e.category_name)}
      {row('Expense for', e.expense_for)}
      {row('Contact', e.contact_name)}
      {row('Tax', e.tax_name ? `${e.tax_name} (${money(e.tax_amount)})` : '')}
      {row('Total amount', money(e.amount))}
      {row('Paid', money(e.amount_paid))}
      {row('Payment due', money(e.amount_due))}
      {e.document_url && (
        <div style={{ marginTop: 12 }}>
          <a href={e.document_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: T.accent.text, fontWeight: 600 }}>View attached document ↗</a>
        </div>
      )}
      {e.note && <div style={{ marginTop: 12, padding: '9px 12px', background: T.paperAlt, borderRadius: 8, fontSize: 12.5, color: T.inkMid }}>{e.note}</div>}
      {e.payments?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Payments</div>
          {e.payments.map((p: any, i: number) => (
            <div key={p.id || i} style={{ display: 'flex', gap: 10, fontSize: 12.5, color: T.inkMid, padding: '5px 0' }}>
              <span style={{ fontFamily: T.fMono, fontWeight: 600, color: T.ink }}>{money(p.amount)}</span>
              <span>{METHOD_LABEL[p.method] || p.method}</span>
              <span style={{ color: T.inkSub }}>{p.paid_on}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AddPaymentModal({ T, expense, onClose, onSaved }: { T: Theme; expense: any; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useStateEx(String(expense.amount_due || ''));
  const [method, setMethod] = useStateEx('cash');
  const [note, setNote] = useStateEx('');
  const [busy, setBusy] = useStateEx(false);
  const [err, setErr] = useStateEx<string | null>(null);
  async function save() {
    const amt = Number(amount);
    if (!(amt > 0)) { setErr('Enter the payment amount.'); return; }
    if (amt - expense.amount_due > 0.001) { setErr(`Only ${money(expense.amount_due)} is still due.`); return; }
    setBusy(true); setErr(null);
    try { await API.expense.addPayment(expense.id, { amount: amt, method, note: note.trim() || undefined }); onSaved(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal T={T} title={`Pay ${expense.ref}`} subtitle={`${money(expense.amount_due)} due of ${money(expense.amount)}`} width={440} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Amount *"><TextField T={T} type="number" value={amount} onChange={setAmount} /></Field>
        <Field T={T} label="Payment Method *">
          <SelectField T={T} value={method} options={['cash', 'zaad', 'evc', 'card', 'bank', 'cheque', 'other']} onChange={setMethod}
            render={(v: any) => METHOD_LABEL[v] || v} />
        </Field>
        <Field T={T} label="Payment note" full><TextField T={T} value={note} onChange={setNote} /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
    </Modal>
  );
}
