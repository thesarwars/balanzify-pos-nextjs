'use client';
// ─────────────────────────────────────────────────────────────────
// Construction — the real vertical (replaces the static mockup).
// Module-gated, project-centric: pick a project, then job-cost it.
// Tabs: Costing (budget vs actual + record cost), Labor (daily cash log),
// Site Diary (notes + photos for the remote owner), Milestones (stage
// billing with retention). Wired through API.construction.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useS, useEffect: useE, useCallback: useCb } = React;

const CATEGORIES = ['materials', 'labor', 'subcontract', 'equipment', 'other'];
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
const MS_NEXT: any = { pending: 'in_progress', in_progress: 'complete', complete: 'billed', billed: 'paid' };
const MS_TONE: any = { pending: 'gray', in_progress: 'blue', complete: 'amber', billed: 'violet', paid: 'green' };
const PRJ_TONE: any = { planning: 'gray', active: 'green', on_hold: 'amber', completed: 'blue', cancelled: 'red' };
const TASK_NEXT: any = { not_started: 'in_progress', in_progress: 'completed' };
const TASK_TONE: any = { not_started: 'gray', in_progress: 'blue', blocked: 'amber', completed: 'green', cancelled: 'red' };
const PRIORITY_TONE: any = { critical: 'red', high: 'amber', medium: 'blue', low: 'gray' };
const PRIORITIES = ['critical', 'high', 'medium', 'low'];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const dstr = (d: any) => (d ? String(d).slice(0, 10) : '—');

export function Construction({ T }: { T: Theme }) {
  const [enabled, setEnabled] = useS<any>(null);   // null = loading
  const [projects, setProjects] = useS<any[]>([]);
  const [pid, setPid] = useS<any>('');
  const [tab, setTab] = useS<any>('costing');
  const [costing, setCosting] = useS<any>(null);
  const [labor, setLabor] = useS<any>({ entries: [], total: 0 });
  const [logs, setLogs] = useS<any[]>([]);
  const [milestones, setMilestones] = useS<any[]>([]);
  const [tasks, setTasks] = useS<any[]>([]);
  const [modal, setModal] = useS<any>(null);   // 'project'|'line'|'labor'|'log'|'milestone'|'task'|{cost:line}
  const [show, node] = useToast();

  useE(() => { API.module.list().then((ms: any) => setEnabled(!!(ms.find((m: any) => m.key === 'construction') || {}).enabled)).catch(() => setEnabled(false)); }, []);

  const reloadProjects = useCb(() => API.construction.projects().then((p: any) => { setProjects(p); setPid((cur: any) => cur || (p[0] && p[0].id) || ''); }).catch(() => {}), []);
  useE(() => { if (enabled) reloadProjects(); }, [enabled, reloadProjects]);

  const reloadCosting = useCb(() => { if (pid) API.construction.costing(pid).then(setCosting).catch(() => setCosting(null)); }, [pid]);
  const reloadLabor = useCb(() => { if (pid) API.construction.labor(pid).then(setLabor).catch(() => {}); }, [pid]);
  const reloadLogs = useCb(() => { if (pid) API.construction.siteLogs(pid).then(setLogs).catch(() => {}); }, [pid]);
  const reloadMs = useCb(() => { if (pid) API.construction.milestones(pid).then(setMilestones).catch(() => {}); }, [pid]);
  const reloadTasks = useCb(() => { if (pid) API.task.list({ project_id: pid }).then(setTasks).catch(() => {}); }, [pid]);
  useE(() => { if (!pid) { setCosting(null); return; } reloadCosting(); reloadLabor(); reloadLogs(); reloadMs(); reloadTasks(); }, [pid, reloadCosting, reloadLabor, reloadLogs, reloadMs, reloadTasks]);

  async function enableModule() { try { await API.module.setEnabled('construction', true); setEnabled(true); show('Construction module enabled'); } catch (e: any) { show(e.message); } }
  async function advanceMs(m: any) {
    const next = MS_NEXT[m.status]; if (!next) return;
    try { await API.construction.setMilestoneStatus(m.id, next); show(`Milestone → ${next.replace('_', ' ')}`); reloadMs(); } catch (e: any) { show(e.message); }
  }

  if (enabled === null) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paperAlt, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>;
  if (enabled === false) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.paperAlt }}>
      <Topbar T={T} title="Construction" subtitle="Projects & job costing" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{ width: 76, height: 76, borderRadius: 20, background: T.accent.soft, color: T.accent.base, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, margin: '0 auto 20px' }}>🏗️</div>
          <div style={{ fontFamily: T.fDisplay, fontSize: 24, fontWeight: T.dispWeight, color: T.ink, marginBottom: 8 }}>Construction module</div>
          <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6, marginBottom: 22 }}>Keep the job profitable: budget by category with live budget-vs-actual, log daily cash labor, keep a photo site diary for remote owners, and bill by milestone with retention. Paid add-on ($19/mo).</div>
          <Btn T={T} kind="accent" onClick={enableModule}>Enable Construction · $19/mo</Btn>
        </div>
      </div>
      {node}
    </div>
  );

  const project = projects.find((p: any) => p.id === pid) || null;
  const tabs = [['costing', 'Costing'], ['labor', 'Labor'], ['diary', 'Site diary'], ['milestones', 'Milestones'], ['tasks', 'Tasks']];
  async function advanceTask(t: any) {
    const next = TASK_NEXT[t.status]; if (!next) return;
    try { await API.task.update(t.id, { status: next }); show(`Task → ${next.replace('_', ' ')}`); reloadTasks(); } catch (e: any) { show(e.message); }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Construction" subtitle="Projects & job costing"
        right={<Btn T={T} kind="accent" onClick={() => setModal('project')}>+ New project</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {projects.length === 0 ? (
            <Panel T={T}><div style={empty(T)}>No projects yet. Create one to start job-costing.</div></Panel>
          ) : (<>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 260 }}>
                <SelectField T={T} value={pid} options={projects.map((p: any) => p.id)} onChange={(v: any) => setPid(v)}
                  render={(v: any) => { const p = projects.find((x: any) => x.id === v); return p ? p.name : 'Select project…'; }} />
              </div>
              {project && <Badge T={T} tone={PRJ_TONE[project.status] || 'gray'}>{(project.status || '').replace('_', ' ')}</Badge>}
              {project && <span style={{ fontSize: 12.5, color: T.inkSub }}>Budget <b style={{ fontFamily: T.fMono, color: T.ink }}>{money(project.budget)}</b></span>}
            </div>

            <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
              {tabs.map(([id, lbl]: any) => (
                <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl}</button>
              ))}
            </div>

            {tab === 'costing' && (<>
              {costing && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 16 }}>
                  {[['Budgeted', money0(costing.totals.budgeted), T.blue], ['Actual', money0(costing.totals.actual), T.accent.base], ['Remaining', money0(costing.totals.remaining), costing.totals.over_budget ? T.red : T.green]].map(([k, v, c]: any, i: number) => (
                    <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '15px 18px', boxShadow: T.sh1, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c }} />
                      <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>{k}</div>
                      <div style={{ fontFamily: T.fMono, fontWeight: 500, fontSize: 23, color: T.ink, marginTop: 7 }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
              {costing && costing.totals.over_budget && <div style={{ padding: '11px 16px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>⚠ This job is over budget by {money(Math.abs(costing.totals.remaining))}.</div>}
              <Panel T={T} title="Budget vs actual" action={<Btn T={T} kind="ghost" onClick={() => setModal('line')}>+ Budget line</Btn>} pad={false}>
                <table style={tbl}><thead><tr>{['Category', 'Description', 'Budgeted', 'Actual', 'Variance', ''].map((h, i) => <th key={i} style={th(T, i >= 2 && i <= 4)}>{h}</th>)}</tr></thead>
                  <tbody>{(costing ? costing.lines : []).map((l: any) => {
                    const variance = Number(l.variance);
                    return (
                      <tr key={l.id}>
                        <td style={td(T)}><Badge T={T} tone="gray">{l.category}</Badge></td>
                        <td style={td(T)}>{l.description || '—'}</td>
                        <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{money(l.budgeted)}</td>
                        <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{money(l.actual)}</td>
                        <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: variance < 0 ? T.redText : T.green }}>{money(variance)}</td>
                        <td style={{ ...td(T), textAlign: 'right' }}>{l.category === 'labor' ? <span style={{ fontSize: 11, color: T.inkMute }}>auto from labor log</span> : <button onClick={() => setModal({ cost: l })} style={mini(T)}>Record cost</button>}</td>
                      </tr>
                    );
                  })}{(!costing || costing.lines.length === 0) && <tr><td colSpan={6} style={empty(T)}>No budget lines yet.</td></tr>}</tbody></table>
              </Panel>
            </>)}

            {tab === 'labor' && (<>
              <div style={{ fontSize: 13, color: T.inkSub, marginBottom: 12 }}>Total labor cost: <b style={{ color: T.ink, fontFamily: T.fMono }}>{money(labor.total || 0)}</b></div>
              <Panel T={T} title="Daily labor log" action={<Btn T={T} kind="ghost" onClick={() => setModal('labor')}>+ Log day</Btn>} pad={false}>
                <table style={tbl}><thead><tr>{['Date', 'Workers', 'Daily rate', 'Total', 'Notes'].map((h, i) => <th key={i} style={th(T, i >= 1 && i <= 3)}>{h}</th>)}</tr></thead>
                  <tbody>{(labor.entries || []).map((e: any) => (
                    <tr key={e.id}>
                      <td style={td(T)}><span style={{ fontFamily: T.fMono }}>{dstr(e.workDate)}</span></td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{e.workers}</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{money(e.dailyRate)}</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: T.ink }}>{money(e.total)}</td>
                      <td style={td(T)}><span style={{ color: T.inkSub, fontSize: 12.5 }}>{e.notes || '—'}</span></td>
                    </tr>
                  ))}{(labor.entries || []).length === 0 && <tr><td colSpan={5} style={empty(T)}>No labor logged yet.</td></tr>}</tbody></table>
              </Panel>
            </>)}

            {tab === 'diary' && (<>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><Btn T={T} kind="ghost" onClick={() => setModal('log')}>+ Diary entry</Btn></div>
              {logs.length === 0 && <Panel T={T}><div style={empty(T)}>No site diary entries yet.</div></Panel>}
              {logs.map((l: any) => (
                <Panel T={T} key={l.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <b style={{ fontFamily: T.fMono, fontSize: 13, color: T.ink }}>{dstr(l.logDate)}</b>
                    {Array.isArray(l.photoUrls) && l.photoUrls.length > 0 && <span style={{ fontSize: 11.5, color: T.inkSub }}>📷 {l.photoUrls.length}</span>}
                  </div>
                  <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{l.notes}</div>
                  {Array.isArray(l.photoUrls) && l.photoUrls.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {l.photoUrls.map((u: string, i: number) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer" style={{ display: 'block', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.line}`, background: T.paperAlt }}>
                          <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </a>
                      ))}
                    </div>
                  )}
                </Panel>
              ))}
            </>)}

            {tab === 'milestones' && (
              <Panel T={T} title="Stage billing & retention" action={<Btn T={T} kind="ghost" onClick={() => setModal('milestone')}>+ Milestone</Btn>} pad={false}>
                <table style={tbl}><thead><tr>{['Milestone', 'Amount', 'Retention', 'Held', 'Billable now', 'Status', ''].map((h, i) => <th key={i} style={th(T, i >= 1 && i <= 4)}>{h}</th>)}</tr></thead>
                  <tbody>{milestones.map((m: any) => (
                    <tr key={m.id}>
                      <td style={td(T)}><b style={{ color: T.ink }}>{m.name}</b></td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{money(m.amount)}</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{Number(m.retentionPct)}%</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{money(m.retention_held)}</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: m.billable_now != null ? T.green : T.inkMute }}>{m.billable_now != null ? money(m.billable_now) : '—'}</td>
                      <td style={td(T)}><Badge T={T} tone={MS_TONE[m.status] || 'gray'}>{(m.status || '').replace('_', ' ')}</Badge></td>
                      <td style={{ ...td(T), textAlign: 'right' }}>{MS_NEXT[m.status] ? <button onClick={() => advanceMs(m)} style={mini(T)}>→ {MS_NEXT[m.status].replace('_', ' ')}</button> : <span style={{ fontSize: 12, color: T.green }}>✓ paid</span>}</td>
                    </tr>
                  ))}{milestones.length === 0 && <tr><td colSpan={7} style={empty(T)}>No milestones yet.</td></tr>}</tbody></table>
              </Panel>
            )}

            {tab === 'tasks' && (
              <Panel T={T} title="Project tasks" action={<Btn T={T} kind="ghost" onClick={() => setModal('task')}>+ Task</Btn>} pad={false}>
                <table style={tbl}><thead><tr>{['Task', 'Priority', 'Due', 'Status', ''].map((h, i) => <th key={i} style={th(T)}>{h}</th>)}</tr></thead>
                  <tbody>{tasks.map((t: any) => (
                    <tr key={t.id}>
                      <td style={td(T)}><b style={{ color: T.ink }}>{t.title}</b>{t.assignee ? <span style={{ display: 'block', fontSize: 11, color: T.inkSub }}>{t.assignee}</span> : null}</td>
                      <td style={td(T)}><Badge T={T} tone={PRIORITY_TONE[t.priority] || 'gray'}>{t.priority}</Badge></td>
                      <td style={td(T)}><span style={{ fontFamily: T.fMono, fontSize: 12 }}>{t.due_date || '—'}</span></td>
                      <td style={td(T)}><Badge T={T} tone={TASK_TONE[t.status] || 'gray'}>{(t.status || '').replace('_', ' ')}</Badge></td>
                      <td style={{ ...td(T), textAlign: 'right' }}>{TASK_NEXT[t.status] ? <button onClick={() => advanceTask(t)} style={mini(T)}>→ {TASK_NEXT[t.status].replace('_', ' ')}</button> : <span style={{ fontSize: 12, color: T.green }}>✓ done</span>}</td>
                    </tr>
                  ))}{tasks.length === 0 && <tr><td colSpan={5} style={empty(T)}>No tasks for this project yet.</td></tr>}</tbody></table>
              </Panel>
            )}
          </>)}
        </div>
      </div>

      {modal === 'project' && <ProjectModal T={T} onClose={() => setModal(null)} onSaved={(p: any) => { setModal(null); show('Project created'); reloadProjects(); if (p && p.id) setPid(p.id); }} />}
      {modal === 'line' && <BudgetLineModal T={T} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Budget line added'); reloadCosting(); }} pid={pid} />}
      {modal && modal.cost && <RecordCostModal T={T} line={modal.cost} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Cost recorded'); reloadCosting(); }} />}
      {modal === 'labor' && <LaborModal T={T} pid={pid} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Labor logged'); reloadLabor(); reloadCosting(); }} />}
      {modal === 'log' && <SiteLogModal T={T} pid={pid} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Diary entry added'); reloadLogs(); }} />}
      {modal === 'milestone' && <MilestoneModal T={T} pid={pid} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Milestone added'); reloadMs(); }} />}
      {modal === 'task' && <TaskModal T={T} pid={pid} onClose={() => setModal(null)} onSaved={() => { setModal(null); show('Task added'); reloadTasks(); }} />}
      {node}
    </div>
  );
}

// ── Modals ────────────────────────────────────────────────────────
function ProjectModal({ T, onClose, onSaved }: { T: Theme; onClose: () => void; onSaved: (p: any) => void }) {
  const [f, setF] = useS<any>({ name: '', category: '', status: 'planning', start_date: today(), target_date: addDays(today(), 30), budget: '', description: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.name.trim()) { setErr('Project name is required.'); return; }
    setBusy(true); setErr(null);
    try {
      const p: any = await API.construction.createProject({ name: f.name.trim(), category: f.category || undefined, status: f.status, start_date: f.start_date, target_date: f.target_date, budget: Number(f.budget) || 0, description: f.description || undefined });
      onSaved(p);
    } catch (e: any) { setErr(e.message || 'Could not create project.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="New project" subtitle="A construction job to cost & bill" width={560} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Creating…' : 'Create project'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Name" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. Eastleigh 4-unit block" /></Field>
        <Field T={T} label="Category"><TextField T={T} value={f.category} onChange={(v: any) => set('category', v)} placeholder="e.g. Residential" /></Field>
        <Field T={T} label="Status"><SelectField T={T} value={f.status} options={PROJECT_STATUSES} onChange={(v: any) => set('status', v)} render={(v: any) => v.replace('_', ' ')} /></Field>
        <Field T={T} label="Start date"><TextField T={T} type="date" value={f.start_date} onChange={(v: any) => set('start_date', v)} /></Field>
        <Field T={T} label="Target date"><TextField T={T} type="date" value={f.target_date} onChange={(v: any) => set('target_date', v)} /></Field>
        <Field T={T} label="Budget"><TextField T={T} type="number" value={f.budget} onChange={(v: any) => set('budget', v)} placeholder="0" /></Field>
        <Field T={T} label="Description" full><TextField T={T} value={f.description} onChange={(v: any) => set('description', v)} placeholder="optional" /></Field>
      </FormGrid>
      {err && <div style={errBox(T)}>⚠ {err}</div>}
    </Modal>
  );
}

function BudgetLineModal({ T, pid, onClose, onSaved }: { T: Theme; pid: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useS<any>({ category: 'materials', description: '', budgeted: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!(Number(f.budgeted) >= 0)) { setErr('Enter a budget amount.'); return; }
    setBusy(true); setErr(null);
    try { await API.construction.addBudgetLine(pid, { category: f.category, description: f.description || undefined, budgeted: Number(f.budgeted) || 0 }); onSaved(); }
    catch (e: any) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="New budget line" width={460} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add line'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Category"><SelectField T={T} value={f.category} options={CATEGORIES} onChange={(v: any) => set('category', v)} /></Field>
        <Field T={T} label="Budgeted amount"><TextField T={T} type="number" value={f.budgeted} onChange={(v: any) => set('budgeted', v)} placeholder="0" /></Field>
        <Field T={T} label="Description" full><TextField T={T} value={f.description} onChange={(v: any) => set('description', v)} placeholder="optional" /></Field>
      </FormGrid>
      {f.category === 'labor' && <div style={{ marginTop: 12, fontSize: 12, color: T.inkSub }}>Labor actuals roll up automatically from the daily labor log.</div>}
      {err && <div style={errBox(T)}>⚠ {err}</div>}
    </Modal>
  );
}

function RecordCostModal({ T, line, onClose, onSaved }: { T: Theme; line: any; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useS(''); const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  async function save() {
    if (!(Number(amount) > 0)) { setErr('Enter an amount.'); return; }
    setBusy(true); setErr(null);
    try { await API.construction.recordCost(line.id, Number(amount)); onSaved(); } catch (e: any) { setErr(e.message || 'Could not record.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="Record cost" subtitle={`${line.category}${line.description ? ' · ' + line.description : ''}`} width={420} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Record'}</Btn></>}>
      <div style={{ fontSize: 12.5, color: T.inkSub, marginBottom: 12 }}>Budgeted {money(line.budgeted)} · actual so far {money(line.actual)}</div>
      <FormGrid><Field T={T} label="Amount spent" full><TextField T={T} type="number" value={amount} onChange={setAmount} placeholder="0.00" /></Field></FormGrid>
      {err && <div style={errBox(T)}>⚠ {err}</div>}
    </Modal>
  );
}

function LaborModal({ T, pid, onClose, onSaved }: { T: Theme; pid: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useS<any>({ work_date: today(), workers: '', daily_rate: '', notes: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const total = (Number(f.workers) || 0) * (Number(f.daily_rate) || 0);
  async function save() {
    if (!(Number(f.workers) > 0) || !(Number(f.daily_rate) > 0)) { setErr('Workers and daily rate are required.'); return; }
    setBusy(true); setErr(null);
    try { await API.construction.logLabor(pid, { work_date: f.work_date, workers: Number(f.workers), daily_rate: Number(f.daily_rate), notes: f.notes || undefined }); onSaved(); }
    catch (e: any) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="Log labor day" width={480} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : `Log${total > 0 ? ' · ' + money(total) : ''}`}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Date"><TextField T={T} type="date" value={f.work_date} onChange={(v: any) => set('work_date', v)} /></Field>
        <Field T={T} label="Workers"><TextField T={T} type="number" value={f.workers} onChange={(v: any) => set('workers', v)} placeholder="0" /></Field>
        <Field T={T} label="Daily rate (each)"><TextField T={T} type="number" value={f.daily_rate} onChange={(v: any) => set('daily_rate', v)} placeholder="0" /></Field>
        <Field T={T} label="Notes" full><TextField T={T} value={f.notes} onChange={(v: any) => set('notes', v)} placeholder="optional — crew, task…" /></Field>
      </FormGrid>
      {err && <div style={errBox(T)}>⚠ {err}</div>}
    </Modal>
  );
}

function SiteLogModal({ T, pid, onClose, onSaved }: { T: Theme; pid: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useS<any>({ log_date: today(), notes: '', photos: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.notes.trim()) { setErr('Diary notes are required.'); return; }
    const photo_urls = f.photos.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
    setBusy(true); setErr(null);
    try { await API.construction.addSiteLog(pid, { log_date: f.log_date, notes: f.notes.trim(), photo_urls: photo_urls.length ? photo_urls : undefined }); onSaved(); }
    catch (e: any) { setErr(e.message || 'Could not save — check photo URLs are valid.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="Site diary entry" subtitle="What happened on site today" width={520} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add entry'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Date"><TextField T={T} type="date" value={f.log_date} onChange={(v: any) => set('log_date', v)} /></Field>
      </FormGrid>
      <Field T={T} label="Notes"><textarea value={f.notes} onChange={(e: any) => set('notes', e.target.value)} rows={4} placeholder="Poured ground-floor slab, 8 workers, cement delivered…" style={{ width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} /></Field>
      <Field T={T} label="Photo URLs (one per line)"><textarea value={f.photos} onChange={(e: any) => set('photos', e.target.value)} rows={2} placeholder="https://…/photo1.jpg" style={{ width: '100%', padding: '10px 13px', fontSize: 13, fontFamily: T.fMono, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} /></Field>
      {err && <div style={errBox(T)}>⚠ {err}</div>}
    </Modal>
  );
}

function MilestoneModal({ T, pid, onClose, onSaved }: { T: Theme; pid: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useS<any>({ name: '', amount: '', retention_pct: 5, sort_order: 0 });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.name.trim()) { setErr('Milestone name is required.'); return; }
    setBusy(true); setErr(null);
    try { await API.construction.addMilestone(pid, { name: f.name.trim(), amount: Number(f.amount) || 0, retention_pct: Number(f.retention_pct) || 0, sort_order: Number(f.sort_order) || 0 }); onSaved(); }
    catch (e: any) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="New milestone" subtitle="Stage billing with retention" width={480} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add milestone'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Name" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. Foundation complete" /></Field>
        <Field T={T} label="Amount"><TextField T={T} type="number" value={f.amount} onChange={(v: any) => set('amount', v)} placeholder="0" /></Field>
        <Field T={T} label="Retention %"><TextField T={T} type="number" value={f.retention_pct} onChange={(v: any) => set('retention_pct', v)} /></Field>
        <Field T={T} label="Sort order"><TextField T={T} type="number" value={f.sort_order} onChange={(v: any) => set('sort_order', v)} /></Field>
      </FormGrid>
      {err && <div style={errBox(T)}>⚠ {err}</div>}
    </Modal>
  );
}

function TaskModal({ T, pid, onClose, onSaved }: { T: Theme; pid: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useS<any>({ title: '', priority: 'medium', due_date: addDays(today(), 7), description: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.title.trim()) { setErr('Task title is required.'); return; }
    setBusy(true); setErr(null);
    try { await API.task.create({ title: f.title.trim(), priority: f.priority, status: 'not_started', due_date: f.due_date, project_id: pid, description: f.description || undefined, category: 'other' }); onSaved(); }
    catch (e: any) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="New task" subtitle="Tracked against this project" width={480} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add task'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Title" full><TextField T={T} value={f.title} onChange={(v: any) => set('title', v)} placeholder="e.g. Order rebar for slab" /></Field>
        <Field T={T} label="Priority"><SelectField T={T} value={f.priority} options={PRIORITIES} onChange={(v: any) => set('priority', v)} /></Field>
        <Field T={T} label="Due date"><TextField T={T} type="date" value={f.due_date} onChange={(v: any) => set('due_date', v)} /></Field>
        <Field T={T} label="Notes" full><TextField T={T} value={f.description} onChange={(v: any) => set('description', v)} placeholder="optional" /></Field>
      </FormGrid>
      {err && <div style={errBox(T)}>⚠ {err}</div>}
    </Modal>
  );
}

const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th = (T: Theme, right?: boolean): React.CSSProperties => ({ textAlign: right ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` });
const td = (T: Theme): React.CSSProperties => ({ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: T.inkMid });
const empty = (T: Theme): React.CSSProperties => ({ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 });
const errBox = (T: Theme): React.CSSProperties => ({ marginTop: 12, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 });
function mini(T: Theme): React.CSSProperties { return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid }; }
