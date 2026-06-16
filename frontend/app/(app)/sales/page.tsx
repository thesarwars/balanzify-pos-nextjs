'use client';
// ─────────────────────────────────────────────────────────────────
// Sales history + sell-return modal (restock / points reversal via
// POST /connector/api/sell-return).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, methodTone } from '@/components/kit';
import { Topbar, useTheme } from '@/components/shell';
import { API } from '@/lib/api';
import { money, timeAgo } from '@/lib/theme';
import { SALES, PRODUCTS } from '@/lib/data';

const { useState: useStateM } = React;

export default function SalesPage() {
  const T = useTheme();
  return <Sales T={T} />;
}

function Sales({ T }: { T: Theme }) {
  const [f, setF] = useStateM('all');
  const [selSale, setSelSale] = useStateM<any>(null);
  const [tick, setTick] = useStateM(0);
  const filters = [['all', 'All'], ['completed', 'Completed'], ['held', 'Held'], ['refunded', 'Refunded']];
  const rows = f === 'all' ? SALES : SALES.filter((s: any) => s.status === f);
  const tone: any = { completed: 'green', held: 'amber', refunded: 'red' };
  const totalToday = SALES.filter((s: any) => s.status === 'completed').reduce((s: any, x: any) => s + x.total, 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Sales History" subtitle={`${SALES.length} transactions today · ${money(totalToday)} collected`}
        right={<><Btn T={T} kind="ghost">⤓ Export</Btn><Btn T={T} kind="ghost">📅 Today ▾</Btn></>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <Panel T={T} pad={false}>
            <div style={{ display: 'flex', gap: 4, padding: 10, borderBottom: `1px solid ${T.line}`, background: T.paperAlt }}>
              {filters.map(([k, lbl]) => (
                <button key={k} onClick={() => setF(k)} style={{
                  padding: '7px 15px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: T.fBody,
                  fontSize: 12.5, fontWeight: f === k ? 700 : 500,
                  background: f === k ? T.paper : 'transparent', color: f === k ? T.ink : T.inkSub,
                  boxShadow: f === k ? T.sh1 : 'none',
                }}>{lbl}</button>
              ))}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{([['Order', 'l'], ['Customer', 'l'], ['Cashier', 'l'], ['Items', 'r'], ['Payment', 'l'], ['Amount', 'r'], ['Time', 'r'], ['Status', 'r']] as any[]).map(([h, a]) => (
                <th key={h} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((s: any) => (
                  <tr key={s.id} onClick={() => setSelSale(s)} style={{ cursor: 'pointer', transition: 'background .12s' }}
                    onMouseEnter={(e: any) => e.currentTarget.style.background = T.paperAlt}
                    onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.accent.text }}>{s.id}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: s.customer === 'Walk-in' ? T.inkMute : T.ink }}>{s.customer}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{s.cashier}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{s.items}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={methodTone(s.method)}>{s.methodLabel}</Badge></td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{money(s.total)}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontSize: 12, color: T.inkSub }}>{timeAgo(s.minsAgo)}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}><Badge T={T} tone={tone[s.status]}>{s.status[0].toUpperCase() + s.status.slice(1)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
      {selSale && <SellReturnModal T={T} sale={selSale} onClose={() => setSelSale(null)} onDone={() => { setSelSale(null); setTick((t: any) => t + 1); }} />}
    </div>
  );
}

// ── Sell Return  →  POST /connector/api/sell-return ─────────────────
function SellReturnModal({ T, sale, onClose, onDone }: { T: Theme; sale: any; onClose: () => void; onDone: () => void }) {
  const [loading, setLoading] = useStateM(true);
  const [lines, setLines] = useStateM<any[]>([]);
  const [ret, setRet] = useStateM<any>({});      // line_index -> qty to return
  const [busy, setBusy] = useStateM(false);
  const [err, setErr] = useStateM<any>(null);
  const apiSale = sale._txn && sale._id != null;

  React.useEffect(() => {
    if (!apiSale) { setLoading(false); return; }
    setLoading(true);
    API.sell.get(sale._id)
      .then((u: any) => {
        const ls = (u.sell_lines || []).map((ln: any, i: any) => {
          const p = PRODUCTS.find((p: any) => parseInt(String(p.id).replace(/\D/g, ''), 10) === ln.product_id);
          return { i, name: ln.product_name || (p ? p.name : 'Product #' + ln.product_id), qty: ln.quantity, returned: Number(ln.quantity_returned) || 0, unit_price: Number(ln.unit_price), sale_item_id: ln.sale_item_id, product_id: ln.product_id_real };
        });
        setLines(ls);
      })
      .catch((e: any) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [sale]);

  const setQty = (i: any, max: any, d: any) => setRet((r: any) => { const v = Math.max(0, Math.min(max, (r[i] || 0) + d)); return { ...r, [i]: v }; });
  const returnTotal = lines.reduce((s: any, l: any) => s + (ret[l.i] || 0) * l.unit_price, 0);
  const anyReturn = Object.values(ret).some((v: any) => v > 0);
  const alreadyReturned = sale.status === 'refunded';

  async function submit() {
    if (!anyReturn || busy) return;
    setBusy(true); setErr(null);
    try {
      await API.sellReturn.create({
        transaction_id: sale._id,
        products: lines.filter((l: any) => (ret[l.i] || 0) > 0).map((l: any) => ({ line_index: l.i, sale_item_id: l.sale_item_id, product_id: l.product_id, quantity: ret[l.i], unit_price: l.unit_price })),
      });
      onDone();
    } catch (e: any) { setErr(e.message || 'Return failed.'); }
    finally { setBusy(false); }
  }

  return (
    <Modal T={T} title={`Sale ${sale.id}`} subtitle={apiSale ? 'Select items to return' : 'Transaction detail'} width={460} onClose={onClose}
      footer={apiSale && !alreadyReturned ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <div style={{ flex: 1, fontSize: 13, color: T.inkSub }}>Refund total <b style={{ color: T.ink, fontFamily: T.fMono, marginLeft: 6 }}>{money(returnTotal)}</b></div>
          <Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn T={T} kind="danger" onClick={submit} disabled={!anyReturn || busy}>{busy ? 'Processing…' : 'Process return'}</Btn>
        </div>
      ) : null}>
      {loading && <div style={{ padding: '30px 10px', textAlign: 'center', color: T.inkSub, fontSize: 12.5, fontFamily: T.fMono }}>GET /connector/api/sell/{sale._id}…</div>}
      {!loading && !apiSale && (
        <div style={{ padding: '10px 2px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <MiniKV T={T} k="Customer" v={sale.customer} />
            <MiniKV T={T} k="Cashier" v={sale.cashier} />
            <MiniKV T={T} k="Payment" v={sale.methodLabel} />
            <MiniKV T={T} k="Total" v={money(sale.total)} mono />
          </div>
          <div style={{ padding: '12px 14px', borderRadius: T.r, background: T.accent.soft, color: T.accent.text, fontSize: 12.5, lineHeight: 1.55 }}>
            This is sample history. To try a live sell-return against the API, record a sale in <b>Point of Sale</b>, then reopen it here — its line items load from <span style={{ fontFamily: T.fMono }}>/connector/api/sell</span>.
          </div>
        </div>
      )}
      {!loading && apiSale && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alreadyReturned && <div style={{ padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 600 }}>This sale has already been returned.</div>}
          {lines.map((l: any) => {
            const max = l.qty - l.returned;
            return (
              <div key={l.i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: T.r, border: `1px solid ${T.line}`, background: T.paper }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{l.name}</div>
                  <div style={{ fontSize: 11.5, color: T.inkSub, fontFamily: T.fMono, marginTop: 1 }}>{money(l.unit_price)} × {l.qty}{l.returned ? ` · ${l.returned} returned` : ''}</div>
                </div>
                {!alreadyReturned && max > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setQty(l.i, max, -1)} style={rStep(T)}>−</button>
                    <span style={{ width: 22, textAlign: 'center', fontFamily: T.fMono, fontSize: 14, fontWeight: 600, color: T.ink }}>{ret[l.i] || 0}</span>
                    <button onClick={() => setQty(l.i, max, 1)} style={rStep(T)}>+</button>
                  </div>
                ) : <Badge T={T} tone="gray">{max <= 0 ? 'Returned' : '—'}</Badge>}
              </div>
            );
          })}
          {err && <div style={{ marginTop: 4, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
        </div>
      )}
    </Modal>
  );
}

function MiniKV({ T, k, v, mono }: any) {
  return <div><div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub, marginBottom: 3 }}>{k}</div><div style={{ fontSize: 14, fontWeight: 600, color: T.ink, fontFamily: mono ? T.fMono : T.fBody }}>{v}</div></div>;
}
function rStep(T: Theme): React.CSSProperties { return { width: 28, height: 28, borderRadius: 7, cursor: 'pointer', background: T.paperSink, border: `1px solid ${T.line}`, color: T.ink, fontSize: 16, fontWeight: 700, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fMono }; }
