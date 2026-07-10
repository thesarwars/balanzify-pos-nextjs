'use client';
// ─────────────────────────────────────────────────────────────────
// Sell return — send a sale's goods back in, per line.
//
// Posts to the refund endpoint, which restocks, reverses COGS and
// credits the tender. Quantities are capped at what has not already
// been returned; the server re-checks that cap against the original
// sale, so a stale screen cannot over-refund.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Badge, Modal } from '@/components/kit';
import { money } from '@/lib/theme';
import { API } from '@/lib/api';

const { useState, useEffect } = React;

function stepBtn(T: Theme): React.CSSProperties {
  return { width: 28, height: 28, borderRadius: 7, cursor: 'pointer', background: T.paperSink, border: `1px solid ${T.line}`, color: T.ink, fontSize: 16, fontWeight: 700, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fMono };
}

export function SellReturnModal({ T, sale, onClose, onDone }: { T: Theme; sale: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<any[]>([]);
  const [ret, setRet] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    API.sell.get(sale.id)
      .then((u: any) => setLines((u.sell_lines || []).map((ln: any, i: number) => ({
        i, name: ln.product_name || 'Product',
        qty: Number(ln.quantity) || 0,
        returned: Number(ln.quantity_returned) || 0,
        unit_price: Number(ln.unit_price) || 0,
        sale_item_id: ln.sale_item_id,
        product_id: ln.product_id_real,
      }))))
      .catch((e: any) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [sale.id]);

  const setQty = (i: number, max: number, d: number) =>
    setRet((r) => ({ ...r, [i]: Math.max(0, Math.min(max, (r[i] || 0) + d)) }));

  const returnTotal = lines.reduce((s, l) => s + (ret[l.i] || 0) * l.unit_price, 0);
  const anyReturn = Object.values(ret).some((v) => v > 0);
  const alreadyReturned = sale.status === 'refunded';

  async function submit() {
    if (!anyReturn || busy) return;
    setBusy(true); setErr(null);
    try {
      await API.sellReturn.create({
        transaction_id: sale.id,
        products: lines.filter((l) => (ret[l.i] || 0) > 0).map((l) => ({
          line_index: l.i, sale_item_id: l.sale_item_id, product_id: l.product_id,
          quantity: ret[l.i], unit_price: l.unit_price,
        })),
      });
      onDone(`Returned ${money(returnTotal)} · stock and ledger reversed`);
    } catch (e: any) { setErr(e.message || 'Return failed.'); setBusy(false); }
  }

  return (
    <Modal T={T} title={`Sell return · ${sale.invoice_no}`} subtitle={`${sale.customer_name} · choose what came back`} width={480} onClose={onClose}
      footer={!alreadyReturned ? (
        <>
          <div style={{ flex: 1, fontSize: 13, color: T.inkSub }}>Refund total <b style={{ color: T.ink, fontFamily: T.fMono, marginLeft: 6 }}>{money(returnTotal)}</b></div>
          <Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn T={T} kind="danger" onClick={submit} disabled={!anyReturn || busy}>{busy ? 'Processing…' : 'Process return'}</Btn>
        </>
      ) : null}>
      {loading && <div style={{ padding: '30px 10px', textAlign: 'center', color: T.inkSub, fontSize: 12.5, fontFamily: T.fMono }}>Loading lines…</div>}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alreadyReturned && <div style={{ padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 600 }}>This sale has already been returned.</div>}
          {lines.map((l) => {
            const max = l.qty - l.returned;
            return (
              <div key={l.i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: T.r, border: `1px solid ${T.line}`, background: T.paper }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{l.name}</div>
                  <div style={{ fontSize: 11.5, color: T.inkSub, fontFamily: T.fMono, marginTop: 1 }}>{money(l.unit_price)} × {l.qty}{l.returned ? ` · ${l.returned} already returned` : ''}</div>
                </div>
                {!alreadyReturned && max > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setQty(l.i, max, -1)} style={stepBtn(T)}>−</button>
                    <span style={{ width: 22, textAlign: 'center', fontFamily: T.fMono, fontSize: 14, fontWeight: 600, color: T.ink }}>{ret[l.i] || 0}</span>
                    <button onClick={() => setQty(l.i, max, 1)} style={stepBtn(T)}>+</button>
                  </div>
                ) : <Badge T={T} tone="gray">{max <= 0 ? 'Returned' : '—'}</Badge>}
              </div>
            );
          })}
          {!lines.length && <div style={{ padding: 24, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>This sale has no returnable lines.</div>}
          {err && <div style={{ marginTop: 4, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
        </div>
      )}
    </Modal>
  );
}
