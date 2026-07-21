'use client';
// ─────────────────────────────────────────────────────────────────
// Expense Categories — name + code, one level of sub-categories.
// The Add/Edit modal mirrors the reference (Category name, code,
// "Add as sub-category" with a parent picker).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { ConfirmModal } from '../../purchase-orders/components/bits';
import { LuPencil, LuTrash2 } from 'react-icons/lu';

export function ExpenseCategories({ T, onBack }: { T: Theme; onBack: () => void }) {
  const [cats, setCats] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [edit, setEdit] = React.useState<any>(null); // {} = new
  const [confirmDel, setConfirmDel] = React.useState<any>(null);
  const [search, setSearch] = React.useState('');
  const [show, node] = useToast();

  const reload = React.useCallback(() => { setLoading(true); API.expense.categories().then(setCats).catch(() => setCats([])).finally(() => setLoading(false)); }, []);
  React.useEffect(() => { reload(); }, [reload]);

  const needle = search.trim().toLowerCase();
  const visible = needle ? cats.filter((c: any) => [c.name, c.code, c.parent_name].some((v) => String(v || '').toLowerCase().includes(needle))) : cats;

  async function doDelete(c: any) {
    try { await API.expense.removeCategory(c.id); setConfirmDel(null); show('Category deleted'); reload(); }
    catch (e: any) { setConfirmDel(null); show(e.message); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '11px 16px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` };
  const td: React.CSSProperties = { padding: '11px 16px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Expense Categories" subtitle="Manage your expense categories"
        right={<><Btn T={T} kind="ghost" onClick={onBack}>← Expenses</Btn><Btn T={T} kind="accent" onClick={() => setEdit({})}>+ Add</Btn></>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Panel T={T} pad={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, marginRight: 'auto' }}>All your expense categories</span>
              <div style={{ width: 190 }}><TextField T={T} value={search} onChange={setSearch} placeholder="Search …" /></div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Category name</th><th style={th}>Category code</th><th style={th}>Parent</th>
                <th style={{ ...th, textAlign: 'right' }}>Expenses</th><th style={{ ...th, textAlign: 'right' }}>Action</th>
              </tr></thead>
              <tbody>
                {visible.map((c: any) => (
                  <tr key={c.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{c.parent_id ? <span style={{ color: T.inkSub, marginRight: 6 }}>↳</span> : null}{c.name}</td>
                    <td style={{ ...td, fontFamily: T.fMono, color: T.inkSub }}>{c.code || '—'}</td>
                    <td style={td}>{c.parent_name || (c.children > 0 ? <Badge T={T} tone="blue">{c.children} sub</Badge> : '—')}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{c.expense_count}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button onClick={() => setEdit(c)} title="Edit" style={miniBtn(T)}><LuPencil size={13} /></button>
                        <button onClick={() => setConfirmDel(c)} title="Delete" style={{ ...miniBtn(T), color: T.redText }}><LuTrash2 size={13} /></button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div style={{ padding: 40, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>}
            {!loading && visible.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No expense categories yet.</div>}
          </Panel>
        </div>
      </div>

      {edit && <CategoryModal T={T} cat={edit.id ? edit : null} cats={cats} onClose={() => setEdit(null)}
        onSaved={(msg: string) => { setEdit(null); show(msg); reload(); }} />}
      {confirmDel && (
        <ConfirmModal T={T} title={`Delete "${confirmDel.name}"?`}
          body="Its sub-categories become top-level and its expenses keep their history, just unlinked from this category."
          confirmLabel="Delete" confirmKind="danger"
          onConfirm={() => doDelete(confirmDel)} onClose={() => setConfirmDel(null)} />
      )}
      {node}
    </div>
  );
}

function CategoryModal({ T, cat, cats, onClose, onSaved }: { T: Theme; cat: any; cats: any[]; onClose: () => void; onSaved: (m: string) => void }) {
  const [name, setName] = React.useState(cat?.name || '');
  const [code, setCode] = React.useState(cat?.code || '');
  const [isSub, setIsSub] = React.useState(!!cat?.parent_id);
  const [parentId, setParentId] = React.useState(cat?.parent_id || '');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // Parents: top-level categories only (one level of nesting), never itself.
  const parents = cats.filter((c: any) => !c.parent_id && c.id !== cat?.id);

  async function save() {
    if (!name.trim()) { setErr('Enter the category name.'); return; }
    if (isSub && !parentId) { setErr('Pick the parent category.'); return; }
    setBusy(true); setErr(null);
    const body = { name: name.trim(), code: code.trim() || undefined, parent_id: isSub ? parentId : undefined };
    try {
      if (cat) { await API.expense.updateCategory(cat.id, body); onSaved('Category updated'); }
      else { await API.expense.addCategory(body); onSaved('Category added'); }
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal T={T} title={cat ? 'Edit Expense Category' : 'Add Expense Category'} width={460} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid cols={1}>
        <Field T={T} label="Category name *"><TextField T={T} value={name} onChange={setName} placeholder="Category name" /></Field>
        <Field T={T} label="Category code"><TextField T={T} value={code} onChange={setCode} placeholder="Category code" /></Field>
      </FormGrid>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, fontWeight: 600, color: T.inkMid, cursor: 'pointer' }}>
        <input type="checkbox" checked={isSub} onChange={(e) => setIsSub(e.target.checked)} />
        Add as sub-category
      </label>
      {isSub && (
        <div style={{ marginTop: 10 }}>
          <Field T={T} label="Parent category *">
            <SelectField T={T} value={String(parentId)} options={['', ...parents.map((c: any) => String(c.id))]}
              onChange={setParentId} render={(v: any) => v === '' ? 'Please Select' : (parents.find((c: any) => String(c.id) === v) || {}).name || v} />
          </Field>
        </div>
      )}
      {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
    </Modal>
  );
}

function miniBtn(T: Theme): React.CSSProperties {
  return { width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
}
