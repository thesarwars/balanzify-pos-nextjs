'use client';
// ═══════════════════════════════════════════════════════════════════
//  Fiscalization — the compliance loop, surfaced. Device status, the
//  offline "pending transmission" queue (sign locally, transmit when
//  online), and the public authenticity check. Full-stack: typed live
//  client + i18n (EN/SO/AR) + RTL.
// ═══════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { API, type FiscalReceipt } from '@/lib/api';
import { useT } from '@/lib/locale-context';
import { Topbar } from '@/components/shell';
import { Panel, StatCard, Btn, Badge, TextField } from '@/components/kit';

function Row({ T, label, value }: { T: any; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13 }}>
      <span style={{ color: T.inkSub }}>{label}</span>
      <span style={{ color: T.ink, fontFamily: T.fMono }}>{value}</span>
    </div>
  );
}

export function FiscalScreen({ T }: { T: any }) {
  const t = useT();
  const [config, setConfig] = useState<any>(null);
  const [pending, setPending] = useState<FiscalReceipt[]>([]);
  const [err, setErr] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [cfg, pend] = await Promise.all([
        API.fiscal.config(),
        API.fiscal.pending().catch(() => ({ pending: 0, receipts: [] as FiscalReceipt[] })),
      ]);
      setConfig(cfg);
      setPending(pend.receipts || []);
    } catch (e: any) {
      setErr(e?.message || t('fiscal.live_required'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const transmit = async (saleId: string) => {
    try { await API.fiscal.transmit(saleId); await load(); } catch { /* surfaced on reload */ }
  };

  const runVerify = async () => {
    if (!code.trim()) return;
    setVerifyResult(await API.fiscal.verify(code.trim()));
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar
        T={T}
        title={t('fiscal.title')}
        subtitle={t('fiscal.subtitle')}
        right={<Btn T={T} kind="ghost" onClick={load} disabled={loading}>{t('common.refresh')}</Btn>}
      />
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 24, maxWidth: 960, display: 'grid', gap: 16 }}>
        {err && !config && <Panel T={T}><div style={{ color: T.inkSub, fontSize: 13 }}>{err}</div></Panel>}
        {loading && !config && <Panel T={T}><div style={{ color: T.inkSub, fontSize: 13 }}>{t('common.loading')}</div></Panel>}

        {config && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <StatCard
              T={T}
              label={t('fiscal.authority')}
              value={config.jurisdiction_name || config.jurisdiction || '—'}
              accent={config.enabled ? T.green : T.line}
            />
            <StatCard T={T} label={t('fiscal.device')} value={config.device_serial || '—'} />
            <StatCard T={T} label={t('fiscal.last_number')} value={`#${config.last_fiscal_number ?? 0}`}
              sub={config.enabled ? t('fiscal.enabled') : t('fiscal.disabled')} />
          </div>
        )}

        {config && (
          <Panel
            T={T}
            title={t('fiscal.pending')}
            action={<Badge T={T} tone={pending.length ? 'amber' : 'green'}>{pending.length}</Badge>}
          >
            {pending.length === 0 && <div style={{ color: T.inkSub, fontSize: 13 }}>{t('fiscal.none_pending')}</div>}
            {pending.map((r) => (
              <div key={r.sale_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${T.line}` }}>
                <div>
                  <div style={{ fontFamily: T.fMono, color: T.ink, fontSize: 13 }}>{r.invoice_label}</div>
                  <div style={{ fontSize: 11, color: T.inkSub }}>#{r.fiscal_number} · {String(r.signed_at).slice(0, 10)}</div>
                </div>
                <Btn T={T} kind="primary" onClick={() => transmit(r.sale_id)}>{t('fiscal.transmit')}</Btn>
              </div>
            ))}
          </Panel>
        )}

        <Panel T={T} title={t('fiscal.verify_title')}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: verifyResult ? 14 : 0 }}>
            <div style={{ flex: 1 }}>
              <TextField T={T} value={code} onChange={(v: string) => setCode(v)} placeholder={t('fiscal.code')} />
            </div>
            <Btn T={T} kind="accent" onClick={runVerify}>{t('fiscal.verify')}</Btn>
          </div>
          {verifyResult && (
            <div>
              <Badge T={T} tone={verifyResult.valid ? 'green' : 'red'}>{verifyResult.valid ? t('fiscal.valid') : t('fiscal.invalid')}</Badge>
              {verifyResult.valid && (
                <div style={{ marginTop: 10 }}>
                  <Row T={T} label={t('fiscal.receipt')} value={verifyResult.invoice_label} />
                  <Row T={T} label={t('common.total')} value={'$' + Number(verifyResult.total || 0).toFixed(2)} />
                  <Row T={T} label={t('fiscal.authority')} value={verifyResult.jurisdiction} />
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
