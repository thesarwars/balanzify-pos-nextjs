'use client';
// ─────────────────────────────────────────────────────────────────
// Contact profile — the full supplier view: Ledger (4 formats +
// AP aging), Purchases, Stock Report, Documents & Notes, Payments,
// Activities, and Add Discount. Ledger / purchases / stock / payments
// are live; notes, activities and discounts are designed and will be
// connected when their backend models land.
// Reached as /contact-view?id=<id>&type=supplier[&tab=...]
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { useRouter } from 'next/navigation';
import type { Theme } from '@/lib/theme';
import { money } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useSession } from '@/components/shell';
import { API } from '@/lib/api';

const TABS = [
  ['ledger', '▤ Ledger'], ['purchases', '◨ Purchases'], ['stock', '◱ Stock Report'],
  ['docs', '◎ Documents & Note'], ['payments', '▭ Payments'], ['activities', '↻ Activities'],
] as const;

const yearStart = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
const yearEnd = () => new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10);
const fmtDate = (d: any) => (d ? String(d).slice(0, 10) : '');

export function ContactView({ T }: { T: Theme }) {
  const router = useRouter();
  const session = useSession();
  const [id, setId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState('ledger');
  const [contacts, setContacts] = React.useState<any[]>([]);
  const [contact, setContact] = React.useState<any>(null);
  const [locs, setLocs] = React.useState<any[]>([]);
  const [toast, toastNode] = useToast();

  // ledger state
  const [from, setFrom] = React.useState(yearStart());
  const [to, setTo] = React.useState(yearEnd());
  const [locId, setLocId] = React.useState('');
  const [format, setFormat] = React.useState(1);
  const [ledger, setLedger] = React.useState<any>(null);
  // purchases / stock
  const [orders, setOrders] = React.useState<any[]>([]);
  const [stockRows, setStockRows] = React.useState<any[]>([]);
  // designed modals
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [discountOpen, setDiscountOpen] = React.useState(false);

  React.useEffect(() => {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const cid = q.get('id');
    const t = q.get('tab');
    if (t && TABS.some(([k]) => k === t)) setTab(t);
    setId(cid);
    API.contact.list({ type: 'supplier' }).then((cs: any) => {
      setContacts(cs || []);
      if (cid) setContact((cs || []).find((c: any) => c.id === cid) || null);
    }).catch(() => {});
    API.location.list().then((ls: any) => setLocs(ls || [])).catch(() => {});
  }, []);

  const reloadLedger = React.useCallback((cid: string, f: string, t: string, loc: string) => {
    API.contact.supplierLedger(cid, { from: f, to: t, ...(loc ? { location_id: loc } : {}) }).then(setLedger).catch(() => setLedger(null));
  }, []);
  React.useEffect(() => { if (id) reloadLedger(id, from, to, locId); }, [id, from, to, locId, reloadLedger]);
  React.useEffect(() => {
    if (!id) return;
    API.purchaseOrder.list().then((os: any) => setOrders((os || []).filter((o: any) => String(o.supplier_id) === String(id)))).catch(() => {});
    API.contact.supplierStockReport(id).then((r: any) => setStockRows((r && r.rows) || [])).catch(() => {});
  }, [id]);

  const switchContact = (cid: string) => { setId(cid); setContact(contacts.find((c: any) => c.id === cid) || null); router.replace('/contact-view?id=' + cid + '&type=supplier&tab=' + tab, { scroll: false }); };
  const switchTab = (t: string) => { setTab(t); router.replace('/contact-view?id=' + id + '&type=supplier&tab=' + t, { scroll: false }); };

  const sum = ledger?.summary || {};
  const entries = ledger?.entries || [];
  const aging = ledger?.aging || { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
  const payments = entries.filter((e: any) => e.type === 'payment');
  const bizName = (session && (session as any).business_name) || 'Business';

  const th = (label: string, right = false) => <th key={label} style={{ textAlign: right ? 'right' : 'left', padding: '9px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{label}</th>;
  const td = (v: any, right = false, mono = false, key?: any) => <td key={key} style={{ padding: '9px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink, textAlign: right ? 'right' : 'left', fontFamily: mono ? T.fMono : T.fBody } as React.CSSProperties}>{v}</td>;
  const typeLabel: any = { opening_balance: 'Opening Balance', purchase: 'Purchase', payment: 'Payment' };

  const summaryCard = (title = 'Account Summary') => (
    <div style={{ minWidth: 280, flex: 1 }}>
      <div style={{ background: T.accent.base, color: T.accent.on, padding: '8px 14px', borderRadius: `${T.r}px ${T.r}px 0 0`, fontSize: 13.5, fontWeight: 700 }}>{title}</div>
      <div style={{ border: `1px solid ${T.line}`, borderTop: 'none', borderRadius: `0 0 ${T.r}px ${T.r}px`, padding: '6px 14px', background: T.paper }}>
        {[['Opening Balance', sum.opening_balance], ['Total Purchase', sum.total_purchase], ['Total Paid', sum.total_paid], ['Advance Balance', sum.advance_balance], ['Balance Due', sum.balance_due]].map(([k, v]: any, i, arr) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < arr.length - 1 ? `1px solid ${T.line}` : 'none', fontSize: 12.5, fontWeight: k === 'Balance Due' ? 700 : 500 }}>
            <span style={{ color: k === 'Balance Due' ? T.ink : T.inkSub }}>{k}</span><span style={{ fontFamily: T.fMono }}>{money(v || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const bizBlock = (
    <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
      <div style={{ fontWeight: 700, color: T.ink }}>{bizName}</div>
      <div style={{ color: T.inkSub }}>{(locs[0] && locs[0].landmark) || ''}</div>
    </div>
  );
  const toBlock = (
    <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub, marginBottom: 3 }}>To</div>
      <div style={{ fontWeight: 700, color: T.ink }}>{contact?.name}</div>
      {contact?.address && <div style={{ color: T.inkSub }}>{contact.address}</div>}
      {contact?.mobile && <div style={{ color: T.inkSub }}>Mobile: {contact.mobile}</div>}
      {contact?.tax_number && <div style={{ color: T.inkSub }}>Tax number: {contact.tax_number}</div>}
    </div>
  );

  const agingStrip = (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Aging Report</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
        {[['Current', aging.current, T.ink], ['1–30 days past due', aging.d1_30, T.greenText], ['30–60 days past due', aging.d31_60, T.amberText], ['60–90 days past due', aging.d61_90, '#c2703e'], ['Over 90 days past due', aging.d90_plus, T.redText], ['Amount due', aging.total, T.ink]].map(([lbl, v, col]: any) => (
          <div key={lbl} style={{ padding: '10px 12px', borderRight: `1px solid ${T.line}`, background: T.paper }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: col, marginBottom: 5 }}>{lbl}</div>
            <div style={{ fontFamily: T.fMono, fontSize: 14, color: col }}>{money(v || 0)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const ledgerTable = (cols: 'simple' | 'full') => (
    <div style={{ overflowX: 'auto', marginTop: 14 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          {th('Date')}{th('Type')}{cols === 'full' && th('Reference No')}{cols === 'full' && th('Location')}{cols === 'full' && th('Payment Method')}
          {th('Debit', true)}{th('Credit', true)}{th('Balance', true)}
        </tr></thead>
        <tbody>
          {entries.map((e: any, i: number) => (
            <tr key={i}>
              {td(fmtDate(e.date), false, true, 'd')}
              {td(typeLabel[e.type] || e.type, false, false, 't')}
              {cols === 'full' && td(e.reference || '—', false, true, 'r')}
              {cols === 'full' && td(e.location || '—', false, false, 'l')}
              {cols === 'full' && td(e.method || '—', false, false, 'm')}
              {td(e.debit ? money(e.debit) : '', true, true, 'db')}
              {td(e.credit ? money(e.credit) : '', true, true, 'cr')}
              {td(money(e.balance || 0), true, true, 'b')}
            </tr>
          ))}
          {!entries.length && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>No entries in this range.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  const csvExport = () => {
    const head = 'Date,Reference,Location,Status,Payment status,Grand total,Payment due\n';
    const rows = orders.map((o: any) => [o.date, o.ref_no, o.location_name, o.status, o.payment_status, o.grand_total, o.due].join(',')).join('\n');
    const blob = new Blob([head + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'purchases.csv'; a.click();
  };

  if (!contact) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Contact profile" subtitle="Supplier ledger, purchases & documents" right={<Btn T={T} kind="ghost" onClick={() => router.push('/suppliers')}>← Suppliers</Btn>} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkSub, fontSize: 13 }}>Loading contact…</div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title={contact.name} subtitle={`${contact.contact_id} · supplier`}
        right={<>
          <div style={{ width: 240 }}>
            <SelectField T={T} value={id || ''} options={contacts.map((c: any) => c.id)} onChange={switchContact} render={(v: any) => { const c = contacts.find((x: any) => x.id === v) || {}; return `${c.name || ''} (${c.contact_id || ''})`; }} />
          </div>
          <Btn T={T} kind="ghost" onClick={() => setDiscountOpen(true)}>+ Add Discount</Btn>
          <Btn T={T} kind="ghost" onClick={() => router.push('/suppliers')}>← Suppliers</Btn>
        </>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>

          {/* identity + stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, marginBottom: 16 }}>
            {[['Total purchase', sum.total_purchase, null], ['Balance due', sum.balance_due, (sum.balance_due || 0) > 0 ? T.amberText : T.greenText], ['Opening balance', sum.opening_balance, null], ['Total paid', sum.total_paid, T.greenText]].map(([lbl, v, tone]: any) => (
              <div key={lbl} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '13px 16px', boxShadow: T.sh1 }}>
                <div style={{ fontSize: 10, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 } as React.CSSProperties}>{lbl}</div>
                <div style={{ fontFamily: T.fMono, fontSize: 20, color: tone || T.ink, marginTop: 5 }}>{money(v || 0)}</div>
              </div>
            ))}
          </div>

          {/* tabs */}
          <div style={{ display: 'flex', gap: 2, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, padding: 4, width: 'fit-content', maxWidth: '100%', overflowX: 'auto', marginBottom: 16 }}>
            {TABS.map(([k, lbl]) => (
              <button key={k} onClick={() => switchTab(k)} style={{ padding: '8px 15px', borderRadius: 7, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: T.fBody, fontSize: 12.5, fontWeight: tab === k ? 700 : 500, background: tab === k ? T.accent.base : 'transparent', color: tab === k ? T.accent.on : T.inkMid }}>{lbl}</button>
            ))}
          </div>

          {/* ── LEDGER ── */}
          {tab === 'ledger' && (
            <Panel T={T}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 4 }}>From</div><TextField T={T} type="date" value={from} onChange={setFrom} /></div>
                <div><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 4 }}>To</div><TextField T={T} type="date" value={to} onChange={setTo} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.inkSub }}>Ledger format</span>
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} onClick={() => setFormat(n)} style={{ padding: '7px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 700, background: format === n ? T.accent.soft : T.paper, border: `1.5px solid ${format === n ? T.accent.base : T.line}`, color: format === n ? T.accent.text : T.inkMid }}>Format {n}</button>
                  ))}
                </div>
                <div style={{ minWidth: 180 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 4 }}>Business location</div>
                  <SelectField T={T} value={locId} options={['', ...locs.map((l: any) => String(l.id))]} onChange={setLocId} render={(v: any) => (v ? ((locs.find((l: any) => String(l.id) === v) || {}).name || v) : 'All locations')} />
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <Btn T={T} kind="ghost" onClick={() => window.print()} title="Print / save as PDF">⎙ PDF</Btn>
                  <Btn T={T} kind="ghost" onClick={() => toast('Email statements connect once outbound email is configured.')} title="Email statement">✉</Btn>
                </div>
              </div>

              {/* format layouts */}
              {format === 1 && (<>
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>{bizBlock}{summaryCard()}</div>
                {ledgerTable('simple')}
              </>)}
              {format === 2 && (<>
                <div style={{ display: 'flex', gap: 24, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div>{bizBlock}<div style={{ height: 12 }} />{toBlock}</div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>Statement</div><div style={{ fontSize: 12, color: T.inkSub, marginTop: 3 }}>{from} to {to}</div></div>
                </div>
                {ledgerTable('simple')}
              </>)}
              {format === 3 && (<>
                <div style={{ display: 'flex', gap: 24, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>{toBlock}</div>
                  <div style={{ textAlign: 'right' }}>{bizBlock}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>{summaryCard()}</div>
                {ledgerTable('full')}
              </>)}
              {format === 4 && (<>
                <div style={{ display: 'flex', gap: 24, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {bizBlock}
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5, color: T.ink }}>PARTNER LEDGER</div>
                  <div style={{ textAlign: 'right', fontSize: 12.5, lineHeight: 1.55 }}>
                    <div style={{ fontFamily: T.fMono, color: T.inkSub }}>{contact.contact_id}</div>
                    <div style={{ fontWeight: 700, color: T.ink }}>{contact.name}</div>
                    {contact.mobile && <div style={{ color: T.inkSub }}>Mobile: {contact.mobile}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>{summaryCard()}</div>
                <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: T.inkMid, marginTop: 14 }}>Showing all invoices and payments between {from} and {to}</div>
                {ledgerTable('full')}
              </>)}
              {agingStrip}
            </Panel>
          )}

          {/* ── PURCHASES ── */}
          {tab === 'purchases' && (
            <Panel T={T} pad={false}>
              <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
                <Btn T={T} kind="ghost" onClick={csvExport}>⤓ Export CSV</Btn>
                <Btn T={T} kind="ghost" onClick={() => window.print()}>⎙ Print</Btn>
                <Btn T={T} kind="ghost" onClick={() => toast('Excel & PDF exports are on the way.')}>⤓ Excel / PDF</Btn>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{th('Date')}{th('Reference No')}{th('Location')}{th('Purchase status')}{th('Payment status')}{th('Grand total', true)}{th('Payment due', true)}</tr></thead>
                  <tbody>
                    {orders.map((o: any) => (
                      <tr key={o.id}>
                        {td(o.date, false, true, 'd')}{td(o.ref_no, false, true, 'r')}{td(o.location_name, false, false, 'l')}
                        {td(<Badge T={T} tone={o.status === 'received' ? 'green' : 'gray'}>{o.status}</Badge>, false, false, 's')}
                        {td(<Badge T={T} tone={o.payment_status === 'paid' ? 'green' : o.payment_status === 'partial' ? 'amber' : 'red'}>{o.payment_status}</Badge>, false, false, 'p')}
                        {td(money(o.grand_total), true, true, 'g')}{td(o.due > 0 ? money(o.due) : '—', true, true, 'due')}
                      </tr>
                    ))}
                    {!orders.length && <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>No purchases from this supplier yet.</td></tr>}
                  </tbody>
                  {orders.length > 0 && (
                    <tfoot><tr style={{ background: T.paperAlt }}>
                      {td(<b>Total</b>, false, false, 't')}{td('', false, false, 'a')}{td('', false, false, 'b')}{td('', false, false, 'c')}{td('', false, false, 'e')}
                      {td(<b>{money(orders.reduce((s: number, o: any) => s + (o.grand_total || 0), 0))}</b>, true, true, 'g')}
                      {td(<b>{money(orders.reduce((s: number, o: any) => s + (o.due || 0), 0))}</b>, true, true, 'd')}
                    </tr></tfoot>
                  )}
                </table>
              </div>
            </Panel>
          )}

          {/* ── STOCK REPORT ── */}
          {tab === 'stock' && (
            <Panel T={T} pad={false}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{th('Product')}{th('SKU')}{th('Purchase quantity', true)}{th('Total sold', true)}{th('Total transferred', true)}{th('Total returned', true)}{th('Current stock', true)}{th('Current stock value', true)}</tr></thead>
                  <tbody>
                    {stockRows.map((r: any) => (
                      <tr key={r.product_id}>
                        {td(r.product, false, false, 'p')}{td(r.sku, false, true, 's')}{td(r.purchase_quantity, true, true, 'q')}
                        {td(r.total_sold == null ? '—' : r.total_sold, true, true, 'so')}
                        {td(r.total_transferred == null ? '—' : r.total_transferred, true, true, 'tr')}
                        {td(r.total_returned == null ? '—' : r.total_returned, true, true, 're')}
                        {td(r.current_stock, true, true, 'c')}{td(money(r.current_stock_value), true, true, 'v')}
                      </tr>
                    ))}
                    {!stockRows.length && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>Nothing supplied yet.</td></tr>}
                  </tbody>
                </table>
              </div>
              {stockRows.length > 0 && <div style={{ padding: '9px 16px', fontSize: 11, color: T.inkMute }}>Sold / transferred / returned per supplier connect once per-supplier movement tracking lands.</div>}
            </Panel>
          )}

          {/* ── DOCUMENTS & NOTE (designed — model pending) ── */}
          {tab === 'docs' && (
            <Panel T={T} pad={false}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', borderBottom: `1px solid ${T.line}` }}>
                <Btn T={T} kind="accent" onClick={() => setNoteOpen(true)}>+ Add</Btn>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{th('Heading')}{th('Added by')}{th('Created at')}{th('Updated at')}{th('', true)}</tr></thead>
                <tbody><tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>No documents or notes yet.</td></tr></tbody>
              </table>
            </Panel>
          )}

          {/* ── PAYMENTS ── */}
          {tab === 'payments' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{th('Paid on')}{th('Reference No')}{th('Amount', true)}{th('Payment method')}{th('Payment for')}</tr></thead>
                <tbody>
                  {payments.map((p: any, i: number) => (
                    <tr key={i}>{td(fmtDate(p.date), false, true, 'd')}{td(p.reference || '—', false, true, 'r')}{td(money(p.debit), true, true, 'a')}{td(p.method || '—', false, false, 'm')}{td('Purchase', false, false, 'f')}</tr>
                  ))}
                  {!payments.length && <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>No payments recorded in this range.</td></tr>}
                </tbody>
              </table>
            </Panel>
          )}

          {/* ── ACTIVITIES (designed — feed pending) ── */}
          {tab === 'activities' && (
            <Panel T={T} pad={false}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{th('Date')}{th('Action')}{th('By')}{th('Note')}</tr></thead>
                <tbody><tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>Activity history connects to the audit log soon.</td></tr></tbody>
              </table>
            </Panel>
          )}
        </div>
      </div>

      {/* Add Note — designed; saves once the note model lands */}
      {noteOpen && (
        <Modal T={T} title="Add note" subtitle="Attach documents & notes to this contact" width={560} onClose={() => setNoteOpen(false)}
          footer={<><div style={{ flex: 1, fontSize: 11.5, color: T.inkMute }}>Saving connects when the notes model lands.</div><Btn T={T} kind="ghost" onClick={() => setNoteOpen(false)}>Close</Btn><Btn T={T} kind="accent" onClick={() => { setNoteOpen(false); toast('Notes storage is on the way — nothing saved yet.'); }}>Save</Btn></>}>
          <FormGrid>
            <Field T={T} label="Heading" full><TextField T={T} value={''} onChange={() => {}} placeholder="Note heading" /></Field>
            <Field T={T} label="Description" full>
              <textarea rows={4} placeholder="Write the note…" style={{ width: '100%', padding: '10px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </Field>
            <Field T={T} label="Documents" full>
              <div style={{ border: `1.5px dashed ${T.line}`, borderRadius: T.r, padding: '26px 16px', textAlign: 'center', fontSize: 12.5, color: T.inkSub }}>Drop files here or click to upload</div>
            </Field>
          </FormGrid>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: T.inkMid, cursor: 'pointer', marginTop: 12 }}>
            <input type="checkbox" style={{ accentColor: T.accent.base }} />Is private? <span style={{ color: T.inkSub }}>(only visible to you)</span>
          </label>
        </Modal>
      )}

      {/* Add Discount — designed; posts once supplier discounts land */}
      {discountOpen && (
        <Modal T={T} title="Add discount" subtitle={contact.name} width={440} onClose={() => setDiscountOpen(false)}
          footer={<><div style={{ flex: 1, fontSize: 11.5, color: T.inkMute }}>Connects when supplier discounts land.</div><Btn T={T} kind="ghost" onClick={() => setDiscountOpen(false)}>Close</Btn><Btn T={T} kind="accent" onClick={() => { setDiscountOpen(false); toast('Supplier discounts are on the way — nothing saved yet.'); }}>Submit</Btn></>}>
          <FormGrid>
            <Field T={T} label="Date" full><TextField T={T} type="date" value={new Date().toISOString().slice(0, 10)} onChange={() => {}} /></Field>
            <Field T={T} label="Amount" full><TextField T={T} type="number" value={''} onChange={() => {}} placeholder="0.00" /></Field>
            <Field T={T} label="Note" full>
              <textarea rows={3} placeholder="Optional note" style={{ width: '100%', padding: '10px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </Field>
          </FormGrid>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
