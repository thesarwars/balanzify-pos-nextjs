'use client';
// ─────────────────────────────────────────────────────────────────
// Tasks — the shared task board (real, replaces the mock DataScreen).
// List/filter by status, create (optionally against a project + assignee),
// and advance status. Wired through API.task (/api/v1/tasks).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useS, useEffect: useE, useCallback: useCb } = React;

const TASK_NEXT: any = { not_started: 'in_progress', in_progress: 'completed' };
const TASK_TONE: any = { not_started: 'gray', in_progress: 'blue', blocked: 'amber', completed: 'green', cancelled: 'red' };
const PRIORITY_TONE: any = { critical: 'red', high: 'amber', medium: 'blue', low: 'gray' };
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const FILTERS = [['', 'All'], ['not_started', 'To do'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['completed', 'Done']];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

export function Tasks({ T }: { T: Theme }) {
  const [rows, setRows] = useS<any[]>([]);
  const [loading, setLoading] = useS(true);
  const [filter, setFilter] = useS('');
  const [projects, setProjects] = useS<any[]>([]);
  const [users, setUsers] = useS<any[]>([]);
  const [add, setAdd] = useS(false);
  const [show, node] = useToast();

  const reload = useCb(() => { setLoading(true); API.task.list(filter ? { status: filter } : {}).then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, [filter]);
  useE(() => { reload(); }, [reload]);
  useE(() => {
    API.construction.projects().then((p: any) => setProjects(Array.isArray(p) ? p : [])).catch(() => {});
    API.user.list().then((u: any) => setUsers(Array.isArray(u) ? u : (u && (u.data || u.items)) || [])).catch(() => {});
  }, []);

  async function advance(t: any) {
    const next = TASK_NEXT[t.status]; if (!next) return;
    try { await API.task.update(t.id, { status: next }); show(`Task → ${next.replace('_', ' ')}`); reload(); } catch (e: any) { show(e.message); }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Tasks" subtitle={`${rows.length} task${rows.length === 1 ? '' : 's'}`}
        right={<Btn T={T} kind="accent" onClick={() => setAdd(true)}>+ New task</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {FILTERS.map(([id, lbl]) => (
              <button key={id} onClick={() => setFilter(id)} style={{ padding: '6px 13px', borderRadius: 99, border: `1px solid ${filter === id ? T.accent.base : T.line}`, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: filter === id ? 700 : 500, background: filter === id ? T.accent.soft : T.paper, color: filter === id ? T.accent.text : T.inkMid }}>{lbl}</button>
            ))}
          </div>
          <Panel T={T} pad={false}>
            <table style={tbl}><thead><tr>{['Task', 'Project', 'Priority', 'Assignee', 'Due', 'Status', ''].map((h, i) => <th key={i} style={th(T)}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((t: any) => (
                <tr key={t.id}>
                  <td style={td(T)}><b style={{ color: T.ink }}>{t.title}</b>{t.description ? <span style={{ display: 'block', fontSize: 11, color: T.inkSub, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</span> : null}</td>
                  <td style={td(T)}>{t.project_name || <span style={{ color: T.inkMute }}>—</span>}</td>
                  <td style={td(T)}><Badge T={T} tone={PRIORITY_TONE[t.priority] || 'gray'}>{t.priority}</Badge></td>
                  <td style={td(T)}>{t.assignee || <span style={{ color: T.inkMute }}>Unassigned</span>}</td>
                  <td style={td(T)}><span style={{ fontFamily: T.fMono, fontSize: 12 }}>{t.due_date || '—'}</span></td>
                  <td style={td(T)}><Badge T={T} tone={TASK_TONE[t.status] || 'gray'}>{(t.status || '').replace('_', ' ')}</Badge></td>
                  <td style={{ ...td(T), textAlign: 'right' }}>{TASK_NEXT[t.status] ? <button onClick={() => advance(t)} style={mini(T)}>→ {TASK_NEXT[t.status].replace('_', ' ')}</button> : <span style={{ fontSize: 12, color: T.green }}>✓ done</span>}</td>
                </tr>
              ))}</tbody></table>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading tasks…</div>}
            {!loading && rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No tasks{filter ? ' in this status' : ' yet'}.</div>}
          </Panel>
        </div>
      </div>
      {add && <TaskModal T={T} projects={projects} users={users} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); show('Task created'); reload(); }} />}
      {node}
    </div>
  );
}

function TaskModal({ T, projects, users, onClose, onSaved }: { T: Theme; projects: any[]; users: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useS<any>({ title: '', priority: 'medium', due_date: addDays(today(), 7), project_id: '', assignee_id: '', description: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.title.trim()) { setErr('Task title is required.'); return; }
    setBusy(true); setErr(null);
    try {
      await API.task.create({ title: f.title.trim(), priority: f.priority, status: 'not_started', due_date: f.due_date, category: 'other', project_id: f.project_id || undefined, assignee_id: f.assignee_id || undefined, description: f.description || undefined });
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="New task" width={520} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add task'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Title" full><TextField T={T} value={f.title} onChange={(v: any) => set('title', v)} placeholder="What needs doing?" /></Field>
        <Field T={T} label="Priority"><SelectField T={T} value={f.priority} options={PRIORITIES} onChange={(v: any) => set('priority', v)} /></Field>
        <Field T={T} label="Due date"><TextField T={T} type="date" value={f.due_date} onChange={(v: any) => set('due_date', v)} /></Field>
        <Field T={T} label="Project"><SelectField T={T} value={f.project_id} options={['', ...projects.map((p: any) => p.id)]} onChange={(v: any) => set('project_id', v)} render={(v: any) => v ? (projects.find((p: any) => p.id === v) || {}).name : 'None'} /></Field>
        <Field T={T} label="Assignee"><SelectField T={T} value={f.assignee_id} options={['', ...users.map((u: any) => u.id)]} onChange={(v: any) => set('assignee_id', v)} render={(v: any) => v ? (users.find((u: any) => u.id === v) || {}).name : 'Unassigned'} /></Field>
        <Field T={T} label="Notes" full><TextField T={T} value={f.description} onChange={(v: any) => set('description', v)} placeholder="optional" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th = (T: Theme): React.CSSProperties => ({ textAlign: 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` });
const td = (T: Theme): React.CSSProperties => ({ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: T.inkMid });
function mini(T: Theme): React.CSSProperties { return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid }; }
