'use client';
// ═══════════════════════════════════════════════════════════════════
//  Financing — the moat feature surfaced. Cashflow underwriting straight
//  from the ledger, and Sharia-compliant advances (fixed fee, no riba).
//  Full-stack: typed live client + i18n (EN/SO/AR) + RTL.
// ═══════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { API, type LendingAssessment, type FinancingAdvanceRow } from '@/lib/api';
import { useT } from '@/lib/locale-context';
import { Topbar } from '@/components/shell';
import { Panel, StatCard, Btn, Badge } from '@/components/kit';

const money = (n: number | string) => '$' + Number(n || 0).toFixed(2);

function statusTone(status: string): 'green' | 'amber' | 'gray' | 'blue' {
  if (status === 'settled') return 'green';
  if (status === 'disbursed' || status === 'active') return 'blue';
  if (status === 'offered') return 'amber';
  return 'gray';
}

function Row({ T, label, value }: { T: any; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13 }}>
      <span style={{ color: T.inkSub }}>{label}</span>
      <span style={{ color: T.ink, fontFamily: T.fMono }}>{value}</span>
    </div>
  );
}

export function LendingScreen({ T }: { T: any }) {
  const t = useT();
  const [assessment, setAssessment] = useState<LendingAssessment | null>(null);
  const [advances, setAdvances] = useState<FinancingAdvanceRow[]>([]);
  const [err, setErr] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [a, adv] = await Promise.all([
        API.lending.assessment(),
        API.lending.advances().catch(() => ({ advances: [] as FinancingAdvanceRow[] })),
      ]);
      setAssessment(a);
      setAdvances(adv.advances || []);
    } catch (e: any) {
      setErr(e?.message || t('lending.live_required'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Topbar
        T={T}
        title={t('lending.title')}
        subtitle={t('lending.subtitle')}
        right={<Btn T={T} kind="ghost" onClick={load} disabled={loading}>{t('common.refresh')}</Btn>}
      />
      <div style={{ padding: 24, maxWidth: 960 }}>
        {err && !assessment && (
          <Panel T={T}><div style={{ color: T.inkSub, fontSize: 13 }}>{err}</div></Panel>
        )}
        {loading && !assessment && (
          <Panel T={T}><div style={{ color: T.inkSub, fontSize: 13 }}>{t('common.loading')}</div></Panel>
        )}

        {assessment && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
              <StatCard T={T} label={t('lending.score')} value={`${assessment.score}/100`} accent={assessment.eligible ? T.green : T.line} />
              <StatCard T={T} label={t('lending.limit')} value={money(assessment.recommended_limit)} big accent={T.accent.base} />
              <StatCard
                T={T}
                label={t('lending.eligible')}
                value={<Badge T={T} tone={assessment.eligible ? 'green' : 'gray'}>{assessment.eligible ? t('lending.eligible') : t('lending.not_eligible')}</Badge>}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Panel T={T} title={t('lending.title')}>
                <Row T={T} label={t('lending.avg_revenue')} value={money(assessment.signals.avg_monthly_revenue)} />
                <Row T={T} label={t('lending.margin')} value={(assessment.signals.net_margin * 100).toFixed(1) + '%'} />
                <Row T={T} label={t('lending.cash')} value={money(assessment.signals.cash_on_hand)} />
              </Panel>

              <Panel T={T} title={t('lending.advances')}>
                {advances.length === 0 && <div style={{ color: T.inkSub, fontSize: 13 }}>{t('lending.no_advances')}</div>}
                {advances.map((a) => (
                  <div key={a.id} style={{ padding: '10px 0', borderBottom: `1px solid ${T.line}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: T.fMono, color: T.ink, fontSize: 14 }}>{money(a.principal)}</span>
                      <Badge T={T} tone={statusTone(a.status)}>{a.status}</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: T.inkSub }}>
                      <span>{t('lending.fee')}: {money(a.feeAmount)}</span>
                      <span>{t('lending.repayable')}: {money(a.totalRepayable)}</span>
                      <span>{t('lending.outstanding')}: {money(a.outstanding)}</span>
                    </div>
                  </div>
                ))}
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
