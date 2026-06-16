'use client';
// ─────────────────────────────────────────────────────────────────
// Contacts — Suppliers & Customers (one screen, kind-driven).
// Covers the manual: contact types, customer groups (price calc %),
// opening / advance balance, credit limit, ledger, and pay/receive.
// All wired through API.contact + API.customerGroup.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast, useViewport } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useStateC, useEffect: useEffectC } = React;

export function Contacts({ T, kind }: { T: Theme; kind: 'customer' | 'supplier' }) {
  const isCust = kind !== 'supplier';
  const noun = isCust ? 'Customer' : 'Supplier';
  const [rows, setRows] = useStateC<any[]>([]);
  const [loading, setLoading] = useStateC(true);
  const [q, setQ] = useStateC('');
  const [groups, setGroups] = useStateC<any[]>([]);
  const [sel, setSel] = useStateC<any>(null);
  const [edit, setEdit] = useStateC<any>(null);     // contact being edited, or {} for new
  const [pay, setPay] = useStateC<any>(null);        // { contact, kind }
  const [grpMgr, setGrpMgr] = useStateC(false);
  const [confirmDel, setConfirmDel] = useStateC<any>(null);
  const [toast, toastNode] = useToast();

  const reload = React.useCallback(() => {
    setLoading(true);
    API.contact.list({ type: kind })
      .then(setRows).catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [kind]);
  useEffectC(() => { reload(); }, [reload]);
  useEffectC(() => { API.customerGroup.list().then(setGroups).catch(() => {}); }, []);

  let view = rows;
  if (q.trim()) { const s = q.toLowerCase(); view = view.filter((c: any) => c.name.toLowerCase().includes(s) || (c.mobile || '').includes(q) || c.contact_id.toLowerCase().includes(s)); }

  const totalDue = rows.reduce((s: number, c: any) => s + (c.due || 0), 0);
  const withDue = rows.filter((c: any) => c.due > 0).length;
  const stats = isCust
    ? [['Customers', rows.length], ['With balance due', withDue], ['Total receivable', money(totalDue)]]
    : [['Suppliers', rows.length], ['With balance due', withDue], ['Total payable', money(totalDue)]];

  async function doDelete(c: any) {
    try { await API.contact.remove(c.id, c); setConfirmDel(null); if (sel && sel.id === c.id) setSel(null); toast(noun + ' deleted'); reload(); }
    catch (ex: any) { setConfirmDel(null); toast(ex.message || 'Delete failed'); }
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: T.paperAlt }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar T={T} title={noun + 's'} subtitle={`${rows.length} ${noun.toLowerCase()}s`}
          right={<>
            {isCust && <Btn T={T} kind="ghost" onClick={() => setGrpMgr(true)}>◆ Customer Groups</Btn>}
            <Btn T={T} kind="accent" onClick={() => setEdit({ type: isCust ? 'customer' : 'supplier' })}>+ Add {noun}</Btn>
          </>} />
        <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <StatStrip T={T} stats={stats} />
            <Panel T={T} pad={false}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${T.line}` }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.inkMute, fontSize: 14 }}>⌕</span>
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search name, mobile or ${noun.toLowerCase()} ID…`} style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{([[noun, 'l'], ['Contact ID', 'l'], ['Mobile', 'l'], isCust ? ['Total sale', 'r'] : ['Total purchase', 'r'], ['Balance due', 'r'], ['', 'r']] as any[]).map(([h, a]: any, i: number) => (
                  <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {view.map((c: any) => (
                    <tr key={c.id} onClick={() => setSel(c)} style={{ cursor: 'pointer', transition: 'background .12s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = T.paperAlt} onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span style={{ width: 30, height: 30, borderRadius: 99, flexShrink: 0, background: T.accent.soft, color: T.accent.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{c.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <b style={{ color: T.ink, fontSize: 13 }}>{c.name}</b>
                            {c.type === 'both' && <Badge T={T} tone="violet">Both</Badge>}
                            {isCust && c.group_name && c.group_name !== 'Retail' && <Badge T={T} tone="blue">{c.group_name}</Badge>}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{c.contact_id}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: c.mobile ? T.inkMid : T.inkMute }}>{c.mobile || '—'}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, color: T.ink }}>{money(isCust ? (c.total_sale || 0) : (c.total_purchase || 0))}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>{c.due > 0 ? <Badge T={T} tone="amber">{money(c.due)}</Badge> : <span style={{ fontSize: 12.5, color: T.inkMute }}>Settled</span>}</td>
                      <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}>
                        <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                          {c.due > 0 && <button onClick={() => setPay({ contact: c, kind: isCust ? 'receive' : 'pay' })} style={miniBtn(T, 'accent')}>{isCust ? 'Receive' : 'Pay'}</button>}
                          <button onClick={() => setEdit(c)} style={miniBtn(T)}>Edit</button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && <div style={{ padding: '46px', textAlign: 'center', color: T.inkSub, fontFamily: T.fMono, fontSize: 12.5 }}>GET /connector/api/contactapi…</div>}
              {!loading && view.length === 0 && <div style={{ padding: '46px', textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No {noun.toLowerCase()}s found.</div>}
            </Panel>
          </div>
        </div>
      </div>

      {sel && <ContactDrawer T={T} contact={sel} isCust={isCust} groups={groups} onClose={() => setSel(null)} onEdit={() => setEdit(sel)} onPay={(k: any) => setPay({ contact: sel, kind: k })} onDelete={() => setConfirmDel(sel)} />}
      {edit && <ContactEditor T={T} contact={edit} groups={groups} onClose={() => setEdit(null)} onSaved={(c: any) => { setEdit(null); toast(edit.id ? 'Contact updated' : 'Contact created'); reload(); if (sel && c && sel.id === c.id) setSel(c); }} toast={toast} />}
      {pay && <PaymentModal T={T} info={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); toast('Payment recorded'); reload(); }} toast={toast} />}
      {grpMgr && <GroupManager T={T} groups={groups} onClose={() => setGrpMgr(false)} onChange={() => API.customerGroup.list().then(setGroups)} toast={toast} />}
      {confirmDel && (
        <Modal T={T} title={`Delete ${noun.toLowerCase()}?`} subtitle={confirmDel.name} width={420} onClose={() => setConfirmDel(null)} onSave={() => doDelete(confirmDel)} saveLabel="Delete">
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>Remove <b style={{ color: T.ink }}>{confirmDel.name}</b>? Their transaction history stays in reports.</div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}

// ── Contact editor (Add / Edit) ─────────────────────────────────────
function ContactEditor({ T, contact, groups, onClose, onSaved, toast }: { T: Theme; contact: any; groups: any[]; onClose: () => void; onSaved: (c: any) => void; toast: (m: string) => void }) {
  const editing = !!contact.id;
  const [f, setF] = useStateC<any>({
    type: contact.type || 'customer', name: contact.name || '', mobile: contact.mobile || '', email: contact.email || '',
    address: contact.address || '', tax_number: contact.tax_number || '',
    customer_group_id: contact.customer_group_id ?? 1, pay_term_number: contact.pay_term_number || '', pay_term_type: contact.pay_term_type || 'days',
    credit_limit: contact.credit_limit ?? '', opening_balance: contact.opening_balance || '',
  });
  const [more, setMore] = useStateC(editing && (contact.credit_limit != null || contact.opening_balance));
  const [busy, setBusy] = useStateC(false);
  const [err, setErr] = useStateC<string | null>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const isCust = f.type !== 'supplier';

  async function save() {
    if (!f.name.trim()) { setErr('Contact name is required.'); return; }
    setBusy(true); setErr(null);
    try {
      const saved = editing ? await API.contact.update(contact.id, f) : await API.contact.create(f);
      onSaved(saved);
    } catch (ex: any) { setErr(ex.message || 'Could not save the contact.'); }
    finally { setBusy(false); }
  }

  return (
    <Modal T={T} title={editing ? 'Edit contact' : 'New contact'} subtitle={editing ? contact.contact_id : 'Add a customer or supplier'} width={620} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create contact'}</Btn></>}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSub, marginBottom: 8 }}>Contact type</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['customer', 'Customer'], ['supplier', 'Supplier'], ['both', 'Both']].map(([id, lbl]) => (
            <button key={id} onClick={() => set('type', id)} style={{ padding: '9px', borderRadius: T.r, cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: 700, background: f.type === id ? T.accent.soft : T.paper, border: `1.5px solid ${f.type === id ? T.accent.base : T.line}`, color: f.type === id ? T.accent.text : T.ink }}>{lbl}</button>
          ))}
        </div>
      </div>
      <FormGrid>
        <Field T={T} label="Name" full><TextField T={T} value={f.name} onChange={v => set('name', v)} placeholder="Contact name" /></Field>
        <Field T={T} label="Mobile"><TextField T={T} value={f.mobile} onChange={v => set('mobile', v)} placeholder="+252 …" /></Field>
        <Field T={T} label="Email"><TextField T={T} type="email" value={f.email} onChange={v => set('email', v)} placeholder="optional" /></Field>
        <Field T={T} label="Address" full><TextField T={T} value={f.address} onChange={v => set('address', v)} placeholder="Street, district, city" /></Field>
        {isCust && <Field T={T} label="Customer group"><SelectField T={T} value={String(f.customer_group_id)} options={['1', ...groups.filter((g: any) => g.id !== 1).map((g: any) => String(g.id))]} onChange={v => set('customer_group_id', v)} render={(v: any) => { const g = (groups.find((x: any) => String(x.id) === v) || { name: 'Retail', amount: 0 }); return g.name + (g.amount ? ` (${g.amount > 0 ? '+' : ''}${g.amount}%)` : ''); }} /></Field>}
        <Field T={T} label="Tax number"><TextField T={T} value={f.tax_number} onChange={v => set('tax_number', v)} placeholder="VAT / GST no." /></Field>
      </FormGrid>

      <button onClick={() => setMore((m: boolean) => !m)} style={{ marginTop: 14, background: 'none', border: 'none', color: T.accent.text, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: T.fBody }}>{more ? '− Less information' : '+ More information'}</button>
      {more && (
        <div style={{ marginTop: 14 }}>
          <FormGrid>
            <Field T={T} label="Pay term">
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><TextField T={T} type="number" value={f.pay_term_number} onChange={v => set('pay_term_number', v)} placeholder="e.g. 30" /></div>
                <div style={{ width: 110 }}><SelectField T={T} value={f.pay_term_type} options={['days', 'months']} onChange={v => set('pay_term_type', v)} /></div>
              </div>
            </Field>
            {isCust && <Field T={T} label="Credit limit"><TextField T={T} type="number" value={f.credit_limit} onChange={v => set('credit_limit', v)} placeholder="Blank = no limit" /></Field>}
            <Field T={T} label="Opening balance"><TextField T={T} type="number" value={f.opening_balance} onChange={v => set('opening_balance', v)} placeholder="0.00" /></Field>
          </FormGrid>
          <div style={{ fontSize: 11, color: T.inkMute, marginTop: 8, lineHeight: 1.5 }}>{isCust ? 'Opening balance = amount this customer already owes you. Credit limit blank means unlimited credit.' : 'Opening balance = amount you already owe this supplier.'}</div>
        </div>
      )}
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
    </Modal>
  );
}

// ── Contact detail drawer + ledger ──────────────────────────────────
function ContactDrawer({ T, contact, isCust, groups, onClose, onEdit, onPay, onDelete }: { T: Theme; contact: any; isCust: boolean; groups: any[]; onClose: () => void; onEdit: () => void; onPay: (k: any) => void; onDelete: () => void }) {
  const { isMobile } = useViewport();
  const [data, setData] = useStateC<any>(null);
  useEffectC(() => { setData(null); API.contact.ledger(contact.id).then(setData).catch(() => {}); }, [contact.id]);
  const c = (data && data.contact) || contact;
  const grp = groups.find((g: any) => g.id === c.customer_group_id);

  return (
    <div style={(isMobile
      ? { position: 'fixed', inset: 0, zIndex: 200, background: T.paper, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
      : { width: 380, minWidth: 380, borderLeft: `1px solid ${T.line}`, background: T.paper, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideLeft .2s ease' }) as React.CSSProperties}>
      <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${T.line}`, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.line}`, background: T.paper, color: T.inkSub, cursor: 'pointer', fontSize: 13 }}>✕</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <span style={{ width: 46, height: 46, borderRadius: 99, background: T.accent.soft, color: T.accent.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700 }}>{c.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</span>
          <div>
            <div style={{ fontFamily: T.fDisplay, fontSize: 19, fontWeight: T.dispWeight, color: T.ink, letterSpacing: T.dispTrack }}>{c.name}</div>
            <div style={{ fontSize: 11.5, color: T.inkSub, fontFamily: T.fMono, marginTop: 1 }}>{c.contact_id} · {c.type}</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <MiniStat T={T} label={isCust ? 'Total sale' : 'Total purchase'} value={money(isCust ? (c.total_sale || 0) : (c.total_purchase || 0))} />
          <MiniStat T={T} label="Balance due" value={money(c.due || 0)} tone={c.due > 0 ? T.amber : T.green} />
          <MiniStat T={T} label="Opening balance" value={money(c.opening_balance || 0)} />
          <MiniStat T={T} label="Advance balance" value={money(c.advance_balance || 0)} tone={T.green} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <Btn T={T} kind="accent" style={{ flex: 1 }} onClick={() => onPay(isCust ? 'receive' : 'pay')}>{isCust ? 'Receive payment' : 'Pay due'}</Btn>
          <Btn T={T} kind="ghost" onClick={onEdit}>Edit</Btn>
          <Btn T={T} kind="ghost" onClick={onDelete} style={{ color: T.redText }}>🗑</Btn>
        </div>

        {([['Mobile', c.mobile || '—'], ['Email', c.email || '—'], ['Address', c.address || '—'], ['Tax number', c.tax_number || '—'], isCust ? ['Customer group', grp ? grp.name + (grp.amount ? ` (${grp.amount > 0 ? '+' : ''}${grp.amount}%)` : '') : 'Retail'] : null, ['Pay term', c.pay_term_number ? `${c.pay_term_number} ${c.pay_term_type}` : '—'], isCust ? ['Credit limit', c.credit_limit == null ? 'No limit' : money(c.credit_limit)] : null].filter(Boolean) as any[]).map(([k, v]: any) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}>
            <span style={{ color: T.inkSub, flexShrink: 0 }}>{k}</span>
            <span style={{ fontWeight: 600, color: T.ink, textAlign: 'right' }}>{v}</span>
          </div>
        ))}

        <div style={{ marginTop: 20, marginBottom: 9, fontSize: 11, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: T.inkSub }}>Ledger</div>
        {!data && <div style={{ padding: '20px', textAlign: 'center', fontFamily: T.fMono, fontSize: 11.5, color: T.inkMute }}>GET /connector/api/contact-ledger/{contact.id}…</div>}
        {data && (
          <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.8fr', padding: '7px 11px', background: T.paperAlt, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub }}><span>Reference</span><span style={{ textAlign: 'right' }}>Debit</span><span style={{ textAlign: 'right' }}>Credit</span></div>
            {data.ledger.length === 0 && <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: T.inkMute }}>No transactions yet.</div>}
            {data.ledger.map((l: any, i: number) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.8fr', padding: '9px 11px', borderTop: `1px solid ${T.line}`, fontSize: 12 }}>
                <span><span style={{ fontWeight: 600, color: T.ink, fontFamily: T.fMono }}>{l.ref}</span><span style={{ display: 'block', fontSize: 10, color: T.inkSub }}>{l.date} · {l.type.replace('_', ' ')}</span></span>
                <span style={{ textAlign: 'right', fontFamily: T.fMono, color: l.debit ? T.ink : T.inkMute }}>{l.debit ? money(l.debit) : '—'}</span>
                <span style={{ textAlign: 'right', fontFamily: T.fMono, color: l.credit ? T.greenText : T.inkMute }}>{l.credit ? money(l.credit) : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Payment modal (receive / pay) ───────────────────────────────────
function PaymentModal({ T, info, onClose, onDone, toast }: { T: Theme; info: any; onClose: () => void; onDone: () => void; toast: (m: string) => void }) {
  const c = info.contact;
  const receiving = info.kind === 'receive';
  const [amount, setAmount] = useStateC(String(c.due || ''));
  const [method, setMethod] = useStateC('cash');
  const [note, setNote] = useStateC('');
  const [busy, setBusy] = useStateC(false);
  const [err, setErr] = useStateC<string | null>(null);
  async function submit() {
    setBusy(true); setErr(null);
    try { await API.contact.pay({ contact_id: c.id, amount: Number(amount), kind: info.kind, method, note }); onDone(); }
    catch (ex: any) { setErr(ex.message); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title={receiving ? 'Receive payment' : 'Pay due'} subtitle={c.name} width={420} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={submit} disabled={busy}>{busy ? 'Recording…' : receiving ? 'Receive' : 'Pay'}</Btn></>}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 11.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Balance due</div>
        <div style={{ fontFamily: T.fMono, fontSize: 32, fontWeight: 500, color: T.ink, marginTop: 2 }}>{money(c.due || 0)}</div>
      </div>
      <FormGrid>
        <Field T={T} label="Amount" full><TextField T={T} type="number" value={amount} onChange={setAmount} placeholder="0.00" /></Field>
        <Field T={T} label="Method"><SelectField T={T} value={method} options={['cash', 'zaad', 'evc', 'card', 'bank', 'advance']} onChange={setMethod} /></Field>
        <Field T={T} label="Note"><TextField T={T} value={note} onChange={setNote} placeholder="optional" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

// ── Customer groups manager (price calculation %) ───────────────────
function GroupManager({ T, groups, onClose, onChange, toast }: { T: Theme; groups: any[]; onClose: () => void; onChange: () => void; toast: (m: string) => void }) {
  const [name, setName] = useStateC('');
  const [pct, setPct] = useStateC('');
  const [busy, setBusy] = useStateC(false);
  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try { await API.customerGroup.create({ name, amount: Number(pct || 0) }); setName(''); setPct(''); onChange(); toast('Group added'); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }
  async function del(g: any) { try { await API.customerGroup.remove(g.id); onChange(); toast('Group removed'); } catch (e: any) { toast(e.message); } }
  return (
    <Modal T={T} title="Customer Groups" subtitle="Price calculation by customer type" width={520} onClose={onClose} footer={null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {groups.map((g: any) => (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>{g.name}</span>
            <Badge T={T} tone={g.amount < 0 ? 'green' : g.amount > 0 ? 'amber' : 'gray'}>{g.amount > 0 ? '+' : ''}{g.amount}% on price</Badge>
            <button onClick={() => del(g)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Group name</div><TextField T={T} value={name} onChange={setName} placeholder="e.g. Wholesale" /></div>
        <div style={{ width: 120 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Calc %</div><TextField T={T} type="number" value={pct} onChange={setPct} placeholder="-20" /></div>
        <Btn T={T} kind="accent" onClick={add} disabled={busy}>Add</Btn>
      </div>
      <div style={{ fontSize: 11, color: T.inkMute, marginTop: 12, lineHeight: 1.5 }}>A negative % discounts the selling price for that group (e.g. −20% → a $200 item sells at $160). Applied silently at the till — no separate line on the invoice.</div>
    </Modal>
  );
}

function miniBtn(T: Theme, kind?: string): React.CSSProperties {
  const accent = kind === 'accent';
  return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${accent ? T.accent.base : T.line}`, background: accent ? T.accent.base : T.paper, color: accent ? T.accent.on : T.inkMid };
}

// ── File-local stat helpers (mirrors prototype StatStrip / MiniStat) ─
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

function MiniStat({ T, label, value, tone }: { T: Theme; label: string; value: any; tone?: string }) {
  return (
    <div style={{ background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r, padding: '11px 13px' }}>
      <div style={{ fontSize: 10, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: tone || T.ink, fontFamily: T.fMono, marginTop: 4, letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  );
}
