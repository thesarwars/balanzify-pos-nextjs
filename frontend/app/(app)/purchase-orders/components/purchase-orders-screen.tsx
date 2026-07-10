'use client';
// ─────────────────────────────────────────────────────────────────
// Purchases & Opening Stock — the manual's two stock-in routes.
// A purchase from a supplier adds stock and raises the supplier
// liability; opening stock seeds a product's starting quantity.
//
// This file is just the list screen + row-action orchestration; each
// modal lives in its own module alongside it.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { formatDate } from '@/lib/business-settings';
import { ActionsMenu } from '../../products/components/list-table';
import { ConfirmModal, StatStrip } from './bits';
import { PurchaseEditor } from './purchase-editor';
import { PurchaseView, printPurchase } from './purchase-view';
import { AddPaymentModal, PaymentsModal, UpdateStatusModal, PurchaseLabels } from './purchase-modals';
import { PurchaseReturnModal } from './purchase-return';
import { OpeningStock } from './opening-stock';

const { useState: useStatePu, useEffect: useEffectPu } = React;

export function Purchases({ T }: { T: any }) {
  const [rows, setRows] = useStatePu<any[]>([]);
  const [loading, setLoading] = useStatePu(true);
  const [suppliers, setSuppliers] = useStatePu<any[]>([]);
  const [locs, setLocs] = useStatePu<any[]>([]);
  const [edit, setEdit] = useStatePu(false);
  const [editing, setEditing] = useStatePu<any>(null);   // an existing purchase being edited
  const [opening, setOpening] = useStatePu(false);
  const [view, setView] = useStatePu<any>(null);
  const [openMenu, setOpenMenu] = useStatePu<any>(null); // row whose Actions menu is open
  const [payFor, setPayFor] = useStatePu<any>(null);     // add-payment modal target
  const [paymentsFor, setPaymentsFor] = useStatePu<any>(null);
  const [statusFor, setStatusFor] = useStatePu<any>(null);
  const [returnFor, setReturnFor] = useStatePu<any>(null);
  const [labelsFor, setLabelsFor] = useStatePu<any>(null);
  const [notifyFor, setNotifyFor] = useStatePu<any>(null);
  const [delFor, setDelFor] = useStatePu<any>(null);
  const [show, node] = useToast();
  // Deep link: /purchase-orders?new=1 opens the Add Purchase editor (nav shortcut).
  const router = useRouter();
  const search = useSearchParams();
  useEffectPu(() => {
    if (search.get('new') === '1') { setEdit(true); router.replace('/purchase-orders'); }
  }, [search, router]);

  const openFull = React.useCallback((id: any, cb: (p: any) => void) => { API.purchaseOrder.get(id).then(cb).catch(() => show('Could not load the purchase.')); }, [show]);
  const isReceivedRow = (p: any) => ['received', 'partial', 'approved'].includes(p.status);
  const actionsFor = (p: any) => {
    const received = isReceivedRow(p);
    const items: any[] = [
      { label: '◉ View', on: () => setView(p) },
      { label: '⎙ Print', on: () => openFull(p.id, (full: any) => printPurchase(full)) },
      { label: '✎ Edit', on: () => openFull(p.id, (full: any) => setEditing(full)) },
      { sep: true },
      { label: '＋ Add payment', on: () => setPayFor(p) },
      { label: '◍ View payments', on: () => setPaymentsFor(p) },
      { label: '▥ Labels', on: () => openFull(p.id, (full: any) => setLabelsFor(full)) },
      { sep: true },
      { label: '↻ Update status', on: () => setStatusFor(p) },
    ];
    if (received) items.push({ label: '↩ Purchase return', on: () => openFull(p.id, (full: any) => setReturnFor(full)) });
    if (received) items.push({ label: '✉ Items received notification', on: () => setNotifyFor(p) });
    if (!received) items.push({ label: '🗑 Delete', on: () => setDelFor(p), danger: true });
    return items;
  };
  async function doDelete(p: any) {
    try { await API.purchaseOrder.remove(p.id); setDelFor(null); show('Purchase cancelled'); reload(); }
    catch (e: any) { show(e.message || 'Could not cancel the purchase.'); }
  }
  async function doNotify(p: any) {
    try { const r: any = await API.purchaseOrder.notifyReceived(p.id); setNotifyFor(null); show((r && r.message) || 'Notification sent'); }
    catch (e: any) { setNotifyFor(null); show(e.message || 'Could not send the notification.'); }
  }

  const reload = React.useCallback(() => {
    setLoading(true);
    API.purchaseOrder.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffectPu(() => { reload(); }, [reload]);
  useEffectPu(() => {
    API.contact.list({ type: 'supplier' }).then(setSuppliers).catch(() => {});
    API.location.list().then(setLocs).catch(() => {});
  }, []);

  const totalSpend = rows.reduce((s: any, r: any) => s + (r.grand_total || 0), 0);
  const totalDue = rows.reduce((s: any, r: any) => s + (r.due || 0), 0);
  const tone: any = { paid: 'green', partial: 'amber', due: 'red' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Purchases" subtitle={`${rows.length} purchase orders`}
        right={<>
          <Btn T={T} kind="ghost" onClick={() => setOpening(true)}>◱ Opening Stock</Btn>
          <Btn T={T} kind="accent" onClick={() => setEdit(true)}>+ Add Purchase</Btn>
        </>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <StatStrip T={T} stats={[['Purchase orders', rows.length], ['Total spend', money0(totalSpend)], ['Outstanding to suppliers', money0(totalDue)]]} />
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[['Actions', 'l'], ['Reference', 'l'], ['Supplier', 'l'], ['Location', 'l'], ['Items', 'r'], ['Total', 'r'], ['Due', 'r'], ['Payment', 'r'], ['Date', 'r']].map(([h, a]: any, i: number) => (
                <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((p: any) => (
                  <tr key={p.id} onClick={() => setView(p)} style={{ cursor: 'pointer', transition: 'background .12s' }} onMouseEnter={(e: any) => e.currentTarget.style.background = T.paperAlt} onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}>
                    <td onClick={(e: any) => e.stopPropagation()} style={{ padding: '10px 18px', borderBottom: `1px solid ${T.line}` }}>
                      <ActionsMenu T={T} open={openMenu === p.id} onToggle={() => setOpenMenu((m: any) => m === p.id ? null : p.id)} items={actionsFor(p)} />
                    </td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.accent.text }}>{p.ref_no}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: T.ink, fontWeight: 600 }}>{p.supplier_name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{p.location_name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>{p.item_count}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink } as React.CSSProperties}>{money(p.grand_total)}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: p.due > 0 ? T.amberText : T.inkMute } as React.CSSProperties}>{p.due > 0 ? money(p.due) : '—'}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}><Badge T={T} tone={tone[p.payment_status]}>{p.payment_status}</Badge></td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontSize: 12, color: T.inkSub } as React.CSSProperties}>{formatDate(p.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>GET /connector/api/purchase…</div>}
            {!loading && rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>No purchases yet.</div>}
          </Panel>
        </div>
      </div>

      {edit && <PurchaseEditor T={T} suppliers={suppliers} locs={locs} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); show('Purchase recorded · stock updated'); reload(); }} />}
      {editing && <PurchaseEditor T={T} suppliers={suppliers} locs={locs} existing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); show('Purchase updated'); reload(); }} />}
      {opening && <OpeningStock T={T} onClose={() => setOpening(false)} toast={show} />}
      {view && <PurchaseView T={T} purchase={view} onClose={() => setView(null)} onEdit={(full: any) => { setView(null); setEditing(full); }} />}
      {payFor && <AddPaymentModal T={T} purchase={payFor} onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); show('Payment recorded'); reload(); }} />}
      {paymentsFor && <PaymentsModal T={T} purchase={paymentsFor} onClose={() => setPaymentsFor(null)} onAddPayment={() => { const p = paymentsFor; setPaymentsFor(null); setPayFor(p); }} />}
      {statusFor && <UpdateStatusModal T={T} purchase={statusFor} onClose={() => setStatusFor(null)} onSaved={(msg?: string) => { setStatusFor(null); show(msg || 'Status updated'); reload(); }} />}
      {returnFor && <PurchaseReturnModal T={T} purchase={returnFor} onClose={() => setReturnFor(null)} onSaved={() => { setReturnFor(null); show('Purchase return recorded · stock updated'); reload(); }} />}
      {labelsFor && <PurchaseLabels T={T} purchase={labelsFor} onClose={() => setLabelsFor(null)} />}
      {notifyFor && <ConfirmModal T={T} title="Items received notification" confirmKind="accent"
        body={`Email ${notifyFor.supplier_name} a confirmation of the items received on ${notifyFor.ref_no}?`}
        confirmLabel="Send notification" onConfirm={() => doNotify(notifyFor)} onClose={() => setNotifyFor(null)} />}
      {delFor && <ConfirmModal T={T} title="Cancel purchase?" body={`This cancels purchase ${delFor.ref_no}. This can't be undone.`} confirmLabel="Cancel purchase" onConfirm={() => doDelete(delFor)} onClose={() => setDelFor(null)} />}
      {node}
    </div>
  );
}
