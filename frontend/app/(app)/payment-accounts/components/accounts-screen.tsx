'use client';
// ─────────────────────────────────────────────────────────────────
// Payment Accounts — the reference's tabbed screen: Accounts (live
// balances = opening + deposits/transfers + linked payments) and
// user-defined Account Types (one level of nesting). The red banner
// counts payments not yet linked to any account.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { ActionsMenu } from '../../products/components/list-table';
import { ConfirmModal } from '../../purchase-orders/components/bits';
import { LuPencil, LuTrash2, LuArrowDownToLine, LuArrowLeftRight, LuLockOpen, LuLock, LuWallet, LuListTree } from 'react-icons/lu';

const { useState: useStatePa, useEffect: useEffectPa } = React;

export function AccountsScreen({ T, flash, onReport }:
  { T: Theme; flash?: React.MutableRefObject<string>; onReport: () => void }) {
  const [tab, setTab] = useStatePa<'accounts' | 'types'>('accounts');
  const [rows, setRows] = useStatePa<any[]>([]);
  const [types, setTypes] = useStatePa<any[]>([]);
  const [unlinked, setUnlinked] = useStatePa(0);
  const [loading, setLoading] = useStatePa(true);
  const [status, setStatus] = useStatePa('active');
  const [typeFilter, setTypeFilter] = useStatePa('');
  const [search, setSearch] = useStatePa('');
  const [menu, setMenu] = useStatePa<any>(null);
  const [editAcc, setEditAcc] = useStatePa<any>(null);   // {} = new
  const [editType, setEditType] = useStatePa<any>(null); // {} = new
  const [deposit, setDeposit] = useStatePa<any>(null);
  const [xfer, setXfer] = useStatePa(false);
  const [confirm, setConfirm] = useStatePa<any>(null); // {kind:'close'|'delete-type', row}
  const [show, node] = useToast();

  const reload = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      API.paymentAccount.listFull({ status, account_type_id: typeFilter || undefined }),
      API.paymentAccount.accountTypes(),
    ]).then(([a, t]: any) => { setRows(a.items); setUnlinked(a.unlinked); setTypes(t); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, typeFilter]);
  useEffectPa(() => { reload(); }, [reload]);
  useEffectPa(() => { if (flash?.current) { show(flash.current); flash.current = ''; } }, [flash, show]);

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? rows.filter((a: any) => [a.name, a.account_number, a.account_type_name, a.account_sub_type_name, a.note].some((v) => String(v || '').toLowerCase().includes(needle)))
    : rows;
  const total = visible.reduce((s: number, a: any) => s + a.balance, 0);

  async function close(a: any) {
    try { await API.paymentAccount.remove(a.id); setConfirm(null); show('Account closed'); reload(); }
    catch (e: any) { setConfirm(null); show(e.message); }
  }
  async function reopen(a: any) {
    try { await API.paymentAccount.reopen(a.id); show('Account reopened'); reload(); }
    catch (e: any) { show(e.message); }
  }
  async function deleteType(t: any) {
    try { await API.paymentAccount.removeAccountType(t.id); setConfirm(null); show('Account type deleted'); reload(); }
    catch (e: any) { setConfirm(null); show(e.message); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '11px 15px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '11px 15px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink, whiteSpace: 'nowrap' };

  const activeAccounts = rows.filter((a: any) => a.is_active);
  const accountActions = (a: any) => [
    { label: 'Edit', icon: <LuPencil size={14} />, on: () => setEditAcc(a) },
    // Money only moves through OPEN accounts.
    ...(a.is_active ? [{ label: 'Deposit', icon: <LuArrowDownToLine size={14} />, on: () => setDeposit(a) }] : []),
    ...(a.is_active && activeAccounts.length >= 2
      ? [{ label: 'Fund Transfer', icon: <LuArrowLeftRight size={14} />, on: () => setXfer(true) }] : []),
    { sep: true },
    a.is_active
      ? { label: 'Close Account', icon: <LuLock size={14} />, danger: true, on: () => setConfirm({ kind: 'close', row: a }) }
      : { label: 'Reopen Account', icon: <LuLockOpen size={14} />, on: () => reopen(a) },
  ];

  const tabBtn = (id: 'accounts' | 'types', icon: any, label: string) => (
    <button onClick={() => setTab(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', border: 'none', borderBottom: `2.5px solid ${tab === id ? T.accent.base : 'transparent'}`, background: 'transparent', color: tab === id ? T.ink : T.inkSub, fontFamily: T.fBody, fontSize: 13.5, fontWeight: tab === id ? 700 : 500, cursor: 'pointer' }}>
      {icon} {label}
    </button>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Payment Accounts" subtitle="Manage your accounts"
        right={<Btn T={T} kind="accent" onClick={() => tab === 'accounts' ? setEditAcc({}) : setEditType({})}>+ Add</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          {unlinked > 0 && (
            <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: '#DC2626', color: '#fff', fontSize: 13.5, fontWeight: 600 }}>
              Total {unlinked} payment{unlinked === 1 ? '' : 's'} not linked with any account.{' '}
              <button onClick={onReport} style={{ background: 'none', border: 'none', color: '#fff', textDecoration: 'underline', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13.5, fontWeight: 700 }}>View Details</button>
            </div>
          )}
          <Panel T={T} pad={false}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.line}`, padding: '0 10px' }}>
              {tabBtn('accounts', <LuWallet size={15} />, 'Accounts')}
              {tabBtn('types', <LuListTree size={15} />, 'Account Types')}
            </div>

            {tab === 'accounts' && <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: `1px solid ${T.line}` }}>
                <div style={{ width: 140 }}>
                  <SelectField T={T} value={status} options={['active', 'closed', 'all']} onChange={setStatus}
                    render={(v: any) => v[0].toUpperCase() + v.slice(1)} />
                </div>
                <div style={{ width: 190 }}>
                  <SelectField T={T} value={typeFilter} options={['', ...types.map((t: any) => String(t.id))]} onChange={setTypeFilter}
                    render={(v: any) => v === '' ? 'All' : (types.find((t: any) => String(t.id) === v) || {}).name || v} />
                </div>
                <div style={{ marginLeft: 'auto', width: 190 }}><TextField T={T} value={search} onChange={setSearch} placeholder="Search …" /></div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                  <thead><tr>
                    <th style={th}>Name</th><th style={th}>Account Type</th><th style={th}>Account Sub Type</th>
                    <th style={th}>Account Number</th><th style={th}>Note</th>
                    <th style={{ ...th, textAlign: 'right' }}>Balance</th><th style={th}>Added By</th><th style={{ ...th, textAlign: 'right' }}>Action</th>
                  </tr></thead>
                  <tbody>
                    {visible.map((a: any) => (
                      <tr key={a.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{a.name}{!a.is_active && <Badge T={T} tone="gray" style={{ marginLeft: 7 }}>Closed</Badge>}</td>
                        <td style={td}>{a.account_type_name || a.type}</td>
                        <td style={td}>{a.account_sub_type_name || '—'}</td>
                        <td style={{ ...td, fontFamily: T.fMono, color: T.inkSub }}>{a.account_number || '—'}</td>
                        <td style={{ ...td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', color: T.inkSub }} title={a.note}>{a.note || '—'}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 700, color: a.balance < 0 ? T.redText : T.ink }}>{money(a.balance)}</td>
                        <td style={{ ...td, color: T.inkSub }}>{a.added_by}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <ActionsMenu T={T} open={menu === a.id} onToggle={() => setMenu(menu === a.id ? null : a.id)} items={accountActions(a)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {visible.length > 0 && (
                    <tfoot><tr>
                      <td colSpan={5} style={{ ...td, fontWeight: 700, textAlign: 'right', background: T.paperAlt }}>Total:</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 700, background: T.paperAlt }}>{money(total)}</td>
                      <td colSpan={2} style={{ ...td, background: T.paperAlt }}></td>
                    </tr></tfoot>
                  )}
                </table>
              </div>
              {!loading && visible.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No accounts yet.</div>}
            </>}

            {tab === 'types' && <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={th}>Name</th><th style={th}>Parent account type</th>
                    <th style={{ ...th, textAlign: 'right' }}>Accounts</th><th style={{ ...th, textAlign: 'right' }}>Action</th>
                  </tr></thead>
                  <tbody>
                    {types.map((t: any) => (
                      <tr key={t.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{t.parent_id ? <span style={{ color: T.inkSub, marginRight: 6 }}>↳</span> : null}{t.name}</td>
                        <td style={td}>{t.parent_name || (t.children > 0 ? <Badge T={T} tone="blue">{t.children} sub</Badge> : '—')}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{t.accounts}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <span style={{ display: 'inline-flex', gap: 6 }}>
                            <button onClick={() => setEditType(t)} title="Edit" style={paMini(T)}><LuPencil size={13} /></button>
                            <button onClick={() => setConfirm({ kind: 'delete-type', row: t })} title="Delete" style={{ ...paMini(T), color: T.redText }}><LuTrash2 size={13} /></button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!loading && types.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No account types yet.</div>}
            </>}
          </Panel>
        </div>
      </div>

      {editAcc && <AccountModal T={T} acc={editAcc.id ? editAcc : null} types={types} onClose={() => setEditAcc(null)}
        onSaved={(m: string) => { setEditAcc(null); show(m); reload(); }} />}
      {editType && <TypeModal T={T} typeRow={editType.id ? editType : null} types={types} onClose={() => setEditType(null)}
        onSaved={(m: string) => { setEditType(null); show(m); reload(); }} />}
      {deposit && <DepositModal T={T} acc={deposit} onClose={() => setDeposit(null)}
        onSaved={() => { setDeposit(null); show('Deposit recorded'); reload(); }} />}
      {xfer && <TransferModal T={T} accounts={activeAccounts} onClose={() => setXfer(false)}
        onSaved={() => { setXfer(false); show('Transfer complete'); reload(); }} />}
      {confirm?.kind === 'close' && (
        <ConfirmModal T={T} title={`Close ${confirm.row.name}?`}
          body="A closed account is hidden from pickers but keeps its history. You can reopen it later."
          confirmLabel="Close Account" confirmKind="danger"
          onConfirm={() => close(confirm.row)} onClose={() => setConfirm(null)} />
      )}
      {confirm?.kind === 'delete-type' && (
        <ConfirmModal T={T} title={`Delete "${confirm.row.name}"?`}
          body="Its sub-types become top-level and accounts of this type keep working, just untyped."
          confirmLabel="Delete" confirmKind="danger"
          onConfirm={() => deleteType(confirm.row)} onClose={() => setConfirm(null)} />
      )}
      {node}
    </div>
  );
}

function AccountModal({ T, acc, types, onClose, onSaved }: any) {
  const [name, setName] = useStatePa(acc?.name || '');
  const [typeId, setTypeId] = useStatePa(acc?.account_type_id || '');
  const [number, setNumber] = useStatePa(acc?.account_number || '');
  const [note, setNote] = useStatePa(acc?.note || '');
  const [opening, setOpening] = useStatePa(acc ? String(acc.opening_balance) : '0');
  const [busy, setBusy] = useStatePa(false);
  const [err, setErr] = useStatePa<string | null>(null);
  async function save() {
    if (!name.trim()) { setErr('Enter the account name.'); return; }
    setBusy(true); setErr(null);
    const body = { name: name.trim(), account_type_id: typeId || undefined, account_number: number.trim() || undefined, note: note.trim() || undefined, balance: Number(opening) || 0 };
    try {
      if (acc) { await API.paymentAccount.update(acc.id, body); onSaved('Account updated'); }
      else { await API.paymentAccount.create(body); onSaved('Account added'); }
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal T={T} title={acc ? 'Edit Account' : 'Add Account'} width={480} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid cols={1}>
        <Field T={T} label="Name *"><TextField T={T} value={name} onChange={setName} placeholder="Name" /></Field>
        <Field T={T} label="Account Type">
          <SelectField T={T} value={String(typeId)} options={['', ...types.map((t: any) => String(t.id))]}
            onChange={setTypeId} render={(v: any) => v === '' ? 'None' : (types.find((t: any) => String(t.id) === v) || {}).name || v} />
        </Field>
        <Field T={T} label="Account Number"><TextField T={T} value={number} onChange={setNumber} placeholder="Account Number" /></Field>
        {!acc && <Field T={T} label="Opening Balance"><TextField T={T} type="number" value={opening} onChange={setOpening} /></Field>}
        <Field T={T} label="Note"><TextField T={T} value={note} onChange={setNote} placeholder="Note" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
    </Modal>
  );
}

function TypeModal({ T, typeRow, types, onClose, onSaved }: any) {
  const [name, setName] = useStatePa(typeRow?.name || '');
  const [parentId, setParentId] = useStatePa(typeRow?.parent_id || '');
  const [busy, setBusy] = useStatePa(false);
  const [err, setErr] = useStatePa<string | null>(null);
  const parents = types.filter((t: any) => !t.parent_id && t.id !== typeRow?.id);
  async function save() {
    if (!name.trim()) { setErr('Enter the name.'); return; }
    setBusy(true); setErr(null);
    const body = { name: name.trim(), parent_id: parentId || undefined };
    try {
      if (typeRow) { await API.paymentAccount.updateAccountType(typeRow.id, body); onSaved('Account type updated'); }
      else { await API.paymentAccount.addAccountType(body); onSaved('Account type added'); }
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal T={T} title={typeRow ? 'Edit account type' : 'Add account type'} width={440} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid cols={1}>
        <Field T={T} label="Name *"><TextField T={T} value={name} onChange={setName} placeholder="Name" /></Field>
        <Field T={T} label="Parent account type">
          <SelectField T={T} value={String(parentId)} options={['', ...parents.map((t: any) => String(t.id))]}
            onChange={setParentId} render={(v: any) => v === '' ? 'Please Select' : (parents.find((t: any) => String(t.id) === v) || {}).name || v} />
        </Field>
      </FormGrid>
      {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
    </Modal>
  );
}

function DepositModal({ T, acc, onClose, onSaved }: any) {
  const [amount, setAmount] = useStatePa('');
  const [note, setNote] = useStatePa('');
  const [busy, setBusy] = useStatePa(false);
  const [err, setErr] = useStatePa<string | null>(null);
  async function save() {
    if (!(Number(amount) > 0)) { setErr('Enter the amount.'); return; }
    setBusy(true); setErr(null);
    try { await API.paymentAccount.deposit(acc.id, Number(amount), note.trim() || undefined); onSaved(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal T={T} title={`Deposit — ${acc.name}`} width={420} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Deposit'}</Btn></>}>
      <FormGrid cols={1}>
        <Field T={T} label="Amount *"><TextField T={T} type="number" value={amount} onChange={setAmount} /></Field>
        <Field T={T} label="Note"><TextField T={T} value={note} onChange={setNote} /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
    </Modal>
  );
}

function TransferModal({ T, accounts, onClose, onSaved }: any) {
  const [fromId, setFromId] = useStatePa(String(accounts[0]?.id || ''));
  const [toId, setToId] = useStatePa(String(accounts[1]?.id || ''));
  const [amount, setAmount] = useStatePa('');
  const [busy, setBusy] = useStatePa(false);
  const [err, setErr] = useStatePa<string | null>(null);
  async function save() {
    if (!fromId || !toId || fromId === toId) { setErr('Pick two different accounts.'); return; }
    if (!(Number(amount) > 0)) { setErr('Enter the amount.'); return; }
    setBusy(true); setErr(null);
    try { await API.paymentAccount.transfer({ from_id: fromId, to_id: toId, amount: Number(amount) }); onSaved(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  const nameOf = (v: any) => (accounts.find((a: any) => String(a.id) === v) || {}).name || v;
  return (
    <Modal T={T} title="Fund Transfer" width={440} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Transfer'}</Btn></>}>
      <FormGrid cols={1}>
        <Field T={T} label="From *"><SelectField T={T} value={fromId} options={accounts.map((a: any) => String(a.id))} onChange={setFromId} render={nameOf} /></Field>
        <Field T={T} label="To *"><SelectField T={T} value={toId} options={accounts.map((a: any) => String(a.id))} onChange={setToId} render={nameOf} /></Field>
        <Field T={T} label="Amount *"><TextField T={T} type="number" value={amount} onChange={setAmount} /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
    </Modal>
  );
}

function paMini(T: Theme): React.CSSProperties {
  return { width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
}
