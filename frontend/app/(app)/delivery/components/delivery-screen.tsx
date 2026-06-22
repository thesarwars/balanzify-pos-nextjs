'use client';
// ═══════════════════════════════════════════════════════════════════
//  Delivery dispatch board — drivers on the left, live orders on the
//  right. Auto-dispatch happens server-side; this is the operator's
//  view to assign, track and complete. Full-stack: typed live client +
//  i18n (EN/SO/AR) + RTL.
// ═══════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { API, type DeliveryDriver, type DeliveryOrder } from '@/lib/api';
import { useT } from '@/lib/locale-context';
import { Topbar } from '@/components/shell';
import { Panel, Btn, Badge } from '@/components/kit';

const money = (n: number) => '$' + Number(n || 0).toFixed(2);
const statusTone = (s: string): 'gray' | 'blue' | 'amber' | 'green' | 'red' =>
  s === 'delivered' ? 'green' : s === 'cancelled' ? 'red' : s === 'pending' ? 'amber' : 'blue';

export function DeliveryScreen({ T }: { T: any }) {
  const t = useT();
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [d, o] = await Promise.all([API.delivery.drivers(), API.delivery.orders()]);
      setDrivers(d.drivers || []);
      setOrders(o.deliveries || []);
    } catch (e: any) {
      setErr(e?.message || t('delivery.live_required'));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const driverTone = (s: string) => (s === 'available' ? 'green' : s === 'busy' ? 'amber' : 'gray');
  const driverLabel = (s: string) => t(s === 'available' ? 'delivery.available' : s === 'busy' ? 'delivery.busy' : 'delivery.offline');

  const act = async (fn: () => Promise<any>) => { try { await fn(); await load(); } catch { /* surfaced on reload */ } };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar
        T={T}
        title={t('delivery.title')}
        subtitle={t('delivery.subtitle')}
        right={<Btn T={T} kind="ghost" onClick={load} disabled={loading}>{t('common.refresh')}</Btn>}
      />
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 24, maxWidth: 1100 }}>
        {err && !drivers.length && !orders.length && <Panel T={T}><div style={{ color: T.inkSub, fontSize: 13 }}>{err}</div></Panel>}

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
          <Panel T={T} title={t('delivery.drivers')} action={<Badge T={T} tone="gray">{drivers.length}</Badge>}>
            {drivers.length === 0 && <div style={{ color: T.inkSub, fontSize: 13 }}>—</div>}
            {drivers.map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${T.line}` }}>
                <div>
                  <div style={{ color: T.ink, fontSize: 13 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: T.inkSub }}>{d.vehicle_type || ''}</div>
                </div>
                <button
                  onClick={() => act(() => API.delivery.setDriverStatus(d.id, d.status === 'available' ? 'offline' : 'available'))}
                  title={driverLabel(d.status)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  <Badge T={T} tone={driverTone(d.status)}>{driverLabel(d.status)}</Badge>
                </button>
              </div>
            ))}
          </Panel>

          <Panel T={T} title={t('delivery.orders')} action={<Badge T={T} tone="gray">{orders.length}</Badge>}>
            {orders.length === 0 && <div style={{ color: T.inkSub, fontSize: 13 }}>{t('delivery.no_orders')}</div>}
            {orders.map((o) => (
              <div key={o.id} style={{ padding: '11px 0', borderBottom: `1px solid ${T.line}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ color: T.ink, fontSize: 13, fontWeight: 600 }}>{o.customer_name}</span>
                  <Badge T={T} tone={statusTone(o.status)}>{o.status}</Badge>
                </div>
                <div style={{ fontSize: 12, color: T.inkSub, marginBottom: 6 }}>
                  {o.address} · {money(o.order_amount)} · {t('delivery.fee')} {money(o.delivery_fee)} · {o.channel}
                  {o.driver_name ? ` · ${o.driver_name}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {o.status === 'pending' && <Btn T={T} kind="soft" onClick={() => act(() => API.delivery.assign(o.id))}>{t('delivery.assign')}</Btn>}
                  {o.status === 'assigned' && <Btn T={T} kind="soft" onClick={() => act(() => API.delivery.setStatus(o.id, 'picked_up'))}>{t('delivery.picked_up')}</Btn>}
                  {(o.status === 'assigned' || o.status === 'picked_up') && <Btn T={T} kind="primary" onClick={() => act(() => API.delivery.setStatus(o.id, 'delivered'))}>{t('delivery.deliver')}</Btn>}
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
