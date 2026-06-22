'use client';
// ═══════════════════════════════════════════════════════════════════
//  Drug interactions — clinical safety, surfaced. Add a basket of drugs
//  and check them against the knowledge base; severities are colour-coded
//  and contraindications flagged. Owners/managers can also add their own
//  custom interactions (business-scoped). Full-stack: typed live client +
//  i18n (EN/SO/AR) + RTL.
// ═══════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { API, type DrugInteractionResult, type InteractionSeverity } from '@/lib/api';
import { useT } from '@/lib/locale-context';
import type { MessageKey } from '@/lib/i18n';
import { Topbar } from '@/components/shell';
import { Panel, Btn, Badge, TextField, SelectField, Field } from '@/components/kit';

type KbRow = DrugInteractionResult & { id?: string; custom?: boolean };

const SEVERITIES: InteractionSeverity[] = ['minor', 'moderate', 'major', 'contraindicated'];
const SEV_TONE: Record<InteractionSeverity, 'gray' | 'blue' | 'amber' | 'red'> = {
  minor: 'gray', moderate: 'blue', major: 'amber', contraindicated: 'red',
};
const SEV_KEY: Record<InteractionSeverity, MessageKey> = {
  minor: 'rx.sev.minor', moderate: 'rx.sev.moderate', major: 'rx.sev.major', contraindicated: 'rx.sev.contraindicated',
};

function InteractionRow({ T, t, i, onRemove }: { T: any; t: (k: MessageKey) => string; i: KbRow; onRemove?: (id: string) => void }) {
  return (
    <div style={{ padding: '11px 0', borderBottom: `1px solid ${T.line}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
        <span style={{ color: T.ink, fontSize: 13, fontWeight: 600 }}>{i.drug_a} + {i.drug_b}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {i.custom && <Badge T={T} tone="brass">{t('rx.custom')}</Badge>}
          <Badge T={T} tone={SEV_TONE[i.severity]}>{t(SEV_KEY[i.severity])}</Badge>
          {i.custom && i.id && onRemove && (
            <button onClick={() => onRemove(i.id!)} title={t('rx.remove')}
              style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: T.inkSub, fontSize: 16, lineHeight: 1, padding: '2px 4px' }}>×</button>
          )}
        </span>
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
  const [kb, setKb] = useState<KbRow[]>([]);
  const [err, setErr] = useState('');

  // Add-custom-interaction form
  const [newA, setNewA] = useState('');
  const [newB, setNewB] = useState('');
  const [newSev, setNewSev] = useState<InteractionSeverity>('moderate');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const loadKb = useCallback(() => {
    API.rx.interactions()
      .then((r: { interactions?: KbRow[] }) => setKb(r.interactions || []))
      .catch(() => {});
  }, []);
  useEffect(() => { loadKb(); }, [loadKb]);

  const addInteraction = async () => {
    const a = newA.trim(), b = newB.trim(), desc = newDesc.trim();
    if (!a || !b || a.toLowerCase() === b.toLowerCase()) { setMsg({ ok: false, text: t('rx.err_pair') }); return; }
    if (!desc) { setMsg({ ok: false, text: t('rx.err_desc') }); return; }
    setSaving(true); setMsg(null);
    try {
      await API.rx.addInteraction({ drug_a: a, drug_b: b, severity: newSev, description: desc });
      setNewA(''); setNewB(''); setNewSev('moderate'); setNewDesc('');
      setMsg({ ok: true, text: t('rx.added') });
      loadKb();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || t('rx.live_required') });
    } finally { setSaving(false); }
  };

  const removeInteraction = async (id: string) => {
    try {
      await API.rx.deleteInteraction(id);
      setMsg({ ok: true, text: t('rx.removed') });
      loadKb();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || t('rx.live_required') });
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title={t('rx.title')} subtitle={t('rx.subtitle')} />
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 24, maxWidth: 960, display: 'grid', gap: 16 }}>
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

        <Panel T={T} title={t('rx.add_custom')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
            <Field T={T} label={t('rx.drug_a')}>
              <TextField T={T} value={newA} onChange={setNewA} placeholder="warfarin" />
            </Field>
            <Field T={T} label={t('rx.drug_b')}>
              <TextField T={T} value={newB} onChange={setNewB} placeholder="aspirin" />
            </Field>
            <Field T={T} label={t('rx.severity')}>
              <SelectField T={T} value={newSev} onChange={(v) => setNewSev(v as InteractionSeverity)} options={SEVERITIES} render={(o) => t(SEV_KEY[o as InteractionSeverity])} />
            </Field>
            <Field T={T} label={t('rx.description')} full>
              <TextField T={T} value={newDesc} onChange={setNewDesc} placeholder={t('rx.description')} />
            </Field>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <Btn T={T} kind="accent" onClick={addInteraction} disabled={saving}>{t('rx.save_interaction')}</Btn>
            <span style={{ fontSize: 11, color: T.inkMute }}>{t('rx.add_custom_hint')}</span>
            {msg && <span style={{ fontSize: 12, color: msg.ok ? T.greenText : T.redText, marginInlineStart: 'auto' }}>{msg.text}</span>}
          </div>
        </Panel>

        <Panel T={T} title={t('rx.kb_title')} action={<Badge T={T} tone="gray">{kb.length}</Badge>}>
          {kb.length === 0 && <div style={{ color: T.inkSub, fontSize: 13 }}>{t('rx.live_required')}</div>}
          {kb.map((i, idx) => <InteractionRow key={i.id || idx} T={T} t={t} i={i} onRemove={removeInteraction} />)}
        </Panel>
      </div>
    </div>
  );
}
