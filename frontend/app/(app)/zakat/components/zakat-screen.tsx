'use client';
// ═══════════════════════════════════════════════════════════════════
//  Zakat — the first screen to exercise the full stack end-to-end:
//  the typed live-backend client (API.islamic.zakat), the i18n layer
//  (useT, EN/SO/AR), and RTL (driven globally by the LocaleProvider).
//  Reads the assessment straight from the general ledger.
// ═══════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { API, type ZakatAssessment } from '@/lib/api';
import { useT } from '@/lib/locale-context';
import { Topbar } from '@/components/shell';
import { Panel, StatCard, Btn, Badge } from '@/components/kit';
import { StateView, Skeleton, humanizeError } from '@/components/state-view';
import { money } from '@/lib/theme';

function Row({ T, label, value }: { T: any; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13 }}>
      <span style={{ color: T.inkSub }}>{label}</span>
      <span style={{ color: T.ink, fontFamily: T.fMono }}>{value}</span>
    </div>
  );
}

export function ZakatScreen({ T }: { T: any }) {
  const t = useT();
  const [data, setData] = useState<ZakatAssessment | null>(null);
  const [hijri, setHijri] = useState<string>('');
  const [err, setErr] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [z, h] = await Promise.all([
        API.islamic.zakat(),
        API.islamic.hijriToday().catch(() => null),
      ]);
      setData(z);
      if (h) setHijri(h.hijri.formatted);
    } catch (e: any) {
      setErr(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const dueBadge = data
    ? <Badge T={T} tone={data.due ? 'green' : 'gray'}>{data.due ? t('zakat.due_now') : t('zakat.not_due')}</Badge>
    : null;

  return (
    <div>
      <Topbar
        T={T}
        title={t('zakat.title')}
        subtitle={hijri ? `${t('hijri.today')}: ${hijri}` : t('zakat.subtitle')}
        right={<Btn T={T} kind="ghost" onClick={load} disabled={loading}>{t('common.refresh')}</Btn>}
      />
      <div style={{ padding: 24, maxWidth: 960 }}>
        {err && !data && !loading && (
          <StateView T={T} kind="error" message={err} onRetry={load} retryLabel={t('common.refresh')} />
        )}

        {loading && !data && (
          <Panel T={T} title={t('zakat.title')}><Skeleton T={T} rows={5} /></Panel>
        )}

        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
              <StatCard T={T} label={t('zakat.assets')} value={money(data.assets)} accent={T.accent.base} />
              <StatCard T={T} label={t('zakat.liabilities')} value={money(data.liabilities)} />
              <StatCard T={T} label={t('zakat.base')} value={money(data.base)} accent={T.accent.bright} />
              <StatCard
                T={T}
                label={t('zakat.payable')}
                value={money(data.amount)}
                accent={data.due ? T.green : T.line}
                sub={data.due ? t('zakat.due_now') : (data.meets_nisab === false ? t('zakat.not_due') : undefined)}
              />
            </div>

            <Panel T={T} title={t('zakat.title')} action={dueBadge}>
              <Row T={T} label={t('zakat.nisab')} value={data.nisab != null ? money(data.nisab) : '—'} />
              <Row T={T} label={t('zakat.rate')} value={(data.rate * 100).toFixed(1) + '%'} />
              {data.assetLines.map((l, i) => <Row key={'a' + i} T={T} label={l.name} value={money(l.amount)} />)}
              {data.liabilityLines.map((l, i) => <Row key={'l' + i} T={T} label={l.name} value={'(' + money(l.amount) + ')'} />)}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
