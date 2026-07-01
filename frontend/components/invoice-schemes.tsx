'use client';
// Shared invoice-scheme manager — used both as a modal (from Locations) and
// inline (Invoice Settings ▸ Schemes tab). Format (year), numbering type
// (sequential | aleatory), prefix/start/digits, live preview, edit + delete.
import React from 'react';
import { Btn, Modal, TextField, SelectField } from '@/components/kit';
import { API } from '@/lib/api';

export const BLANK_SCHEME = { id: null, name: '', prefix: '', start_number: 1, total_digits: 4, numbering_type: 'sequential', include_year: false };

export function schemeSample(s: any, year: number) {
  const digits = Math.max(1, Math.min(12, Number(s.total_digits) || 1));
  const num = s.numbering_type === 'aleatory' ? 'X'.repeat(digits) : String(Math.max(0, Number(s.start_number) || 0)).padStart(digits, '0');
  return '#' + (s.include_year ? year + '-' : '') + (s.prefix || '') + num;
}

export function SchemeManagerBody({ T, schemes, onChange, toast }: { T: any; schemes: any; onChange: () => void; toast: (m: string) => void }) {
  const [f, setF] = React.useState<any>({ ...BLANK_SCHEME });
  const [busy, setBusy] = React.useState(false);
  const set = (k: any, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const editing = !!f.id;
  const year = new Date().getFullYear();
  const digits = Math.max(1, Math.min(12, Number(f.total_digits) || 1));
  const fmtCard = (withYear: boolean) => (withYear ? year + '-' : '') + (f.prefix || '') + 'X'.repeat(digits);

  async function save() {
    if (!f.name.trim()) { toast('Scheme name is required.'); return; }
    setBusy(true);
    try {
      if (editing) { await API.invoiceScheme.update(f.id, f); toast('Scheme updated'); }
      else { await API.invoiceScheme.create(f); toast('Scheme added'); }
      setF({ ...BLANK_SCHEME }); onChange();
    } catch (e: any) { toast(e.message || 'Could not save the scheme.'); } finally { setBusy(false); }
  }
  async function del(id: any) {
    setBusy(true);
    try { await API.invoiceScheme.delete(id); if (f.id === id) setF({ ...BLANK_SCHEME }); onChange(); toast('Scheme deleted'); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }
  const edit = (s: any) => setF({ id: s.id, name: s.name || '', prefix: s.prefix || '', start_number: s.start_number ?? 1, total_digits: s.total_digits ?? 4, numbering_type: s.numbering_type || 'sequential', include_year: !!s.include_year });

  const lbl = (t: string) => <div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>{t}</div>;
  const formatCard = (withYear: boolean) => (
    <button onClick={() => set('include_year', withYear)} style={{ flex: 1, textAlign: 'left', padding: '13px 15px', borderRadius: T.rLg, cursor: 'pointer', position: 'relative', background: f.include_year === withYear ? T.accent.soft : T.paper, border: `1.5px solid ${f.include_year === withYear ? T.accent.base : T.line}` }}>
      <div style={{ fontSize: 10, color: T.inkSub, fontWeight: 700, letterSpacing: 0.6 }}>FORMAT</div>
      <div style={{ fontFamily: T.fMono, fontSize: 14, fontWeight: 600, color: T.ink, marginTop: 4 }}>{fmtCard(withYear)}</div>
      {f.include_year === withYear && <span style={{ position: 'absolute', top: 9, right: 12, color: T.accent.text, fontSize: 13 }}>●</span>}
    </button>
  );

  return (
    <>
      {schemes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {schemes.map((s: any) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', border: `1px solid ${f.id === s.id ? T.accent.base : T.line}`, borderRadius: T.r, background: T.paper }}>
              <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => edit(s)}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{s.name}</div>
                <div style={{ fontSize: 11, color: T.inkSub, marginTop: 2 }}>{s.numbering_type === 'aleatory' ? 'Random' : 'Sequential'} · <span style={{ fontFamily: T.fMono, color: T.inkMid }}>{schemeSample(s, year)}</span></div>
              </div>
              <button onClick={() => edit(s)} style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid, borderRadius: T.r, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>Edit</button>
              <button onClick={() => del(s.id)} title="Delete" style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.inkSub, borderRadius: T.r, width: 30, height: 30, cursor: 'pointer', fontSize: 15 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: schemes.length > 0 ? `1px solid ${T.line}` : 'none', paddingTop: schemes.length > 0 ? 16 : 0 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>{formatCard(false)}{formatCard(true)}</div>

        <div style={{ marginBottom: 12 }}>{lbl('Name')}<TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. Default" /></div>

        <div style={{ marginBottom: 12 }}>
          {lbl('Numbering type')}
          <SelectField T={T} value={f.numbering_type} options={['sequential', 'aleatory']} onChange={(v: any) => set('numbering_type', v)} render={(v: any) => (v === 'aleatory' ? 'Aleatory (random)' : 'Sequential')} />
          <div style={{ fontSize: 11, color: T.inkSub, marginTop: 5 }}>Sequential generates numbers serially (1, 2, 3…). Aleatory generates them randomly.</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>{lbl('Prefix')}<TextField T={T} value={f.prefix} onChange={(v: any) => set('prefix', v)} placeholder="e.g. AS" /></div>
          {f.numbering_type === 'sequential' && <div style={{ width: 120 }}>{lbl('Start from')}<TextField T={T} type="number" value={f.start_number} onChange={(v: any) => set('start_number', +v)} /></div>}
          <div style={{ width: 100 }}>{lbl('Digits')}<TextField T={T} type="number" value={f.total_digits} onChange={(v: any) => set('total_digits', +v)} /></div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <div style={{ flex: 1, fontSize: 12, color: T.inkSub }}>Preview <span style={{ fontFamily: T.fMono, color: T.ink, fontWeight: 600, marginLeft: 4 }}>{schemeSample(f, year)}</span></div>
          {editing && <Btn T={T} kind="ghost" onClick={() => setF({ ...BLANK_SCHEME })}>Cancel</Btn>}
          <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add scheme'}</Btn>
        </div>
      </div>
    </>
  );
}

export function SchemeManagerModal({ T, schemes, onClose, onChange, toast }: { T: any; schemes: any; onClose: () => void; onChange: () => void; toast: (m: string) => void }) {
  return (
    <Modal T={T} title="Invoice schemes" subtitle="Invoice number formats" width={560} onClose={onClose} footer={null}>
      <SchemeManagerBody T={T} schemes={schemes} onChange={onChange} toast={toast} />
    </Modal>
  );
}
