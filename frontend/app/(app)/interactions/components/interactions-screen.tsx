'use client';
// ═══════════════════════════════════════════════════════════════════
//  Drug interactions — clinical safety, surfaced. Add a basket of drugs
//  and check them against the knowledge base; severities are colour-coded
//  and contraindications flagged. Full-stack: typed live client + i18n
//  (EN/SO/AR) + RTL.
// ═══════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { API, type DrugInteractionResult, type InteractionSeverity } from '@/lib/api';
import { useT } from '@/lib/locale-context';
import type { MessageKey } from '@/lib/i18n';
import { Topbar } from '@/components/shell';
import { Panel, Btn, Badge, TextField } from '@/components/kit';

const SEV_TONE: Record<InteractionSeverity, 'gray' | 'blue' | 'amber' | 'red'> = {
  minor: 'gray', moderate: 'blue', major: 'amber', contraindicated: 'red',
};
const SEV_KEY: Record<InteractionSeverity, MessageKey> = {
  minor: 'rx.sev.minor', moderate: 'rx.sev.moderate', major: 'rx.sev.major', contraindicated: 'rx.sev.contraindicated',
};

function InteractionRow({ T, t, i }: { T: any; t: (k: MessageKey) => string; i: DrugInteractionResult }) {
  return (
    <div style={{ padding: '11px 0', borderBottom: `1px solid ${T.line}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: T.ink, fontSize: 13, fontWeight: 600 }}>{i.drug_a} + {i.drug_b}</span>
        <Badge T={T} tone={SEV_TONE[i.severity]}>{t(SEV_KEY[i.severity])}</Badge>
      </div>
      <div style={{ fontSize: 12, color: T.inkSub }}>{i.description}</div>
    </div>
  );
}

export function InteractionsScreen({ T }: { T: any }) {
  const t = useT();
  const [drugs, setDrugs] = useState<string[]>([]);
  const [entry, setEntry] = useState('');
  const [results, setResults] = useState<DrugInteractionResult[] | null>(null);
  const [kb, setKb] = useState<DrugInteractionResult[]>([]);
  const [err, setErr] = useState('');

  const addDrug = () => {
    const v = entry.trim();
    if (v && !drugs.includes(v)) setDrugs([...drugs, v]);
    setEntry('');
  };
  const removeDrug = (d: string) => setDrugs(drugs.filter((x) => x !== d));

  const check = useCallback(async () => {
    if (drugs.length < 2) { setResults([]); return; }
    setErr('');
    try {
      const res = await API.rx.checkInteractions({ drugs });
      setResults(res.interactions || []);
    } catch (e: any) {
      setErr(e?.message || t('rx.live_required'));
    }
  }, [drugs, t]);

  useEffect(() => {
    API.rx.interactions()
      .then((r: { interactions?: DrugInteractionResult[] }) => setKb(r.interactions || []))
      .catch(() => {});
  }, []);

  return (
    <div>
      <Topbar T={T} title={t('rx.title')} subtitle={t('rx.subtitle')} />
      <div style={{ padding: 24, maxWidth: 960, display: 'grid', gap: 16 }}>
        <Panel T={T} title={t('rx.title')}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <TextField T={T} value={entry} onChange={setEntry} placeholder={t('rx.add_drug')} />
            </div>
            <Btn T={T} kind="soft" onClick={addDrug}>{t('common.add')}</Btn>
            <Btn T={T} kind="accent" onClick={check} disabled={drugs.length < 2}>{t('rx.check')}</Btn>
          </div>

          {drugs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {drugs.map((d) => (
                <span key={d} onClick={() => removeDrug(d)} title="remove"
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12, background: T.paperSink, color: T.inkMid, border: `1px solid ${T.line}` }}>
                  {d} <span style={{ color: T.inkSub }}>×</span>
                </span>
              ))}
            </div>
          )}

          {err && <div style={{ color: T.redText, fontSize: 13, marginTop: 12 }}>{err}</div>}

          {results && !err && (
            <div style={{ marginTop: 14 }}>
              {results.length === 0
                ? <div style={{ color: T.inkSub, fontSize: 13 }}>{t('rx.no_interactions')}</div>
                : results.map((i, idx) => <InteractionRow key={idx} T={T} t={t} i={i} />)}
            </div>
          )}
        </Panel>

        <Panel T={T} title={t('rx.kb_title')} action={<Badge T={T} tone="gray">{kb.length}</Badge>}>
          {kb.length === 0 && <div style={{ color: T.inkSub, fontSize: 13 }}>{t('rx.live_required')}</div>}
          {kb.slice(0, 30).map((i, idx) => <InteractionRow key={idx} T={T} t={t} i={i} />)}
        </Panel>
      </div>
    </div>
  );
}
