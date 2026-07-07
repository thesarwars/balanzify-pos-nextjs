'use client';
// ─────────────────────────────────────────────────────────────────
// Categories — product taxonomy management. Name, code (HSN),
// description, colour and an optional parent (sub-taxonomy). Wired
// through API.category. Operations use each row's real UUID (`uid`);
// the `id`/`name` alias is what product grouping keys off.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useStateC, useEffect: useEffectC } = React;

export function Categories({ T }: { T: any }) {
  const [rows, setRows] = useStateC<any[]>([]);
  const [loading, setLoading] = useStateC(true);
  const [edit, setEdit] = useStateC<any>(null);
  const [confirmDel, setConfirmDel] = useStateC<any>(null);
  const [toast, toastNode] = useToast();

  const reload = React.useCallback(() => {
    setLoading(true);
    API.category.list().then((cs: any) => setRows(Array.isArray(cs) ? cs : [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffectC(() => { reload(); }, [reload]);

  async function del(c: any) {
    try { await API.category.remove(c.uid); setConfirmDel(null); toast('Category deleted'); reload(); }
    catch (ex: any) { setConfirmDel(null); toast(ex.message || 'Delete failed'); }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Categories" subtitle="Organise your catalog into a taxonomy"
        right={<Btn T={T} kind="accent" onClick={() => setEdit({})}>+ Add Category</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[['Category', 'l'], ['Code', 'l'], ['Parent', 'l'], ['Products', 'r'], ['', 'r']].map(([h, a]: any, i: number) => (
                <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((c: any) => (
                  <tr key={c.uid} style={{ transition: 'background .12s' }} onMouseEnter={(e: any) => e.currentTarget.style.background = T.paperAlt} onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color || T.line, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{c.name}</span>
                        {c.child_count > 0 && <Badge T={T} tone="gray">{c.child_count} sub</Badge>}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{c.code || '—'}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkMid }}>{c.parent_name || '—'}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.ink } as React.CSSProperties}>{c.count}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' } as React.CSSProperties}>
                      <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEdit(c)} style={miniBtn(T)}>Edit</button>
                        <button onClick={() => setConfirmDel(c)} style={miniBtn(T, true)}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontSize: 12.5, color: T.inkSub }}>Loading categories…</div>}
            {!loading && rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>No categories yet — add your first to organise the catalog.</div>}
          </Panel>
        </div>
      </div>

      {edit && <CategoryEditor T={T} category={edit} all={rows} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast(edit.uid ? 'Category updated' : 'Category added'); reload(); }} />}
      {confirmDel && (
        <Modal T={T} title="Delete category?" subtitle={confirmDel.name} width={420} onClose={() => setConfirmDel(null)} onSave={() => del(confirmDel)} saveLabel="Delete">
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>Products in this category keep their history but lose the category tag{confirmDel.child_count > 0 ? ', and its sub-categories become top-level' : ''}.</div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}

function CategoryEditor({ T, category, all, onClose, onSaved }: { T: any; category: any; all: any[]; onClose: () => void; onSaved: () => void }) {
  const editing = !!category.uid;
  const [f, setF] = useStateC<any>({
    name: category.name || '', code: category.code || '', description: category.description || '',
    color: category.color || '#D9C9A3',
    is_sub: !!category.parent_id, parent_id: category.parent_id || '',
  });
  const [busy, setBusy] = useStateC(false);
  const [err, setErr] = useStateC<any>(null);
  const set = (k: any, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  // Eligible parents: every other category (can't parent to self).
  const parents = all.filter((c: any) => c.uid !== category.uid);

  async function save() {
    if (!f.name.trim()) { setErr('Category name is required.'); return; }
    if (f.is_sub && !f.parent_id) { setErr('Pick a parent category, or turn off sub-taxonomy.'); return; }
    setBusy(true); setErr(null);
    const body = { name: f.name.trim(), code: f.code, description: f.description, color: f.color, parent_id: f.is_sub ? f.parent_id : null };
    try {
      if (editing) await API.category.update(category.uid, body); else await API.category.create(body);
      onSaved();
    } catch (ex: any) { setErr(ex.message || 'Could not save the category.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title={editing ? 'Edit category' : 'Add category'} subtitle="Choose what this category can do" width={540} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Category name" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="Category name" /></Field>
        <Field T={T} label="Category code" hint="Category code is the same as the HSN code." full><TextField T={T} value={f.code} onChange={(v: any) => set('code', v)} placeholder="Category / HSN code" /></Field>
        <Field T={T} label="Description" full>
          <textarea value={f.description} onChange={e => set('description', e.target.value)} placeholder="Description" rows={3}
            style={{ width: '100%', padding: '10px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
        </Field>
        <Field T={T} label="Colour"><input type="color" value={f.color} onChange={e => set('color', e.target.value)} style={{ width: 54, height: 38, padding: 2, border: `1.5px solid ${T.line}`, borderRadius: T.r, background: T.paper, cursor: 'pointer' }} /></Field>
      </FormGrid>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.inkMid, cursor: 'pointer', marginTop: 16 }}>
        <input type="checkbox" checked={f.is_sub} onChange={e => set('is_sub', e.target.checked)} style={{ accentColor: T.accent.base, width: 15, height: 15 }} />
        Add as sub-category (sub taxonomy)
      </label>
      {f.is_sub && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 5 }}>Parent category</div>
          {parents.length === 0
            ? <div style={{ fontSize: 12.5, color: T.inkMute }}>No other categories yet to use as a parent.</div>
            : <SelectField T={T} value={f.parent_id} options={['', ...parents.map((c: any) => c.uid)]} onChange={(v: any) => set('parent_id', v)} render={(v: any) => (v ? ((parents.find((c: any) => c.uid === v) || {}).name || v) : '— Select parent —')} />}
        </div>
      )}
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
    </Modal>
  );
}

function miniBtn(T: any, danger?: any): React.CSSProperties {
  return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${danger ? T.redSoft : T.line}`, background: danger ? T.redSoft : T.paper, color: danger ? T.redText : T.inkMid };
}
