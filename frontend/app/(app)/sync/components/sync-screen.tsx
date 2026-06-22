'use client';
// ═══════════════════════════════════════════════════════════════════
//  Offline Sync — operator visibility into the offline-first fleet:
//  which tills sold offline and when each last reached the server.
//  Full-stack: typed live client + i18n (EN/SO/AR) + RTL.
// ═══════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { useT } from '@/lib/locale-context';
import { Topbar } from '@/components/shell';
import { Panel, StatCard, Btn } from '@/components/kit';

interface SyncDevice {
  device_id: string; label?: string | null; user_id?: string | null;
  last_push_at?: string | null; last_pull_at?: string | null; pushed_ops?: number;
}

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

export function SyncScreen({ T }: { T: any }) {
  const t = useT();
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await API.sync.devices();
      setDevices((r.devices as SyncDevice[]) || []);
    } catch (e: any) {
      setErr(e?.message || t('sync.live_required'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const totalOps = devices.reduce((s, d) => s + (d.pushed_ops || 0), 0);

  return (
    <div>
      <Topbar
        T={T}
        title={t('sync.title')}
        subtitle={t('sync.subtitle')}
        right={<Btn T={T} kind="ghost" onClick={load} disabled={loading}>{t('common.refresh')}</Btn>}
      />
      <div style={{ padding: 24, maxWidth: 960, display: 'grid', gap: 16 }}>
        {err && devices.length === 0 && <Panel T={T}><div style={{ color: T.inkSub, fontSize: 13 }}>{err}</div></Panel>}
        {loading && devices.length === 0 && !err && <Panel T={T}><div style={{ color: T.inkSub, fontSize: 13 }}>{t('common.loading')}</div></Panel>}

        {(devices.length > 0 || (!loading && !err)) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <StatCard T={T} label={t('sync.devices')} value={String(devices.length)} accent={T.accent.base} />
            <StatCard T={T} label={t('sync.total_synced')} value={String(totalOps)} big />
          </div>
        )}

        <Panel T={T} title={t('sync.devices')}>
          {devices.length === 0 && !loading && <div style={{ color: T.inkSub, fontSize: 13 }}>{t('sync.no_devices')}</div>}
          {devices.map((d) => (
            <div key={d.device_id} style={{ padding: '11px 0', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontFamily: T.fMono, color: T.ink, fontSize: 13 }}>{d.label || d.device_id}</span>
                <span style={{ fontSize: 12, color: T.inkSub }}>{d.pushed_ops || 0} {t('sync.pushed_ops')}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: T.inkSub }}>
                <span>{t('sync.last_push')}: {when(d.last_push_at)}</span>
                <span>{t('sync.last_pull')}: {when(d.last_pull_at)}</span>
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
