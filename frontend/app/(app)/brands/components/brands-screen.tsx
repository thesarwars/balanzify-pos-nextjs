'use client';
// ─────────────────────────────────────────────────────────────────
// Brands — manufacturer / label management. Name, short description
// and a "use for repair" flag (repair-service catalog). Wired through
// API.brand.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Badge, Panel, Modal, Field, TextField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useStateB, useEffect: useEffectB } = React;

export function Brands({ T }: { T: any }) {
  const [rows, setRows] = useStateB<any[]>([]);
  const [loading, setLoading] = useStateB(true);
  const [edit, setEdit] = useStateB<any>(null);
  const [confirmDel, setConfirmDel] = useStateB<any>(null);
  const [toast, toastNode] = useToast();

  const reload = React.useCallback(() => {
    setLoading(true);
    API.brand.list().then((bs: any) => setRows(Array.isArray(bs) ? bs : [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffectB(() => { reload(); }, [reload]);

  async function del(b: any) {
    try { await API.brand.remove(b.id); setConfirmDel(null); toast('Brand removed'); reload(); }
    catch (ex: any) { setConfirmDel(null); toast(ex.message || 'Delete failed'); }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Brands" subtitle="Manufacturers & labels for your catalog"
        right={<Btn T={T} kind="accent" onClick={() => setEdit({})}>+ Add Brand</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[['Brand', 'l'], ['Description', 'l'], ['For repair', 'l'], ['Products', 'r'], ['', 'r']].map(([h, a]: any, i: number) => (
                <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((b: any) => (
                  <tr key={b.id} style={{ transition: 'background .12s' }} onMouseEnter={(e: any) => e.currentTarget.style.background = T.paperAlt} onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{b.name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkMid, maxWidth: 360 }}>{b.description || '—'}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}>{b.use_for_repair ? <Badge T={T} tone="brass">Repair</Badge> : <span style={{ color: T.inkMute, fontSize: 12.5 }}>—</span>}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.ink } as React.CSSProperties}>{b.count}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}>
                      <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEdit(b)} style={miniBtn(T)}>Edit</button>
                        <button onClick={() => setConfirmDel(b)} style={miniBtn(T, true)}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontSize: 12.5, color: T.inkSub }}>Loading brands…</div>}
            {!loading && rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>No brands yet — add one to tag your products.</div>}
          </Panel>
        </div>
      </div>

      {edit && <BrandEditor T={T} brand={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast(edit.id ? 'Brand updated' : 'Brand added'); reload(); }} />}
      {confirmDel && (
        <Modal T={T} title="Delete brand?" subtitle={confirmDel.name} width={420} onClose={() => setConfirmDel(null)} onSave={() => del(confirmDel)} saveLabel="Delete">
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>Products under this brand keep their history but lose the brand tag.</div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}

function BrandEditor({ T, brand, onClose, onSaved }: { T: any; brand: any; onClose: () => void; onSaved: () => void }) {
  const editing = !!brand.id;
  const [f, setF] = useStateB<any>({ name: brand.name || '', description: brand.description || '', use_for_repair: !!brand.use_for_repair });
  const [busy, setBusy] = useStateB(false);
  const [err, setErr] = useStateB<any>(null);
  const set = (k: any, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.name.trim()) { setErr('Brand name is required.'); return; }
    setBusy(true); setErr(null);
    try {
      if (editing) await API.brand.update(brand.id, f); else await API.brand.create(f);
      onSaved();
    } catch (ex: any) { setErr(ex.message || 'Could not save the brand.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title={editing ? 'Edit brand' : 'Add brand'} subtitle="A manufacturer or product label" width={520} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Brand name" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="Brand name" /></Field>
        <Field T={T} label="Short description" full>
          <textarea value={f.description} onChange={e => set('description', e.target.value)} placeholder="Short description" rows={3}
            style={{ width: '100%', padding: '10px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
        </Field>
      </FormGrid>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.inkMid, cursor: 'pointer', marginTop: 16 }}>
        <input type="checkbox" checked={f.use_for_repair} onChange={e => set('use_for_repair', e.target.checked)} style={{ accentColor: T.accent.base, width: 15, height: 15 }} />
        Use for repair? <span style={{ color: T.inkSub, fontSize: 11.5 }}>(available in repair-service jobs)</span>
      </label>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
    </Modal>
  );
}

function miniBtn(T: any, danger?: any): React.CSSProperties {
  return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${danger ? T.redSoft : T.line}`, background: danger ? T.redSoft : T.paper, color: danger ? T.redText : T.inkMid };
}
