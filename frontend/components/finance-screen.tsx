'use client';
// ─────────────────────────────────────────────────────────────────
// Finance — Expenses + Payment Accounts (the manual's accounting side,
// for Somaliland / Somalia / Kenya / Ethiopia businesses). Expenses
// draw down a payment account; accounts support deposit & fund
// transfer. Wired through API.expense + API.paymentAccount.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { BUSINESS } from '@/lib/data';

const { useState: useStateFn, useEffect: useEffectFn } = React;

// File-local stat strip helper (from the prototype's DataScreen.jsx).
function StatStrip({ T, stats }: { T: Theme; stats: any[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 150px), 1fr))`, gap: 14, marginBottom: 18 }}>
      {stats.map(([label, value]: any, i: number) => (
        <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '15px 18px', boxShadow: T.sh1 }}>
          <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>{label}</div>
          <div style={{ fontFamily: T.fMono, fontWeight: 500, fontSize: 24, color: T.ink, marginTop: 7, letterSpacing: '-0.8px' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

export function Finance({ T, tab: initial }: { T: Theme; tab?: string }) {
  const [tab, setTab] = useStateFn<any>(initial || 'expenses');
  const [expenses, setExpenses] = useStateFn<any[]>([]);
  const [cats, setCats] = useStateFn<any[]>([]);
  const [accounts, setAccounts] = useStateFn<any[]>([]);
  const [types, setTypes] = useStateFn<any[]>([]);
  const [locs, setLocs] = useStateFn<any[]>([]);
  const [modal, setModal] = useStateFn<any>(null);   // 'expense' | 'account' | 'transfer'
  const [show, node] = useToast();

  const reloadExp = React.useCallback(() => API.expense.list().then(setExpenses).catch(() => {}), []);
  const reloadAcc = React.useCallback(() => API.paymentAccount.list().then(setAccounts).catch(() => {}), []);
  useEffectFn(() => { reloadExp(); reloadAcc(); }, [reloadExp, reloadAcc]);
  useEffectFn(() => {
    API.expense.categories().then(setCats).catch(() => {});
    API.paymentAccount.types().then(setTypes).catch(() => {});
    API.location.list().then(setLocs).catch(() => {});
  }, []);

  const totalExp = expenses.reduce((s: number, e: any) => s + (e.is_refund ? -e.amount : e.amount), 0);
  const totalBal = accounts.reduce((s: number, a: any) => s + a.balance, 0);
  const stone: any = { paid: 'green', due: 'red' };

  async function delExp(e: any) { try { await API.expense.remove(e.id); show('Expense deleted'); reloadExp(); reloadAcc(); } catch (x: any) { show(x.message); } }
  async function delAcc(a: any) { try { await API.paymentAccount.remove(a.id); show('Account removed'); reloadAcc(); } catch (x: any) { show(x.message); } }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Finance" subtitle="Expenses & payment accounts"
        right={tab === 'expenses'
          ? <Btn T={T} kind="accent" onClick={() => setModal('expense')}>+ Add Expense</Btn>
          : <><Btn T={T} kind="ghost" onClick={() => setModal('transfer')}>⇄ Transfer</Btn><Btn T={T} kind="accent" onClick={() => setModal('account')}>+ Add Account</Btn></>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
            {([['expenses', 'Expenses', expenses.length], ['accounts', 'Payment Accounts', accounts.length]] as any[]).map(([id, lbl, n]: any) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl} <span style={{ opacity: 0.7 }}>· {n}</span></button>
            ))}
          </div>

          {tab === 'expenses' ? <>
            <StatStrip T={T} stats={[['Expenses', expenses.length], ['Total spent', money0(totalExp)], ['Unpaid', money0(expenses.filter((e: any) => e.payment_status === 'due').reduce((s: number, e: any) => s + e.amount, 0))]]} />
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{([['Reference', 'l'], ['Category', 'l'], ['Location', 'l'], ['Account', 'l'], ['For', 'l'], ['Amount', 'r'], ['Date', 'l'], ['Status', 'l'], ['', 'r']] as any[]).map(([h, a]: any, i: number) => (
                  <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {expenses.map((e: any) => (
                    <tr key={e.id} style={{ transition: 'background .12s' }} onMouseEnter={(ev: any) => ev.currentTarget.style.background = T.paperAlt} onMouseLeave={(ev: any) => ev.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.accent.text }}>{e.ref}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone="gray">{e.category_name}</Badge>{e.is_refund && <Badge T={T} tone="green" style={{ marginLeft: 6 }}>Refund</Badge>}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{e.location_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{e.account_name}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: e.expense_for ? T.ink : T.inkMute }}>{e.expense_for || '—'}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: e.is_refund ? T.greenText : T.ink } as React.CSSProperties}>{e.is_refund ? '+' : ''}{money(e.amount)}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub }}>{e.date}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={stone[e.payment_status]}>{e.payment_status}</Badge></td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}><button onClick={() => delExp(e)} style={finMini(T, true)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {expenses.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No expenses recorded.</div>}
            </Panel>
          </> : <>
            <StatStrip T={T} stats={[['Accounts', accounts.length], ['Total balance', money0(totalBal)], ['Currency', BUSINESS.currency === '$' ? 'USD' : BUSINESS.currency]]} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {accounts.map((a: any) => (
                <div key={a.id} style={{ background: a.type === 'Bank' ? `linear-gradient(135deg, ${T.navy}, ${T.navyLight})` : T.card, color: a.type === 'Bank' ? '#fff' : T.ink, border: a.type === 'Bank' ? 'none' : `1px solid ${T.line}`, borderRadius: T.rLg, padding: 20, boxShadow: T.sh1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', opacity: a.type === 'Bank' ? 0.7 : 0.55, color: a.type === 'Bank' ? '#fff' : T.inkSub } as React.CSSProperties}>{a.type}</span>
                    <span style={{ fontSize: 18 }}>{a.type === 'Bank' ? '▭' : a.type === 'Mobile money' ? '◈' : '◎'}</span>
                  </div>
                  <div style={{ fontFamily: T.fDisplay, fontSize: 19, fontWeight: T.dispWeight }}>{a.name}</div>
                  {a.account_number && <div style={{ fontSize: 11.5, fontFamily: T.fMono, opacity: 0.6, marginTop: 2 }}>{a.account_number}</div>}
                  <div style={{ fontFamily: T.fMono, fontSize: 26, fontWeight: 600, marginTop: 14, letterSpacing: '-1px' }}>{money(a.balance)}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button onClick={() => setModal({ kind: 'deposit', account: a })} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, background: a.type === 'Bank' ? 'rgba(255,255,255,0.15)' : T.paperAlt, color: a.type === 'Bank' ? '#fff' : T.inkMid }}>Deposit</button>
                    <button onClick={() => delAcc(a)} style={{ width: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: a.type === 'Bank' ? 'rgba(255,255,255,0.15)' : T.paperAlt, color: a.type === 'Bank' ? '#fff' : T.redText, fontSize: 12 }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </>}
        </div>
      </div>

      {modal === 'expense' && <ExpenseModal T={T} cats={cats} locs={locs} accounts={accounts} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Expense recorded'); reloadExp(); reloadAcc(); }} onAddCat={(n: string) => API.expense.addCategory({ name: n }).then(() => API.expense.categories().then(setCats))} />}
      {modal === 'account' && <AccountModal T={T} types={types} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Account added'); reloadAcc(); }} />}
      {modal === 'transfer' && <TransferModal T={T} accounts={accounts} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Funds transferred'); reloadAcc(); }} />}
      {modal && modal.kind === 'deposit' && <DepositModal T={T} account={modal.account} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Deposit recorded'); reloadAcc(); }} />}
      {node}
    </div>
  );
}

function ExpenseModal({ T, cats, locs, accounts, onClose, onSaved, onAddCat }: { T: Theme; cats: any[]; locs: any[]; accounts: any[]; onClose: () => void; onSaved: () => void; onAddCat: (n: string) => any }) {
  const [f, setF] = useStateFn<any>({ date: new Date().toISOString().slice(0, 10), category_id: (cats[0] || {}).id || '', location_id: (locs[0] || {}).id || 1, account_id: (accounts[0] || {}).id || '', amount: '', payment_status: 'paid', expense_for: '', note: '', is_refund: false });
  const [busy, setBusy] = useStateFn(false);
  const [err, setErr] = useStateFn<any>(null);
  const [newCat, setNewCat] = useStateFn('');
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  // Keep numeric ids numeric (mock) but pass uuid ids through unchanged (real backend).
  const idv = (v: any) => /^\d+$/.test(String(v)) ? Number(v) : v;
  async function save() {
    if (!(Number(f.amount) > 0)) { setErr('Enter an amount.'); return; }
    setBusy(true); setErr(null);
    try { await API.expense.create(f); onSaved(); } catch (ex: any) { setErr(ex.message); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="Add expense" subtitle="Record a business expense" width={600} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Date"><TextField T={T} type="date" value={f.date} onChange={(v: any) => set('date', v)} /></Field>
        <Field T={T} label="Amount"><TextField T={T} type="number" value={f.amount} onChange={(v: any) => set('amount', v)} placeholder="0.00" /></Field>
        <Field T={T} label="Category"><SelectField T={T} value={String(f.category_id)} options={cats.map((c: any) => String(c.id))} onChange={(v: any) => set('category_id', idv(v))} render={(v: any) => (cats.find((c: any) => String(c.id) === v) || {}).name} /></Field>
        <Field T={T} label="Location"><SelectField T={T} value={String(f.location_id)} options={locs.map((l: any) => String(l.id))} onChange={(v: any) => set('location_id', idv(v))} render={(v: any) => (locs.find((l: any) => String(l.id) === v) || {}).name} /></Field>
        <Field T={T} label="Pay from account"><SelectField T={T} value={String(f.account_id)} options={['', ...accounts.map((a: any) => String(a.id))]} onChange={(v: any) => set('account_id', v ? idv(v) : '')} render={(v: any) => v ? (accounts.find((a: any) => String(a.id) === v) || {}).name : 'None'} /></Field>
        <Field T={T} label="Payment status"><SelectField T={T} value={f.payment_status} options={['paid', 'due']} onChange={(v: any) => set('payment_status', v)} render={(v: any) => v === 'paid' ? 'Paid' : 'Due'} /></Field>
        <Field T={T} label="Expense for (optional)" full><TextField T={T} value={f.expense_for} onChange={(v: any) => set('expense_for', v)} placeholder="Employee / customer / supplier name" /></Field>
        <Field T={T} label="Note" full><TextField T={T} value={f.note} onChange={(v: any) => set('note', v)} placeholder="Description" /></Field>
      </FormGrid>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <input value={newCat} onChange={(e: any) => setNewCat(e.target.value)} placeholder="New category…" style={{ flex: 1, padding: '8px 11px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none' }} />
        <Btn T={T} kind="ghost" onClick={() => { if (newCat.trim()) { onAddCat(newCat.trim()); setNewCat(''); } }}>+ Category</Btn>
        <button onClick={() => set('is_refund', !f.is_refund)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.fBody }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${f.is_refund ? T.accent.base : T.lineMid}`, background: f.is_refund ? T.accent.base : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{f.is_refund ? '✓' : ''}</span>
          <span style={{ fontSize: 12.5, color: T.inkMid }}>Refund</span>
        </button>
      </div>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function AccountModal({ T, types, onClose, onSaved }: { T: Theme; types: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useStateFn<any>({ name: '', type: types[0] || 'Cash', account_number: '', balance: '' });
  const [busy, setBusy] = useStateFn(false); const [err, setErr] = useStateFn<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() { if (!f.name.trim()) { setErr('Account name is required.'); return; } setBusy(true); try { await API.paymentAccount.create(f); onSaved(); } catch (ex: any) { setErr(ex.message); } finally { setBusy(false); } }
  return (
    <Modal T={T} title="New payment account" subtitle="Cash, bank or mobile money" width={460} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add account'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Account name" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. Dahabshiil Bank" /></Field>
        <Field T={T} label="Type"><SelectField T={T} value={f.type} options={types} onChange={(v: any) => set('type', v)} /></Field>
        <Field T={T} label="Opening balance"><TextField T={T} type="number" value={f.balance} onChange={(v: any) => set('balance', v)} placeholder="0.00" /></Field>
        <Field T={T} label="Account number (optional)" full><TextField T={T} value={f.account_number} onChange={(v: any) => set('account_number', v)} placeholder="Account / phone number" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function TransferModal({ T, accounts, onClose, onSaved }: { T: Theme; accounts: any[]; onClose: () => void; onSaved: () => void }) {
  const [from, setFrom] = useStateFn<any>((accounts[0] || {}).id || '');
  const [to, setTo] = useStateFn<any>((accounts[1] || {}).id || '');
  const [amount, setAmount] = useStateFn(''); const [busy, setBusy] = useStateFn(false); const [err, setErr] = useStateFn<any>(null);
  async function save() { setBusy(true); setErr(null); try { await API.paymentAccount.transfer({ from_id: from, to_id: to, amount: Number(amount) }); onSaved(); } catch (ex: any) { setErr(ex.message); } finally { setBusy(false); } }
  return (
    <Modal T={T} title="Transfer funds" subtitle="Move money between accounts" width={460} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Transferring…' : 'Transfer'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="From"><SelectField T={T} value={String(from)} options={accounts.map((a: any) => String(a.id))} onChange={(v: any) => setFrom(Number(v))} render={(v: any) => { const a: any = accounts.find((x: any) => String(x.id) === v) || {}; return a.name + ' · ' + money(a.balance); }} /></Field>
        <Field T={T} label="To"><SelectField T={T} value={String(to)} options={accounts.map((a: any) => String(a.id))} onChange={(v: any) => setTo(Number(v))} render={(v: any) => (accounts.find((x: any) => String(x.id) === v) || {}).name} /></Field>
        <Field T={T} label="Amount" full><TextField T={T} type="number" value={amount} onChange={setAmount} placeholder="0.00" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function DepositModal({ T, account, onClose, onSaved }: { T: Theme; account: any; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useStateFn(''); const [busy, setBusy] = useStateFn(false);
  async function save() { setBusy(true); try { await API.paymentAccount.deposit(account.id, Number(amount)); onSaved(); } catch (e) {} finally { setBusy(false); } }
  return (
    <Modal T={T} title={`Deposit · ${account.name}`} subtitle={`Current balance ${money(account.balance)}`} width={400} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Deposit'}</Btn></>}>
      <Field T={T} label="Amount" full><TextField T={T} type="number" value={amount} onChange={setAmount} placeholder="0.00" /></Field>
    </Modal>
  );
}

function finMini(T: Theme, danger: boolean): React.CSSProperties { return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${danger ? T.redSoft : T.line}`, background: danger ? T.redSoft : T.paper, color: danger ? T.redText : T.inkMid }; }
