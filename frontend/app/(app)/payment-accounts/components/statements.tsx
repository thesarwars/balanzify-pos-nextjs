'use client';
// ─────────────────────────────────────────────────────────────────
// Payment Accounts statements — Balance Sheet, Trial Balance, Cash
// Flow and the Payment Account Report (every payment across sales /
// expenses / purchases, linkable to an account).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { todayLocal } from '@/lib/business-settings';
import { LuPrinter } from 'react-icons/lu';

const { useState: useStSt, useEffect: useEfSt } = React;

const SOURCE_LABEL: any = { sell: 'Sell', expense: 'Expense', purchase: 'Purchase', refund: 'Sell Return' };
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

function FilterBar({ T, children }: any) {
  return (
    <Panel T={T}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>{children}</div>
    </Panel>
  );
}

function useLocations() {
  const [locs, setLocs] = useStSt<any[]>([]);
  useEfSt(() => { API.location.list().then(setLocs).catch(() => {}); }, []);
  return locs;
}

// ── Balance Sheet ────────────────────────────────────────────────────
export function BalanceSheet({ T }: { T: Theme }) {
  const locs = useLocations();
  const [locationId, setLocationId] = useStSt('');
  const [date, setDate] = useStSt(todayLocal());
  const [data, setData] = useStSt<any>(null);
  useEfSt(() => {
    let dead = false;
    API.paymentAccount.balanceSheet({ location_id: locationId || undefined, date }).then((d: any) => { if (!dead) setData(d); }).catch(() => {});
    return () => { dead = true; };
  }, [locationId, date]);

  const row = (l: string, v: any, bold = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', fontSize: 13, fontWeight: bold ? 700 : 500, color: T.ink, background: bold ? T.paperAlt : 'transparent', borderBottom: `1px solid ${T.line}` }}>
      <span>{l}</span><span style={{ fontFamily: T.fMono }}>{v}</span>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Balance Sheet" subtitle="Dues, stock and account balances"
        right={<Btn T={T} kind="accent" onClick={() => window.print()}><LuPrinter size={15} /> Print</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <FilterBar T={T}>
            <div style={{ minWidth: 200 }}>
              <Field T={T} label="Business Location">
                <SelectField T={T} value={locationId} options={['', ...locs.map((l: any) => String(l.id))]} onChange={setLocationId}
                  render={(v: any) => v === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === v) || {}).name || v} />
              </Field>
            </div>
            <div style={{ minWidth: 170 }}>
              <Field T={T} label="Filter by date"><TextField T={T} type="date" value={date} onChange={setDate} /></Field>
            </div>
          </FilterBar>
          <Panel T={T} pad={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <div style={{ borderRight: `1px solid ${T.line}` }}>
                <div style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>Liability</div>
                {row('Supplier Due:', money(data?.liabilities?.supplier_due || 0))}
                <div style={{ minHeight: 120 }} />
                {row('Total Liability:', money(data?.liabilities?.total || 0), true)}
              </div>
              <div>
                <div style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>Assets</div>
                {row('Customer Due:', money(data?.assets?.customer_due || 0))}
                {row('Closing stock:', money(data?.assets?.closing_stock || 0))}
                <div style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: T.ink, borderBottom: `1px solid ${T.line}` }}>
                  Account Balances:
                  {(data?.assets?.accounts || []).map((a: any) => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0 0 14px', fontSize: 12.5, color: T.inkMid }}>
                      <span>{a.name}</span><span style={{ fontFamily: T.fMono }}>{money(a.balance)}</span>
                    </div>
                  ))}
                  {(data?.assets?.accounts || []).length === 0 && <span style={{ marginLeft: 10, fontSize: 12, color: T.inkMute }}>—</span>}
                </div>
                {row('Total Assets:', money(data?.assets?.total || 0), true)}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Trial Balance ────────────────────────────────────────────────────
export function TrialBalance({ T }: { T: Theme }) {
  const locs = useLocations();
  const [locationId, setLocationId] = useStSt('');
  const [date, setDate] = useStSt(todayLocal());
  const [data, setData] = useStSt<any>(null);
  useEfSt(() => {
    let dead = false;
    API.paymentAccount.trialBalance({ location_id: locationId || undefined, date }).then((d: any) => { if (!dead) setData(d); }).catch(() => {});
    return () => { dead = true; };
  }, [locationId, date]);

  const td: React.CSSProperties = { padding: '10px 16px', fontSize: 13, color: T.ink, borderBottom: `1px solid ${T.line}` };
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Trial Balance" subtitle="Debits and credits at a glance"
        right={<Btn T={T} kind="accent" onClick={() => window.print()}><LuPrinter size={15} /> Print</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <FilterBar T={T}>
            <div style={{ minWidth: 200 }}>
              <Field T={T} label="Business Location">
                <SelectField T={T} value={locationId} options={['', ...locs.map((l: any) => String(l.id))]} onChange={setLocationId}
                  render={(v: any) => v === '' ? 'All locations' : (locs.find((l: any) => String(l.id) === v) || {}).name || v} />
              </Field>
            </div>
            <div style={{ minWidth: 170 }}>
              <Field T={T} label="Filter by date"><TextField T={T} type="date" value={date} onChange={setDate} /></Field>
            </div>
          </FilterBar>
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...td, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: T.inkSub, background: T.paperAlt, textAlign: 'left' }}>Trial Balance</th>
                <th style={{ ...td, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: T.inkSub, background: T.paperAlt, textAlign: 'right', width: 180 }}>Debit</th>
                <th style={{ ...td, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: T.inkSub, background: T.paperAlt, textAlign: 'right', width: 180 }}>Credit</th>
              </tr></thead>
              <tbody>
                {(data?.rows || []).map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.label}:</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono }}>{r.debit ? money(r.debit) : ''}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono }}>{r.credit ? money(r.credit) : ''}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, fontWeight: 700, background: T.paperAlt }}>Total</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 700, background: T.paperAlt }}>{money(data?.totals?.debit || 0)}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 700, background: T.paperAlt }}>{money(data?.totals?.credit || 0)}</td>
                </tr>
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Cash Flow ────────────────────────────────────────────────────────
export function CashFlow({ T }: { T: Theme }) {
  const locs = useLocations();
  const [accounts, setAccounts] = useStSt<any[]>([]);
  const [accountId, setAccountId] = useStSt('');
  const [type, setType] = useStSt('');
  const [from, setFrom] = useStSt(startOfYear());
  const [to, setTo] = useStSt(todayLocal());
  const [data, setData] = useStSt<any>({ rows: [], totals: { debit: 0, credit: 0 } });
  const [loading, setLoading] = useStSt(true);
  useEfSt(() => { API.paymentAccount.list({ status: 'all' }).then(setAccounts).catch(() => {}); }, []);
  useEfSt(() => {
    let dead = false;
    setLoading(true);
    API.paymentAccount.cashFlow({ account_id: accountId || undefined, from, to, type: type || undefined })
      .then((d: any) => { if (!dead) setData(d); }).catch(() => {}).finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [accountId, from, to, type]);

  const th: React.CSSProperties = { textAlign: 'left', padding: '11px 14px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 14px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink, whiteSpace: 'nowrap' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Cash Flow" subtitle="Money in and out of every account" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <FilterBar T={T}>
            <div style={{ minWidth: 190 }}>
              <Field T={T} label="Account">
                <SelectField T={T} value={accountId} options={['', ...accounts.map((a: any) => String(a.id))]} onChange={setAccountId}
                  render={(v: any) => v === '' ? 'All' : (accounts.find((a: any) => String(a.id) === v) || {}).name || v} />
              </Field>
            </div>
            <div style={{ minWidth: 160 }}>
              <Field T={T} label="Transaction Type">
                <SelectField T={T} value={type} options={['', 'debit', 'credit']} onChange={setType}
                  render={(v: any) => v === '' ? 'All' : v === 'debit' ? 'Money in (debit)' : 'Money out (credit)'} />
              </Field>
            </div>
            <div style={{ minWidth: 155 }}><Field T={T} label="From"><TextField T={T} type="date" value={from} onChange={setFrom} /></Field></div>
            <div style={{ minWidth: 155 }}><Field T={T} label="To"><TextField T={T} type="date" value={to} onChange={setTo} /></Field></div>
          </FilterBar>
          <Panel T={T} pad={false}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                <thead><tr>
                  <th style={th}>Date</th><th style={th}>Account</th><th style={th}>Description</th><th style={th}>Payment Method</th>
                  <th style={{ ...th, textAlign: 'right' }}>Debit</th><th style={{ ...th, textAlign: 'right' }}>Credit</th>
                  <th style={{ ...th, textAlign: 'right' }}>Account Balance</th><th style={{ ...th, textAlign: 'right' }}>Total Balance</th>
                </tr></thead>
                <tbody>
                  {data.rows.map((r: any, i: number) => (
                    <tr key={i}>
                      <td style={{ ...td, color: T.inkSub }}>{r.date ? new Date(r.date).toLocaleString() : '—'}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.account || '—'}</td>
                      <td style={{ ...td, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.description}>{r.description}</td>
                      <td style={{ ...td, color: T.inkSub }}>{r.method || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, color: r.debit ? T.ink : T.inkMute }}>{r.debit ? money(r.debit) : ''}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, color: r.credit ? T.redText : T.inkMute }}>{r.credit ? money(r.credit) : ''}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono }}>{money(r.account_balance)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 600 }}>{money(r.total_balance)}</td>
                    </tr>
                  ))}
                </tbody>
                {data.rows.length > 0 && (
                  <tfoot><tr>
                    <td colSpan={4} style={{ ...td, fontWeight: 700, textAlign: 'right', background: T.paperAlt }}>Total:</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 700, background: T.paperAlt }}>{money(data.totals.debit)}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 700, background: T.paperAlt }}>{money(data.totals.credit)}</td>
                    <td colSpan={2} style={{ ...td, background: T.paperAlt }}></td>
                  </tr></tfoot>
                )}
              </table>
            </div>
            {loading && <div style={{ padding: 40, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>}
            {!loading && data.rows.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No transactions in this range. Payments appear here once linked to an account.</div>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Payment Account Report ───────────────────────────────────────────
export function AccountReport({ T }: { T: Theme }) {
  const [accounts, setAccounts] = useStSt<any[]>([]);
  const [accountId, setAccountId] = useStSt('');
  const [from, setFrom] = useStSt(startOfYear());
  const [to, setTo] = useStSt(todayLocal());
  const [rows, setRows] = useStSt<any[]>([]);
  const [unlinked, setUnlinked] = useStSt(0);
  const [loading, setLoading] = useStSt(true);
  const [linking, setLinking] = useStSt<any>(null);
  const [search, setSearch] = useStSt('');
  const [nonce, setNonce] = useStSt(0);
  const [show, node] = useToast();

  useEfSt(() => { API.paymentAccount.list({ status: 'active' }).then(setAccounts).catch(() => {}); }, []);
  useEfSt(() => {
    let dead = false;
    setLoading(true);
    API.paymentAccount.report({ account_id: accountId || undefined, from, to })
      .then((d: any) => { if (dead) return; setRows(d.rows); setUnlinked(d.unlinked); })
      .catch(() => {}).finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [accountId, from, to, nonce]);

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? rows.filter((r: any) => [r.ref, r.doc_ref, r.description, r.account_name].some((v) => String(v || '').toLowerCase().includes(needle)))
    : rows;

  const th: React.CSSProperties = { textAlign: 'left', padding: '11px 14px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 14px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink, whiteSpace: 'nowrap' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Payment Account Report" subtitle={`${unlinked} payment${unlinked === 1 ? '' : 's'} not linked to an account`} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <FilterBar T={T}>
            <div style={{ minWidth: 190 }}>
              <Field T={T} label="Account">
                <SelectField T={T} value={accountId} options={['', 'none', ...accounts.map((a: any) => String(a.id))]} onChange={setAccountId}
                  render={(v: any) => v === '' ? 'All' : v === 'none' ? 'Not linked' : (accounts.find((a: any) => String(a.id) === v) || {}).name || v} />
              </Field>
            </div>
            <div style={{ minWidth: 155 }}><Field T={T} label="From"><TextField T={T} type="date" value={from} onChange={setFrom} /></Field></div>
            <div style={{ minWidth: 155 }}><Field T={T} label="To"><TextField T={T} type="date" value={to} onChange={setTo} /></Field></div>
            <div style={{ marginLeft: 'auto', minWidth: 190 }}><Field T={T} label="Search"><TextField T={T} value={search} onChange={setSearch} placeholder="Search …" /></Field></div>
          </FilterBar>
          <Panel T={T} pad={false}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1020 }}>
                <thead><tr>
                  <th style={th}>Date</th><th style={th}>Payment Ref No.</th><th style={th}>Invoice No./Ref. No.</th>
                  <th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>Payment Type</th><th style={th}>Account</th>
                  <th style={th}>Description</th><th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr></thead>
                <tbody>
                  {visible.map((r: any) => (
                    <tr key={`${r.source}-${r.id}`}>
                      <td style={{ ...td, color: T.inkSub }}>{r.date ? new Date(r.date).toLocaleString() : '—'}</td>
                      <td style={{ ...td, fontFamily: T.fMono }}>{r.ref}</td>
                      <td style={td}>{r.doc_ref ? <Badge T={T} tone="blue">{r.doc_ref}</Badge> : '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, fontWeight: 600 }}>{money(r.amount)}</td>
                      <td style={td}>{SOURCE_LABEL[r.source] || r.source}</td>
                      <td style={td}>{r.account_name || <span style={{ color: T.inkMute }}>—</span>}</td>
                      <td style={{ ...td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.description}>{r.description}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button onClick={() => setLinking(r)}
                          style={{ padding: '5px 12px', borderRadius: 99, border: `1.5px solid ${T.accent.base}`, background: 'transparent', color: T.accent.text, fontFamily: T.fBody, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {r.account_id ? 'Change Account' : 'Link Account'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {loading && <div style={{ padding: 40, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>}
            {!loading && visible.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No payments in this range.</div>}
          </Panel>
        </div>
      </div>

      {linking && <LinkAccountModal T={T} payment={linking} accounts={accounts} onClose={() => setLinking(null)}
        onSaved={() => { setLinking(null); show('Payment linked'); setNonce((n: number) => n + 1); }} />}
      {node}
    </div>
  );
}

function LinkAccountModal({ T, payment, accounts, onClose, onSaved }: any) {
  const [accountId, setAccountId] = useStSt(payment.account_id || '');
  const [busy, setBusy] = useStSt(false);
  const [err, setErr] = useStSt<string | null>(null);
  async function save() {
    setBusy(true); setErr(null);
    try { await API.paymentAccount.linkPayment(payment.source, payment.id, accountId || null); onSaved(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal T={T} title={`Link Account — Payment Ref No.: ${payment.ref}`} width={440} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid cols={1}>
        <Field T={T} label="Account">
          <SelectField T={T} value={String(accountId)} options={['', ...accounts.map((a: any) => String(a.id))]} onChange={setAccountId}
            render={(v: any) => v === '' ? 'None (unlink)' : (accounts.find((a: any) => String(a.id) === v) || {}).name || v} />
        </Field>
      </FormGrid>
      {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
    </Modal>
  );
}
