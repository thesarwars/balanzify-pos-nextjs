'use client';
// ─────────────────────────────────────────────────────────────────
// Add / Edit Expense — the reference's full-page form: location,
// title, payee, category/sub-category, reference, date, expense-for
// (staff) and contact, attached document, applicable tax, total,
// note, refund flag, a recurring schedule, and an initial payment
// with the running "Payment due" readout.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Panel, Field, TextField, SelectField, FormGrid } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { LuInfo, LuPaperclip, LuX } from 'react-icons/lu';

// "2026-07-20T22:02" for datetime-local, in LOCAL time.
function localStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const METHODS = ['cash', 'zaad', 'evc', 'card', 'bank', 'cheque', 'other'];
const METHOD_LABEL: any = { cash: 'Cash', zaad: 'Zaad', evc: 'EVC Plus', card: 'Card', bank: 'Bank Transfer', cheque: 'Cheque', other: 'Other' };

export function ExpenseEditor({ T, expense, onCancel, onDone }:
  { T: Theme; expense?: any; onCancel: () => void; onDone: (msg: string) => void }) {
  const editing = !!expense;
  const [locs, setLocs] = React.useState<any[]>([]);
  const [cats, setCats] = React.useState<any[]>([]);
  const [users, setUsers] = React.useState<any[]>([]);
  const [contacts, setContacts] = React.useState<any[]>([]);
  const [taxes, setTaxes] = React.useState<any[]>([]);
  const [accounts, setAccounts] = React.useState<any[]>([]);

  const [locationId, setLocationId] = React.useState(expense?.location_id || '');
  const [title, setTitle] = React.useState(expense?.title || '');
  const [paymentTo, setPaymentTo] = React.useState(expense?.payment_to || '');
  const [categoryId, setCategoryId] = React.useState(expense?.category_id || '');
  const [subCategoryId, setSubCategoryId] = React.useState(expense?.sub_category_id || '');
  const [refNo, setRefNo] = React.useState(expense?.ref || '');
  const [date, setDate] = React.useState(expense?.expense_date ? localStamp(new Date(expense.expense_date)) : localStamp());
  const [forUserId, setForUserId] = React.useState(expense?.expense_for_user_id || '');
  const [contactId, setContactId] = React.useState(expense?.contact_id || '');
  const [taxRateId, setTaxRateId] = React.useState(expense?.tax_rate_id || '');
  const [amount, setAmount] = React.useState(expense ? String(expense.amount) : '');
  const [note, setNote] = React.useState(expense?.note || '');
  const [isRefund, setIsRefund] = React.useState(!!expense?.is_refund);
  const [doc, setDoc] = React.useState<any>(expense?.document_url ? { url: expense.document_url, key: expense.document_key, name: 'Attached document' } : null);
  const [uploading, setUploading] = React.useState(false);

  const [isRecurring, setIsRecurring] = React.useState(!!expense?.is_recurring);
  const [recurN, setRecurN] = React.useState(expense ? String(expense.recur_interval || 1) : '1');
  const [recurUnit, setRecurUnit] = React.useState(expense?.recur_interval_type || 'months');
  const [recurReps, setRecurReps] = React.useState(expense?.recur_repetitions ? String(expense.recur_repetitions) : '');

  const [payAmount, setPayAmount] = React.useState(editing ? '' : '0');
  const [payOn, setPayOn] = React.useState(localStamp());
  const [payMethod, setPayMethod] = React.useState('cash');
  const [payAccount, setPayAccount] = React.useState('');
  const [payNote, setPayNote] = React.useState('');

  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    API.location.list().then((l: any) => { setLocs(l); if (!editing) setLocationId((v: any) => v || String(l[0]?.id || '')); }).catch(() => {});
    API.expense.categories().then(setCats).catch(() => {});
    API.user.list().then(setUsers).catch(() => {});
    API.contact.list({ type: 'customer' }).then((c: any) => setContacts(Array.isArray(c) ? c : c.items || [])).catch(() => {});
    API.taxRate.list().then((t: any[]) => setTaxes(t.filter((x: any) => x.id !== 0))).catch(() => {});
    API.paymentAccount.list().then(setAccounts).catch(() => {});
  }, [editing]);

  const topCats = cats.filter((c: any) => !c.parent_id);
  const subCats = cats.filter((c: any) => c.parent_id && (!categoryId || c.parent_id === categoryId));
  const total = Number(amount) || 0;
  const alreadyPaid = editing ? Number(expense.amount_paid || 0) : 0;
  const initialPay = editing ? 0 : Math.min(Number(payAmount) || 0, Number.MAX_SAFE_INTEGER);
  const due = Math.max(0, total - alreadyPaid - initialPay);

  async function attach(file: any) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErr('The attachment must be 5MB or smaller.'); return; }
    setUploading(true); setErr(null);
    try { const r = await API.upload.file(file); setDoc({ url: r.url, key: r.key, name: file.name }); }
    catch (e: any) { setErr(e.message || 'Upload failed.'); }
    finally { setUploading(false); }
  }

  async function save() {
    if (!locationId) { setErr('Pick a business location.'); return; }
    if (!(total > 0)) { setErr('Enter the total amount.'); return; }
    if (!editing && initialPay - total > 0.001) { setErr('The payment cannot exceed the total amount.'); return; }
    if (isRecurring && !(Number(recurN) > 0)) { setErr('Enter the recurring interval.'); return; }
    setBusy(true); setErr(null);
    const body: any = {
      location_id: locationId,
      title: title.trim() || undefined,
      payment_to: paymentTo.trim() || undefined,
      category_id: categoryId || undefined,
      sub_category_id: subCategoryId || undefined,
      ref_no: refNo.trim() || undefined,
      date: date ? new Date(date).toISOString() : undefined,
      expense_for_user_id: forUserId || undefined,
      contact_id: contactId || undefined,
      tax_rate_id: taxRateId || undefined,
      amount: total,
      note: note.trim() || undefined,
      is_refund: isRefund,
      document_url: doc?.url || undefined,
      document_key: doc?.key || undefined,
      is_recurring: isRecurring,
      recur_interval: isRecurring ? Number(recurN) || 1 : undefined,
      recur_interval_type: isRecurring ? recurUnit : undefined,
      recur_repetitions: isRecurring && recurReps ? Number(recurReps) : undefined,
      // No initial payment = explicitly DUE; the schema's legacy default would
      // otherwise book the whole total as paid in cash.
      ...(!editing && !(initialPay > 0) ? { payment_status: 'due' } : {}),
      ...(!editing && initialPay > 0 ? { payment: {
        amount: initialPay, method: payMethod,
        payment_account_id: payAccount || undefined,
        paid_on: payOn ? new Date(payOn).toISOString() : undefined,
        note: payNote.trim() || undefined,
      } } : {}),
    };
    try {
      if (editing) { await API.expense.update(expense.id, body); onDone('Expense updated'); }
      else { const e = await API.expense.create(body); onDone(`Expense ${e.ref || ''} saved`.trim()); }
    } catch (ex: any) {
      setErr(ex.message || 'Could not save the expense.');
      setBusy(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title={editing ? `Edit Expense ${expense.ref || ''}` : 'Add Expense'} subtitle="Operating costs, posted straight to the books" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <Panel T={T}>
            <FormGrid cols={3}>
              <Field T={T} label="Business Location *">
                <SelectField T={T} value={String(locationId)} options={['', ...locs.map((l: any) => String(l.id))]}
                  onChange={setLocationId} render={(v: any) => v === '' ? 'Please Select' : (locs.find((l: any) => String(l.id) === v) || {}).name || v} />
              </Field>
              <Field T={T} label="Expense Title"><TextField T={T} value={title} onChange={setTitle} placeholder="Expense Title" /></Field>
              <Field T={T} label="Payment To"><TextField T={T} value={paymentTo} onChange={setPaymentTo} placeholder="Payment To" /></Field>
              <Field T={T} label="Expense Category">
                <SelectField T={T} value={String(categoryId)} options={['', ...topCats.map((c: any) => String(c.id))]}
                  onChange={(v: any) => { setCategoryId(v); setSubCategoryId(''); }}
                  render={(v: any) => v === '' ? 'Please Select' : (topCats.find((c: any) => String(c.id) === v) || {}).name || v} />
              </Field>
              <Field T={T} label="Sub category">
                <SelectField T={T} value={String(subCategoryId)} options={['', ...subCats.map((c: any) => String(c.id))]}
                  onChange={setSubCategoryId} render={(v: any) => v === '' ? 'Please Select' : (subCats.find((c: any) => String(c.id) === v) || {}).name || v} />
              </Field>
              <Field T={T} label="Reference No" hint={editing ? 'Leave blank to keep the current reference' : 'Leave empty to autogenerate'}>
                <TextField T={T} value={refNo} onChange={setRefNo} placeholder="EXP-…" />
              </Field>
              <Field T={T} label="Date *"><TextField T={T} type="datetime-local" value={date} onChange={setDate} /></Field>
              <Field T={T} label="Expense for" hint="A staff member this expense relates to">
                <SelectField T={T} value={String(forUserId)} options={['', ...users.map((u: any) => String(u.id))]}
                  onChange={setForUserId} render={(v: any) => v === '' ? 'None' : (users.find((u: any) => String(u.id) === v) || {}).name || v} />
              </Field>
              <Field T={T} label="Expense for contact">
                <SelectField T={T} value={String(contactId)} options={['', ...contacts.map((c: any) => String(c.id))]}
                  onChange={setContactId} render={(v: any) => v === '' ? 'Please Select' : (contacts.find((c: any) => String(c.id) === v) || {}).name || v} />
              </Field>
              <Field T={T} label="Attach Document" hint="Max 5MB — pdf, csv, zip, doc, docx, jpeg, jpg, png">
                {doc ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper, fontSize: 12.5, color: T.inkMid }}>
                    <LuPaperclip size={14} /><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                    <button onClick={() => setDoc(null)} style={{ border: 'none', background: 'none', color: T.redText, cursor: 'pointer', display: 'inline-flex' }}><LuX size={14} /></button>
                  </div>
                ) : (
                  <input type="file" accept=".pdf,.csv,.zip,.doc,.docx,.jpeg,.jpg,.png" disabled={uploading}
                    onChange={(e) => attach(e.target.files && e.target.files[0])} style={{ fontSize: 12.5, color: T.inkMid, paddingTop: 8 }} />
                )}
              </Field>
              <Field T={T} label="Applicable Tax">
                <SelectField T={T} value={String(taxRateId)} options={['', ...taxes.map((t: any) => String(t.id))]}
                  onChange={setTaxRateId} render={(v: any) => v === '' ? 'None' : (taxes.find((t: any) => String(t.id) === v) || {}).name || v} />
              </Field>
              <Field T={T} label="Total amount *">
                <TextField T={T} type="number" value={amount} onChange={setAmount} placeholder="Total amount" />
              </Field>
              <Field T={T} label="Expense note" full>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                  style={{ width: '100%', padding: '10px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              </Field>
            </FormGrid>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, fontWeight: 600, color: T.inkMid, cursor: 'pointer' }}>
              <input type="checkbox" checked={isRefund} onChange={(e) => setIsRefund(e.target.checked)} />
              Is refund? <span style={{ fontWeight: 400, fontSize: 12, color: T.inkSub }}>— money coming back rather than going out</span>
            </label>
          </Panel>

          <Panel T={T}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: T.ink, cursor: 'pointer' }}>
              <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
              Is Recurring?
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, fontSize: 12, color: T.inkSub }}>
              <LuInfo size={14} style={{ flexShrink: 0 }} />
              A copy of this expense is generated automatically every interval, unpaid, until the repetitions run out.
            </div>
            {isRecurring && (
              <FormGrid cols={3} style={{ marginTop: 14 }}>
                <Field T={T} label="Recurring interval *">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ width: 90 }}><TextField T={T} type="number" value={recurN} onChange={setRecurN} /></div>
                    <div style={{ flex: 1 }}>
                      <SelectField T={T} value={recurUnit} options={['days', 'weeks', 'months', 'years']}
                        onChange={setRecurUnit} render={(v: any) => v[0].toUpperCase() + v.slice(1)} />
                    </div>
                  </div>
                </Field>
                <Field T={T} label="No. of Repetitions" hint="If blank, the expense repeats indefinitely">
                  <TextField T={T} type="number" value={recurReps} onChange={setRecurReps} />
                </Field>
              </FormGrid>
            )}
          </Panel>

          {!editing && (
            <Panel T={T} title="Add payment">
              <FormGrid cols={3}>
                <Field T={T} label="Amount *"><TextField T={T} type="number" value={payAmount} onChange={setPayAmount} placeholder="0.00" /></Field>
                <Field T={T} label="Paid on *"><TextField T={T} type="datetime-local" value={payOn} onChange={setPayOn} /></Field>
                <Field T={T} label="Payment Method *">
                  <SelectField T={T} value={payMethod} options={METHODS} onChange={setPayMethod} render={(v: any) => METHOD_LABEL[v] || v} />
                </Field>
                <Field T={T} label="Payment Account">
                  <SelectField T={T} value={String(payAccount)} options={['', ...accounts.map((a: any) => String(a.id))]}
                    onChange={setPayAccount} render={(v: any) => v === '' ? 'None' : (accounts.find((a: any) => String(a.id) === v) || {}).name || v} />
                </Field>
                <Field T={T} label="Payment note" full>
                  <textarea value={payNote} onChange={(e) => setPayNote(e.target.value)} rows={2}
                    style={{ width: '100%', padding: '10px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
                </Field>
              </FormGrid>
              <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 14, paddingTop: 12, textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: due > 0 ? T.redText : T.ink }}>
                Payment due: <span style={{ fontFamily: T.fMono }}>{money(due)}</span>
              </div>
            </Panel>
          )}
          {editing && (
            <Panel T={T} title="Payments">
              {expense.payments?.length ? expense.payments.map((p: any, i: number) => (
                <div key={p.id || i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkMid }}>
                  <span style={{ fontFamily: T.fMono, fontWeight: 600, color: T.ink }}>{money(p.amount)}</span>
                  <span>{METHOD_LABEL[p.method] || p.method}</span>
                  <span style={{ color: T.inkSub }}>{p.paid_on}</span>
                  {p.note && <span style={{ color: T.inkSub }}>· {p.note}</span>}
                </div>
              )) : <div style={{ fontSize: 12.5, color: T.inkMute }}>No payments yet.</div>}
              <div style={{ marginTop: 10, textAlign: 'right', fontSize: 13, fontWeight: 700, color: Number(expense.amount_due) > 0 ? T.redText : T.ink }}>
                Payment due: <span style={{ fontFamily: T.fMono }}>{money(Math.max(0, total - alreadyPaid))}</span>
              </div>
              <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 6 }}>Payments already taken stay attached — the total cannot go below {money(alreadyPaid)}.</div>
            </Panel>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Btn T={T} kind="ghost" onClick={onCancel}>Cancel</Btn>
            <Btn T={T} kind="accent" onClick={save} disabled={busy || uploading}>{busy ? 'Saving…' : 'Save'}</Btn>
          </div>
          {err && <div style={{ padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}
