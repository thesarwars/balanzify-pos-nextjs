'use client';
// ─────────────────────────────────────────────────────────────────
// Generic DataScreen (config-driven table) + Reports, AI Insights,
// Settings, and Plan & Modules.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useSession } from '@/components/shell';
import { API } from '@/lib/api';
import { BUSINESS, CATEGORIES, DASH, DATA } from '@/lib/data';

const { useState: useStateD } = React;

// ── file-local helpers (MiniStat / Placeholder) ────────────────────
function MiniStat({ T, label, value, tone }: { T: Theme; label: any; value: any; tone?: any }) {
  return (
    <div style={{ background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r, padding: '11px 13px' }}>
      <div style={{ fontSize: 10, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: tone || T.ink, fontFamily: T.fMono, marginTop: 4, letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  );
}

function Placeholder({ T, screen }: { T: Theme; screen: any }) {
  const meta: any = { stock: ['◱', 'Stock'], suppliers: ['◈', 'Suppliers'], customers: ['◉', 'Customers'], loyalty: ['◆', 'Loyalty'], reports: ['◳', 'Reports'], insights: ['✦', 'AI Insights'] };
  const [icon, label] = meta[screen] || ['▦', 'Screen'];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.paperAlt }}>
      <Topbar T={T} title={label} subtitle="Part of the Balanzify suite" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ width: 76, height: 76, borderRadius: 20, background: T.accent.soft, color: T.accent.base, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, margin: '0 auto 20px' }}>{icon}</div>
          <div style={{ fontFamily: T.fDisplay, fontSize: 24, fontWeight: T.dispWeight, color: T.ink, letterSpacing: T.dispTrack, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6 }}>This module follows the same redesigned Ledger system. The redesign focuses on the Dashboard, Point of Sale, Products, and Sales — explore those to see the full treatment.</div>
        </div>
      </div>
    </div>
  );
}

function StatStrip({ T, stats }: { T: Theme; stats: any }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 150px), 1fr))`, gap: 14, marginBottom: 18 }}>
      {stats.map(([label, value]: any, i: number) => (
        <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '15px 18px', boxShadow: T.sh1 }}>
          <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>{label}</div>
          <div style={{ fontFamily: T.fMono, fontWeight: 500, fontSize: 24, color: T.ink, marginTop: 7, letterSpacing: '-0.8px' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function DataTable({ T, cols, rows, onRowClick }: { T: Theme; cols: any; rows: any; onRowClick?: any }) {
  const [q, setQ] = useStateD('');
  let view = rows;
  if (q.trim()) {
    const s = q.toLowerCase();
    view = view.filter((r: any) => Object.values(r).some((v: any) => typeof v !== 'object' && String(v).toLowerCase().includes(s)));
  }
  return (
    <Panel T={T} pad={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.inkMute, fontSize: 14 }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{
            width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, fontFamily: T.fBody, color: T.ink,
            background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box',
          }} />
        </div>
        <Btn T={T} kind="ghost">⤓ Export</Btn>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{cols.map((c: any, i: number) => (
            <th key={i} style={{ textAlign: c.align === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' }}>{c.label}</th>
          ))}</tr></thead>
          <tbody>
            {view.map((r: any, ri: number) => (
              <tr key={ri} onClick={() => onRowClick && onRowClick(r)} style={{ cursor: onRowClick ? 'pointer' : 'default', transition: 'background .12s' }}
                onMouseEnter={e => e.currentTarget.style.background = T.paperAlt}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {cols.map((c: any, ci: number) => (
                  <td key={ci} style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: c.align === 'r' ? 'right' : 'left', fontSize: 13, color: T.inkMid, fontFamily: c.mono ? T.fMono : T.fBody, whiteSpace: 'nowrap' }}>
                    {c.render ? c.render(r, T) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.length === 0 && <div style={{ padding: '50px 20px', textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No matches.</div>}
    </Panel>
  );
}

// derive editable form fields from a config's columns
function deriveFields(cols: any, rows: any) {
  if (!rows.length) return [];
  const r0 = rows[0];
  const editable = cols.filter((c: any) => c.key && typeof r0[c.key] !== 'object' && c.key !== 'sw' && c.key !== 'icon').slice(0, 8);
  const firstKey = editable.length ? editable[0].key : null;
  return editable.map((c: any) => {
    const isNum = typeof r0[c.key] === 'number';
    const vals = [...new Set(rows.map((r: any) => r[c.key]).filter((v: any) => v !== '' && v != null))];
    // first column is the name/identifier — always free text, never a dropdown
    const isSelect = c.key !== firstKey && !isNum && vals.length > 1 && vals.length <= 6;
    return { key: c.key, label: c.label, type: isNum ? 'number' : isSelect ? 'select' : 'text', options: isSelect ? vals : null };
  });
}

// option helpers (options can be plain strings or { value, label })
function optVal(o: any) { return o && typeof o === 'object' ? o.value : o; }
function optLabel(o: any) { return o && typeof o === 'object' ? o.label : o; }

// a config either declares its own `form` schema (faithful to the source app)
// or we derive a reasonable one from its columns.
function getFields(cfg: any) { return cfg.form || deriveFields(cfg.cols, cfg.rows); }

function blankFor(fields: any) {
  const b: any = {};
  fields.forEach((f: any) => {
    if (f.type === 'toggle') b[f.key] = f.default ?? (f.on ?? true);
    else if (f.type === 'select') b[f.key] = optVal(f.options[0]);
    else if (f.type === 'color') b[f.key] = (f.presets && f.presets[0]) || '#888888';
    else b[f.key] = '';
  });
  return b;
}

// One input per field type (text / number / textarea / select / color / toggle)
function EditField({ T, field: f, value, onChange }: { T: Theme; field: any; value: any; onChange: any }) {
  if (f.type === 'textarea') {
    return <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={f.placeholder} style={{
      width: '100%', minHeight: 78, resize: 'vertical', padding: '10px 13px', fontSize: 14, fontFamily: T.fBody, color: T.ink,
      background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', lineHeight: 1.5,
    }} onFocus={e => e.target.style.borderColor = T.accent.base} onBlur={e => e.target.style.borderColor = T.line} />;
  }
  if (f.type === 'select') {
    return <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={{
      width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: T.fBody, color: T.ink, background: T.paper,
      border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
    }}>{f.options.map((o: any) => <option key={optVal(o)} value={optVal(o)}>{optLabel(o)}</option>)}</select>;
  }
  if (f.type === 'color') {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {(f.presets || []).map((c: any) => (
        <button key={c} type="button" onClick={() => onChange(c)} style={{ width: 30, height: 30, borderRadius: 8, cursor: 'pointer', background: c, border: value === c ? `2.5px solid ${T.ink}` : `2px solid ${T.line}` }} />
      ))}
      <label style={{ width: 30, height: 30, borderRadius: 8, border: `2px dashed ${T.lineMid}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', color: T.inkSub, fontSize: 15 }}>＋
        <input type="color" value={/^#/.test(value || '') ? value : '#888888'} onChange={e => onChange(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
      </label>
    </div>;
  }
  if (f.type === 'toggle') {
    const on = value === (f.on ?? true);
    return <button type="button" onClick={() => onChange(on ? (f.off ?? false) : (f.on ?? true))} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <span style={{ width: 42, height: 24, borderRadius: 99, background: on ? T.accent.base : T.lineMid, position: 'relative', transition: 'background .18s', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
      </span>
      <span style={{ fontSize: 13, color: T.inkMid, fontWeight: 500 }}>{f.hint || (on ? 'On' : 'Off')}</span>
    </button>;
  }
  return <TextField T={T} type={f.type === 'number' ? 'number' : 'text'} value={value} onChange={onChange} placeholder={f.placeholder || (f.type === 'number' ? '0' : `Enter ${f.label.toLowerCase()}`)} />;
}

export function DataScreen({ T, id }: { T: Theme; id: any }) {
  const cfg = DATA[id];
  const [rows, setRows] = useStateD(() => cfg ? cfg.rows.slice() : []);
  const [open, setOpen] = useStateD(false);
  const [editing, setEditing] = useStateD<any>(null);
  const [form, setForm] = useStateD<any>({});
  const [confirmDel, setConfirmDel] = useStateD<any>(null);
  const [toast, toastNode] = useToast();
  React.useEffect(() => { if (cfg) { setRows(cfg.rows.slice()); setOpen(false); setEditing(null); setConfirmDel(null); } }, [id]);
  if (!cfg) return <Placeholder T={T} screen={id} />;

  const fields = getFields(cfg);
  const set = (k: any, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const noun = (cfg.add || 'Item').replace(/^\+\s*/, '').replace(/^Add\s+/i, '');
  const rowName = (r: any) => r.name || r.code || r.id || r.task || r.desc || cfg.title;

  function openAdd() { setEditing(null); setForm(blankFor(fields)); setOpen(true); }
  function openEdit(row: any) {
    setEditing(row);
    const f: any = {};
    fields.forEach((fl: any) => { f[fl.key] = row[fl.key] ?? (fl.type === 'toggle' ? (fl.off ?? false) : ''); });
    setForm(f); setOpen(true);
  }
  function save() {
    const req = fields.find((f: any) => f.required);
    if (req && !String(form[req.key] || '').trim()) { toast(`${req.label} is required`); return; }
    const parsed: any = {};
    fields.forEach((f: any) => { parsed[f.key] = f.type === 'number' ? parseFloat(form[f.key] || 0) : form[f.key]; });
    if (editing) {
      Object.assign(editing, parsed);            // mutate the shared record → reflects on POS & every other screen
      setRows((r: any) => r.slice());
      toast(`${noun} updated`);
    } else {
      const rec: any = { ...(cfg.rows[0] || {}), ...parsed };
      if (id === 'categories') {                 // scaffold a real category so POS picks it up
        rec.id = (parsed.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat-' + Date.now();
        rec.icon = '◆'; rec.count = 0;
        CATEGORIES.push(rec);
      } else if (id === 'locations') { rec.sales = 0; rec.stock = 0; }
      setRows((r: any) => [rec, ...r]);
      cfg.rows.unshift(rec);                      // persist into the shared dataset
      toast(`${noun} created`);
    }
    setOpen(false);
  }
  function doDelete(row: any) {
    setRows((r: any) => r.filter((x: any) => x !== row));
    const gi = cfg.rows.indexOf(row); if (gi >= 0) cfg.rows.splice(gi, 1);
    if (id === 'categories') { const ci = CATEGORIES.indexOf(row); if (ci >= 0) CATEGORIES.splice(ci, 1); }
    setConfirmDel(null);
    toast(`${noun} deleted`);
  }

  const mini = (danger: any) => ({ padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${danger ? T.redSoft : T.line}`, background: danger ? T.redSoft : T.paper, color: danger ? T.redText : T.inkMid });
  const actionCol = { key: '__act', label: 'Actions', align: 'r', render: (r: any) => (
    <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
      <button onClick={e => { e.stopPropagation(); openEdit(r); }} style={mini(false)}>Edit</button>
      <button onClick={e => { e.stopPropagation(); setConfirmDel(r); }} style={mini(true)}>Delete</button>
    </span>
  ) };
  const allCols = cfg.cols.concat(actionCol);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title={cfg.title} subtitle={cfg.subtitle}
        right={<>{cfg.add && <Btn T={T} kind="accent" onClick={openAdd}>{cfg.add}</Btn>}</>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          {cfg.stats && <StatStrip T={T} stats={cfg.stats} />}
          <DataTable T={T} cols={allCols} rows={rows} onRowClick={openEdit} />
        </div>
      </div>

      {open && (
        <Modal T={T} title={editing ? `Edit ${noun.toLowerCase()}` : (cfg.add ? cfg.add.replace(/^\+\s*/, '') : 'Add')}
          subtitle={editing ? rowName(editing) : `New entry for ${cfg.title}`}
          onClose={() => setOpen(false)} onSave={save} saveLabel={editing ? 'Save changes' : 'Create'}>
          <FormGrid>
            {fields.map((f: any) => (
              <Field key={f.key} T={T} label={f.label} full={f.full || (f.type !== 'number' && (f.label || '').length > 12)}>
                <EditField T={T} field={f} value={form[f.key]} onChange={(v: any) => set(f.key, v)} />
              </Field>
            ))}
          </FormGrid>
        </Modal>
      )}

      {confirmDel && (
        <Modal T={T} title={`Delete ${noun.toLowerCase()}?`} subtitle="This can't be undone." width={420}
          onClose={() => setConfirmDel(null)} onSave={() => doDelete(confirmDel)} saveLabel="Delete">
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>
            You're about to remove <b style={{ color: T.ink }}>{rowName(confirmDel)}</b> from {cfg.title.toLowerCase()}. Linked records keep their history.
          </div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}

// ── Reports ─────────────────────────────────────────────────────
export function Reports({ T }: { T: Theme }) {
  const [tab, setTab] = useStateD('overview');
  // Deterministic per-category value (not Math.random) to avoid SSR/client hydration mismatch.
  const seedByCat = React.useMemo(() => CATEGORIES.filter((c: any) => c.id !== 'all').map((c: any, i: number) => ({ name: c.name, val: Math.round(200 + (((i * 2654435761) % 100) / 100) * 1400) })), []);
  const [byCat, setByCat] = useStateD<any[]>(seedByCat);
  const max = Math.max(1, ...byCat.map((c: any) => c.val));
  // Live month-to-date KPIs in real mode; seed values are the fallback.
  const [ov, setOv] = useStateD<any>(null);
  React.useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    Promise.all([API.report.profit({ from }), API.report.dashboard()])
      .then(([p, d]: any[]) => setOv({ summary: p && p.summary, top: d && d.topProducts }))
      .catch(() => {});
    // Real revenue-by-category (null = mock mode → keep the seed chart).
    API.report.byCategory({ from }).then((cats: any) => { if (cats != null) setByCat(cats.map((c: any) => ({ name: c.name, val: Math.round(Number(c.revenue) || 0) }))); }).catch(() => {});
  }, []);
  const ovStats: any[] = ov && ov.summary
    ? [['Revenue', money0(ov.summary.revenue)], ['Gross profit', money0(ov.summary.gross_profit)], ['Transactions', String(ov.summary.transactions)], ['Avg. margin', Math.round(ov.summary.gross_margin_pct || 0) + '%']]
    : [['Revenue', money0(DASH.salesMonth)], ['Gross profit', money0(DASH.salesMonth * 0.34)], ['Transactions', '2,140'], ['Avg. margin', '34%']];
  const ovTop: any[] = (ov && Array.isArray(ov.top) && ov.top.length) ? ov.top : DASH.topProducts;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Reports" subtitle="Performance overview · This month"
        right={<><Btn T={T} kind="ghost">📅 This month ▾</Btn><Btn T={T} kind="ghost">⤓ Export</Btn></>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
            {[['overview', 'Overview'], ['commission', 'Sales Representative'], ['register', 'Cash Register']].map(([cid, lbl]) => (
              <button key={cid} onClick={() => setTab(cid)} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === cid ? 700 : 500, background: tab === cid ? T.accent.base : 'transparent', color: tab === cid ? T.accent.on : T.inkMid }}>{lbl}</button>
            ))}
          </div>

          {tab === 'overview' && (
            <>
              <StatStrip T={T} stats={ovStats} />
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
                <Panel T={T} title="Revenue by Category">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {byCat.map((c: any) => (
                      <div key={c.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12.5 }}>
                          <span style={{ color: T.inkMid }}>{c.name}</span>
                          <span style={{ fontFamily: T.fMono, color: T.ink, fontWeight: 600 }}>{money0(c.val)}</span>
                        </div>
                        <div style={{ height: 8, background: T.paperSink, borderRadius: 99 }}>
                          <div style={{ height: '100%', width: `${(c.val / max) * 100}%`, background: `linear-gradient(90deg, ${T.accent.base}, ${T.accent.bright})`, borderRadius: 99 }} />
                        </div>
                      </div>
                    ))}
                    {byCat.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>No category sales yet this month.</div>}
                  </div>
                </Panel>
                <Panel T={T} title="Top Products" pad={false}>
                  <div style={{ padding: '6px 0' }}>
                    {ovTop.map((p: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px' }}>
                        <span style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? T.accent.soft : T.paperSink, color: i === 0 ? T.accent.text : T.inkSub, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, fontFamily: T.fMono }}>{i + 1}</span>
                        <span style={{ flex: 1, fontSize: 13, color: T.ink }}>{p.name}</span>
                        <span style={{ fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.ink }}>{money(p.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </>
          )}

          {tab === 'commission' && <CommissionReport T={T} />}
          {tab === 'register' && <RegisterReport T={T} />}
        </div>
      </div>
    </div>
  );
}

// ── Sales Representative / Commission Agent report ──────────────────
export function CommissionReport({ T }: { T: Theme }) {
  const [calc, setCalc] = useStateD('invoice_value');
  const [reps, setReps] = useStateD<any[]>([]);
  const [settings, setSettings] = useStateD<any>(null);
  const [sel, setSel] = useStateD<any>(null);
  const [detail, setDetail] = useStateD<any>(null);

  React.useEffect(() => { API.report.commissionSettings().then((s: any) => { setSettings(s); setCalc(s.calculation_type); }).catch(() => {}); }, []);
  React.useEffect(() => { API.report.salesReps(calc).then(setReps).catch(() => {}); }, [calc]);
  React.useEffect(() => { if (sel) API.report.salesRep(sel, calc).then(setDetail).catch(() => {}); else setDetail(null); }, [sel, calc]);

  function setCalcType(v: any) { setCalc(v); API.report.saveCommissionSettings({ calculation_type: v }).catch(() => {}); }
  function setAgentType(v: any) { setSettings((s: any) => ({ ...s, agent_type: v })); API.report.saveCommissionSettings({ agent_type: v }).catch(() => {}); }

  const totalCommission = reps.reduce((s: number, r: any) => s + r.commission, 0);
  const totalSale = reps.reduce((s: number, r: any) => s + r.total_sale, 0);
  const tone: any = { completed: 'green', held: 'amber', refunded: 'red' };

  return (
    <>
      {/* commission settings */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', padding: '16px 20px', background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 }}>Commission agent</div>
          <div style={{ display: 'flex', background: T.paperAlt, borderRadius: 9, padding: 3, gap: 3 }}>
            {[['logged_in_user', 'Logged-in user'], ['select_from_users', "Users' list"], ['select_from_agents', 'Agents list']].map(([v, lbl]) => (
              <button key={v} onClick={() => setAgentType(v)} style={segBtn(T, !!(settings && settings.agent_type === v))}>{lbl}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 }}>Calculation</div>
          <div style={{ display: 'flex', background: T.paperAlt, borderRadius: 9, padding: 3, gap: 3 }}>
            {[['invoice_value', 'Invoice value'], ['payment_received', 'Payment received']].map(([v, lbl]) => (
              <button key={v} onClick={() => setCalcType(v)} style={segBtn(T, calc === v)}>{lbl}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: T.inkSub }}>Total commission payable</div>
          <div style={{ fontFamily: T.fMono, fontSize: 24, fontWeight: 600, color: T.accent.text }}>{money(totalCommission)}</div>
        </div>
      </div>

      <StatStrip T={T} stats={[['Sales reps', reps.filter((r: any) => r.commission_percent > 0).length], ['Total sales', money0(totalSale)], ['Commission payable', money(totalCommission)]]} />

      <Panel T={T} pad={false}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{[['Representative', 'l'], ['Role', 'l'], ['Commission %', 'r'], [calc === 'payment_received' ? 'Payment received' : 'Total sale', 'r'], ['Transactions', 'r'], ['Commission', 'r']].map(([h, a], i) => (
            <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {reps.map((r: any) => (
              <tr key={r.user_id} onClick={() => setSel(sel === r.user_id ? null : r.user_id)} style={{ cursor: 'pointer', background: sel === r.user_id ? T.accent.soft : 'transparent', transition: 'background .12s' }}
                onMouseEnter={e => { if (sel !== r.user_id) e.currentTarget.style.background = T.paperAlt; }} onMouseLeave={e => { if (sel !== r.user_id) e.currentTarget.style.background = 'transparent'; }}>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: T.navyLight, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>{r.name.split(' ').map((w: any) => w[0]).slice(0, 2).join('')}</span>
                    <b style={{ fontSize: 13, color: T.ink }}>{r.name}</b>
                  </div>
                </td>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone="gray">{r.role_name}</Badge></td>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: r.commission_percent > 0 ? T.ink : T.inkMute }}>{r.commission_percent}%</td>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, color: T.ink }}>{money(calc === 'payment_received' ? r.total_received : r.total_sale)}</td>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{r.tx_count}</td>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13.5, fontWeight: 700, color: r.commission > 0 ? T.greenText : T.inkMute }}>{money(r.commission)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {reps.length === 0 && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>GET /connector/api/sales-representative…</div>}
      </Panel>

      {detail && (
        <Panel T={T} title={`${detail.name} · transactions`} style={{ marginTop: 16 }} pad={false}>
          {detail.transactions.length === 0
            ? <div style={{ padding: 30, textAlign: 'center', color: T.inkMute, fontSize: 13 }}>No transactions attributed to this representative.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{[['Invoice', 'l'], ['Status', 'l'], ['Sale total', 'r'], ['Received', 'r'], [`Commission (${detail.commission_percent}%)`, 'r']].map(([h, a], i) => (
                  <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '10px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {detail.transactions.map((t: any) => {
                    const base = calc === 'payment_received' ? t.received : t.total;
                    return (
                      <tr key={t.id}>
                        <td style={{ padding: '10px 18px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12.5, color: T.accent.text }}>{t.id}</td>
                        <td style={{ padding: '10px 18px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={tone[t.status]}>{t.status}</Badge></td>
                        <td style={{ padding: '10px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.ink }}>{money(t.total)}</td>
                        <td style={{ padding: '10px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{money(t.received)}</td>
                        <td style={{ padding: '10px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, fontWeight: 600, color: T.greenText }}>{money(base * detail.commission_percent / 100)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          <div style={{ fontSize: 11, color: T.inkMute, padding: '10px 18px', borderTop: `1px solid ${T.line}` }}>Commission is calculated on sale value without shipping or tax, per business rules.</div>
        </Panel>
      )}
    </>
  );
}
function segBtn(T: Theme, active: any) {
  return { padding: '7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 12.5, fontWeight: active ? 700 : 500, background: active ? T.accent.base : 'transparent', color: active ? T.accent.on : T.inkMid };
}

// ── Cash Register report ────────────────────────────────────────────
export function RegisterReport({ T }: { T: Theme }) {
  const [rows, setRows] = useStateD<any[]>([]);
  const [sel, setSel] = useStateD<any>(null);
  React.useEffect(() => { API.report.registers().then(setRows).catch(() => {}); }, []);
  const tone: any = { open: 'green', closed: 'gray' };
  return (
    <>
      <StatStrip T={T} stats={[['Sessions', rows.length], ['Total collected', money0(rows.reduce((s: number, r: any) => s + r.total_sales, 0))], ['Total refunds', money0(rows.reduce((s: number, r: any) => s + (r.refunds || 0), 0))]]} />
      <Panel T={T} pad={false}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{[['Cashier', 'l'], ['Location', 'l'], ['Opened', 'l'], ['Closed', 'l'], ['Sales', 'r'], ['Expected cash', 'r'], ['Status', 'r']].map(([h, a], i) => (
            <th key={i} style={{ textAlign: a === 'r' ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} onClick={() => setSel(r)} style={{ cursor: 'pointer', transition: 'background .12s' }} onMouseEnter={e => e.currentTarget.style.background = T.paperAlt} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{r.user_name}</td>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{r.location_name}</td>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub, fontFamily: T.fMono }}>{r.opened_at}</td>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub, fontFamily: T.fMono }}>{r.closed_at || '—'}</td>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{money(r.total_sales)}</td>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 12.5, color: T.inkMid }}>{money(r.expected_cash)}</td>
                <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right' }}><Badge T={T} tone={tone[r.status]}>{r.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>GET /connector/api/cash-register-report…</div>}
      </Panel>
      {sel && (
        <Modal T={T} title={`${sel.user_name} · register`} subtitle={`${sel.location_name} · ${sel.status}`} width={460} onClose={() => setSel(null)} footer={null}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <MiniStat T={T} label="Opening cash" value={money(sel.opening_cash)} />
            <MiniStat T={T} label="Total sales" value={money(sel.total_sales)} tone={T.green} />
            <MiniStat T={T} label="Refunds" value={money(sel.refunds)} tone={sel.refunds ? T.red : T.ink} />
            <MiniStat T={T} label="Expected cash" value={money(sel.expected_cash)} />
          </div>
          <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
            <div style={{ padding: '8px 13px', background: T.paperAlt, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub }}>Payments by method</div>
            {[['cash', 'Cash'], ['zaad', 'Zaad'], ['evc', 'EVC Plus'], ['card', 'Card'], ['bank', 'Bank']].filter(([k]) => (sel.totals[k] || 0) > 0).map(([k, lbl]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 13px', borderTop: `1px solid ${T.line}`, fontSize: 13 }}><span style={{ color: T.inkMid }}>{lbl}</span><span style={{ fontFamily: T.fMono, fontWeight: 600, color: T.ink }}>{money(sel.totals[k])}</span></div>
            ))}
          </div>
          {sel.closing && (
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 8 }}>Closing count</div>
              {[['Cash', sel.closing.total_cash], ['Card slips', sel.closing.total_card], ['Cheques', sel.closing.total_cheque]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12.5 }}><span style={{ color: T.inkSub }}>{k}</span><span style={{ fontFamily: T.fMono, color: T.ink }}>{money(v)}</span></div>
              ))}
              {sel.closing.note && <div style={{ fontSize: 12, color: T.inkSub, marginTop: 6 }}>Note: {sel.closing.note}</div>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

// ── AI Insights ─────────────────────────────────────────────────
export function Insights({ T }: { T: Theme }) {
  const [asked, setAsked] = useStateD(false);
  const prompts = ['Which products should I reorder this week?', 'How did Ramadan sales compare to last year?', 'Who are my top 10 customers by spend?', 'What is my slowest-moving stock?'];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="AI Insights" subtitle="Ask about your business — in Somali, Arabic or English" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 840, margin: '0 auto' }}>
          {/* AI answer card */}
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, boxShadow: T.sh1, padding: 22, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg, ${T.accent.bright}, ${T.accent.base})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>✦</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Daily briefing</span>
              <Badge T={T} tone="brass" style={{ marginLeft: 'auto' }}>AI generated</Badge>
            </div>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: T.inkMid }}>
              Sales are <b style={{ color: T.greenText }}>up 12.4%</b> today, driven by strong <b>Drinks</b> and <b>Bakery</b> movement around midday. <b style={{ color: T.amberText }}>4 products</b> have dropped below reorder point — most urgently <b>Energy Drink</b> and <b>White Cheese 400g</b>. Cash remains your dominant tender at 42%, but <b>Zaad</b> is growing week-on-week. Consider a small bulk order from <b>Juba Foods</b> before the weekend rush.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <Btn T={T} kind="soft">📦 Create reorder list</Btn>
              <Btn T={T} kind="soft">📊 See full report</Btn>
            </div>
          </div>

          {/* prompt suggestions */}
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, margin: '4px 0 10px' }}>Suggested questions</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            {prompts.map((p, i) => (
              <button key={i} onClick={() => setAsked(true)} style={{
                textAlign: 'left', padding: '14px 16px', borderRadius: T.r, cursor: 'pointer', fontFamily: T.fBody,
                background: T.card, border: `1px solid ${T.line}`, color: T.inkMid, fontSize: 13, transition: 'all .14s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent.base; e.currentTarget.style.background = T.accent.soft; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = T.card; }}>
                <span style={{ color: T.accent.base, marginRight: 8 }}>✦</span>{p}
              </button>
            ))}
          </div>

          {/* input */}
          <div style={{ position: 'relative' }}>
            <input placeholder="Ask anything about your shop…" style={{
              width: '100%', padding: '15px 56px 15px 18px', fontSize: 14, fontFamily: T.fBody, color: T.ink,
              background: T.card, border: `1.5px solid ${T.line}`, borderRadius: T.rLg, outline: 'none', boxSizing: 'border-box', boxShadow: T.sh1,
            }} />
            <button style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: 9, border: 'none', cursor: 'pointer', background: T.accent.base, color: '#fff', fontSize: 16 }}>→</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────
const SETTINGS_DEFAULTS: any = {
  bizName: '', branch: '', currency: 'US Dollar ($)', tz: 'EAT (UTC+3)',
  taxRate: '5', taxInclusive: false, receiptFooter: 'Mahadsanid! Come again', printLogo: true,
  payCash: true, payZaad: true, payEvc: true, payCard: true,
  lowStock: true, dailySummary: true, dailySummaryTime: '21:00', expiryWarn: true, expiryDays: '14',
};

function Switch({ T, on, onChange }: { T: Theme; on: any; onChange: any }) {
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on} style={{
      width: 44, height: 26, borderRadius: 99, background: on ? T.accent.base : T.lineMid,
      position: 'relative', border: 'none', cursor: 'pointer', transition: 'background .18s', flexShrink: 0, padding: 0,
    }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

function SetInput({ T, value, onChange, suffix, width = 150, placeholder, type = 'text' }: { T: Theme; value: any; onChange: any; suffix?: any; width?: any; placeholder?: any; type?: any }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <input type={type} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={{
        width, padding: '8px 11px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper,
        border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', textAlign: suffix ? 'right' : 'left',
      }} onFocus={e => e.target.style.borderColor = T.accent.base} onBlur={e => e.target.style.borderColor = T.line} />
      {suffix && <span style={{ fontSize: 12.5, color: T.inkSub, whiteSpace: 'nowrap' }}>{suffix}</span>}
    </span>
  );
}

function SetSelect({ T, value, onChange, options }: { T: Theme; value: any; onChange: any; options: any }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={{
      padding: '8px 30px 8px 11px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper,
      border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', cursor: 'pointer',
    }}>{options.map((o: any) => <option key={o} value={o}>{o}</option>)}</select>
  );
}

const CCY_MAP: [string, string][] = [['US Dollar ($)', 'USD'], ['Somali Shilling (Sh)', 'SOS'], ['Euro (€)', 'EUR'], ['Kenyan Shilling (KSh)', 'KES'], ['UAE Dirham (AED)', 'AED']];
const ccyToCode = (disp: string) => (CCY_MAP.find(([d]) => d === disp) || ([] as any))[1] || 'USD';
const codeToCcy = (code: string) => (CCY_MAP.find(([, c]) => c === code) || CCY_MAP[0])[0];

export function Settings({ T }: { T: Theme }) {
  const session = useSession();
  const [s, setS] = useStateD(() => {
    let saved: any = {};
    try { if (typeof window !== 'undefined') saved = JSON.parse(localStorage.getItem('bz_settings') || '{}'); } catch (e) {}
    return { ...SETTINGS_DEFAULTS, bizName: (session && session.business_name) || BUSINESS.name, branch: BUSINESS.branch, ...saved };
  });
  const [dirty, setDirty] = useStateD(false);
  const [toast, toastNode] = useToast();
  const [sec, setSec] = useStateD<any>(null);   // open security modal: 'password' | 'mfa' | 'mfa-off'
  const [mfaOn, setMfaOn] = useStateD(false);
  React.useEffect(() => { setMfaOn(!!(session && session.mfa_enabled)); }, [session]);
  const set = (k: any, v: any) => { setS((p: any) => ({ ...p, [k]: v })); setDirty(true); };

  // Hydrate the Business group from the live business record (real mode).
  React.useEffect(() => {
    API.business.get().then((b: any) => {
      if (!b) return;
      setS((p: any) => ({ ...p, bizName: b.name || p.bizName, currency: b.currency ? codeToCcy(b.currency) : p.currency }));
    }).catch(() => {});
  }, []);

  async function save() {
    if (typeof window !== 'undefined') localStorage.setItem('bz_settings', JSON.stringify(s));
    if (API.config?.isReal?.()) {
      try { await API.business.update({ name: s.bizName.trim(), currency: ccyToCode(s.currency) }); }
      catch (e: any) { toast(e.message || 'Could not save business profile.'); return; }
    }
    if (s.bizName.trim()) BUSINESS.name = s.bizName.trim();
    if (s.branch.trim()) BUSINESS.branch = s.branch.trim();
    setDirty(false);
    toast('Settings saved');
  }
  function reset() { setS({ ...SETTINGS_DEFAULTS, bizName: (session && session.business_name) || BUSINESS.name, branch: BUSINESS.branch }); setDirty(true); }

  const groups = [
    { title: 'Business', rows: [
      { label: 'Business name', ctrl: <SetInput T={T} value={s.bizName} onChange={(v: any) => set('bizName', v)} width={200} /> },
      { label: 'Branch', ctrl: <SetInput T={T} value={s.branch} onChange={(v: any) => set('branch', v)} width={200} /> },
      { label: 'Currency', ctrl: <SetSelect T={T} value={s.currency} onChange={(v: any) => set('currency', v)} options={['US Dollar ($)', 'Somali Shilling (Sh)', 'Euro (€)', 'Kenyan Shilling (KSh)', 'UAE Dirham (AED)']} /> },
      { label: 'Time zone', ctrl: <SetSelect T={T} value={s.tz} onChange={(v: any) => set('tz', v)} options={['EAT (UTC+3)', 'GMT (UTC+0)', 'AST (UTC+3)', 'CET (UTC+1)']} /> },
    ] },
    { title: 'Tax & Receipts', rows: [
      { label: 'Tax rate', ctrl: <SetInput T={T} value={s.taxRate} onChange={(v: any) => set('taxRate', v)} suffix="%" width={64} type="number" /> },
      { label: 'Tax-inclusive pricing', help: 'Prices already include tax', ctrl: <Switch T={T} on={s.taxInclusive} onChange={(v: any) => set('taxInclusive', v)} /> },
      { label: 'Receipt footer', ctrl: <SetInput T={T} value={s.receiptFooter} onChange={(v: any) => set('receiptFooter', v)} width={240} /> },
      { label: 'Print logo on receipt', ctrl: <Switch T={T} on={s.printLogo} onChange={(v: any) => set('printLogo', v)} /> },
    ] },
    { title: 'Payment methods', rows: [
      { label: 'Cash', icon: '◎', ctrl: <Switch T={T} on={s.payCash} onChange={(v: any) => set('payCash', v)} /> },
      { label: 'Zaad', icon: '◈', ctrl: <Switch T={T} on={s.payZaad} onChange={(v: any) => set('payZaad', v)} /> },
      { label: 'EVC Plus', icon: '◆', ctrl: <Switch T={T} on={s.payEvc} onChange={(v: any) => set('payEvc', v)} /> },
      { label: 'Card', icon: '▭', ctrl: <Switch T={T} on={s.payCard} onChange={(v: any) => set('payCard', v)} /> },
    ] },
    { title: 'Notifications', rows: [
      { label: 'Low-stock alerts', help: 'When an item drops below its reorder point', ctrl: <Switch T={T} on={s.lowStock} onChange={(v: any) => set('lowStock', v)} /> },
      { label: 'Daily summary', ctrl: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>{s.dailySummary && <SetInput T={T} value={s.dailySummaryTime} onChange={(v: any) => set('dailySummaryTime', v)} width={84} type="time" />}<Switch T={T} on={s.dailySummary} onChange={(v: any) => set('dailySummary', v)} /></span> },
      { label: 'Expiry warnings', ctrl: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>{s.expiryWarn && <SetInput T={T} value={s.expiryDays} onChange={(v: any) => set('expiryDays', v)} suffix="days before" width={56} type="number" />}<Switch T={T} on={s.expiryWarn} onChange={(v: any) => set('expiryWarn', v)} /></span> },
    ] },
    { title: 'Security', rows: [
      { label: 'Password', help: 'Change your account password', ctrl: <Btn T={T} kind="ghost" onClick={() => setSec('password')}>Change</Btn> },
      { label: 'Two-factor authentication', help: mfaOn ? 'Enabled — required at sign-in' : 'Protect your account with an authenticator app', ctrl: mfaOn ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><Badge T={T} tone="green">On</Badge><Btn T={T} kind="ghost" onClick={() => setSec('mfa-off')}>Disable</Btn></span> : <Btn T={T} kind="ghost" onClick={() => setSec('mfa')}>Set up</Btn> },
    ] },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Settings" subtitle="Configure your business"
        right={<>
          {dirty && <span style={{ fontSize: 12, color: T.amberText, fontWeight: 600, marginRight: 2 }}>● Unsaved changes</span>}
          <Btn T={T} kind="ghost" onClick={reset}>Reset</Btn>
          <Btn T={T} kind="accent" onClick={save} style={{ opacity: dirty ? 1 : 0.55 }}>Save changes</Btn>
        </>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map(g => (
            <Panel T={T} title={g.title} key={g.title} pad={false}>
              {g.rows.map((row: any, i: number) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '13px 20px', borderBottom: i < g.rows.length - 1 ? `1px solid ${T.line}` : 'none' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    {row.icon && <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: T.accent.soft, color: T.accent.base, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>{row.icon}</span>}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, color: T.inkMid, fontWeight: 500 }}>{row.label}</span>
                      {row.help && <span style={{ display: 'block', fontSize: 11.5, color: T.inkSub, marginTop: 1 }}>{row.help}</span>}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0 }}>{row.ctrl}</span>
                </div>
              ))}
            </Panel>
          ))}
        </div>
      </div>
      {sec === 'password' && <ChangePasswordModal T={T} onClose={() => setSec(null)} />}
      {sec === 'mfa' && <MfaSetupModal T={T} onClose={() => setSec(null)} onDone={() => { setSec(null); setMfaOn(true); toast('Two-factor authentication enabled'); }} />}
      {sec === 'mfa-off' && <MfaDisableModal T={T} onClose={() => setSec(null)} onDone={() => { setSec(null); setMfaOn(false); toast('Two-factor authentication disabled'); }} />}
      {toastNode}
    </div>
  );
}

// Change password → backend revokes all sessions, so we sign out and return to login.
function ChangePasswordModal({ T, onClose }: { T: Theme; onClose: () => void }) {
  const [cur, setCur] = React.useState(''); const [nw, setNw] = React.useState(''); const [cf, setCf] = React.useState('');
  const [busy, setBusy] = React.useState(false); const [err, setErr] = React.useState<any>(null); const [done, setDone] = React.useState(false);
  async function save() {
    if (nw.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    if (nw !== cf) { setErr('Passwords don’t match.'); return; }
    setBusy(true); setErr(null);
    try { await API.auth.changePassword(cur, nw); setDone(true); }
    catch (e: any) { setErr(e.message || 'Could not change password.'); setBusy(false); }
  }
  function signOut() {
    try { API.auth.logout(); if (typeof window !== 'undefined') localStorage.removeItem('bz_authed'); } catch (e) {}
    if (typeof window !== 'undefined') window.location.href = '/login';
  }
  return (
    <Modal T={T} title="Change password" subtitle="You’ll be signed out of all devices" width={460} onClose={done ? signOut : onClose}
      footer={done
        ? <><div style={{ flex: 1 }} /><Btn T={T} kind="accent" onClick={signOut}>Sign in again →</Btn></>
        : <><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Btn></>}>
      {done ? (
        <div style={{ padding: '12px 14px', borderRadius: T.r, background: T.accent.soft, color: T.accent.text, fontSize: 13, lineHeight: 1.55 }}>Password changed. For security, all sessions were signed out — please sign in again with your new password.</div>
      ) : (
        <FormGrid>
          <Field T={T} label="Current password" full><TextField T={T} type="password" value={cur} onChange={(v: any) => { setCur(v); setErr(null); }} /></Field>
          <Field T={T} label="New password" full><TextField T={T} type="password" value={nw} onChange={(v: any) => { setNw(v); setErr(null); }} placeholder="At least 8 characters" /></Field>
          <Field T={T} label="Confirm new password" full><TextField T={T} type="password" value={cf} onChange={(v: any) => { setCf(v); setErr(null); }} /></Field>
        </FormGrid>
      )}
      {err && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

// Enrol in TOTP 2FA: setup() returns a QR + secret; enable(code) confirms it.
function MfaSetupModal({ T, onClose, onDone }: { T: Theme; onClose: () => void; onDone: () => void }) {
  const [data, setData] = React.useState<any>(null);
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false); const [err, setErr] = React.useState<any>(null);
  React.useEffect(() => { API.auth.mfaSetup().then(setData).catch((e: any) => setErr(e.message || 'Could not start setup.')); }, []);
  async function enable() {
    if (code.trim().length < 6) { setErr('Enter the 6-digit code.'); return; }
    setBusy(true); setErr(null);
    try { await API.auth.mfaEnable(code.trim()); onDone(); }
    catch (e: any) { setErr(e.message || 'Invalid code.'); setBusy(false); }
  }
  return (
    <Modal T={T} title="Two-factor authentication" subtitle="Scan the QR with an authenticator app, then enter the code" width={460} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={enable} disabled={busy || !data}>{busy ? 'Enabling…' : 'Enable 2FA'}</Btn></>}>
      {!data ? (
        <div style={{ padding: 24, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Preparing…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {data.qr_code && <img src={data.qr_code} alt="2FA QR code" style={{ width: 168, height: 168, borderRadius: T.r, border: `1px solid ${T.line}` }} />}
          <div style={{ fontSize: 11.5, color: T.inkSub, textAlign: 'center' }}>Can’t scan? Enter this key manually:</div>
          <div style={{ fontFamily: T.fMono, fontSize: 12.5, color: T.ink, background: T.paperAlt, padding: '6px 12px', borderRadius: 8, wordBreak: 'break-all', textAlign: 'center' }}>{data.secret}</div>
          <FormGrid style={{ width: '100%' }}>
            <Field T={T} label="6-digit code" full><TextField T={T} value={code} onChange={(v: any) => { setCode(String(v).replace(/\D/g, '').slice(0, 6)); setErr(null); }} placeholder="123456" /></Field>
          </FormGrid>
        </div>
      )}
      {err && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

// Turn off 2FA — re-auth with the account password.
function MfaDisableModal({ T, onClose, onDone }: { T: Theme; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = React.useState('');
  const [busy, setBusy] = React.useState(false); const [err, setErr] = React.useState<any>(null);
  async function disable() {
    if (!pw) { setErr('Enter your password.'); return; }
    setBusy(true); setErr(null);
    try { await API.auth.mfaDisable(pw); onDone(); }
    catch (e: any) { setErr(e.message || 'Could not disable 2FA.'); setBusy(false); }
  }
  return (
    <Modal T={T} title="Disable two-factor auth" subtitle="Confirm your password to turn 2FA off" width={440} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={disable} disabled={busy}>{busy ? 'Disabling…' : 'Disable 2FA'}</Btn></>}>
      <div style={{ fontSize: 12.5, color: T.inkSub, marginBottom: 12, lineHeight: 1.55 }}>Your account will no longer require a code at sign-in. You can re-enable it any time.</div>
      <FormGrid><Field T={T} label="Account password" full><TextField T={T} type="password" value={pw} onChange={(v: any) => { setPw(v); setErr(null); }} /></Field></FormGrid>
      {err && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

// ── Plan & Modules ───────────────────────────────────────────────
export function Modules({ T }: { T: Theme }) {
  const [mods, setMods] = useStateD<any[]>([]);
  const [toast, toastNode] = useToast();
  React.useEffect(() => { API.module.list().then(setMods).catch(() => {}); }, []);
  async function toggle(m: any) {
    if (m.core) { toast('Core modules are always on'); return; }
    try { const u = await API.module.setEnabled(m.key, !m.enabled); setMods((ms: any) => ms.map((x: any) => x.key === m.key ? u : x)); toast(`${m.name} ${u.enabled ? 'enabled' : 'disabled'}`); }
    catch (e: any) { toast(e.message); }
  }
  const activeCount = mods.filter((m: any) => m.enabled).length;
  const addonTotal = mods.filter((m: any) => m.addon && m.enabled).reduce((s: number, m: any) => s + (m.price || 0), 0);
  const basePrice = 49;
  const included = mods.filter((m: any) => !m.addon);   // base plan (core/pos/inventory/operations)
  const addons = mods.filter((m: any) => m.addon);      // opt-in add-ons & verticals
  const card = (m: any) => {
    const on = m.enabled;
    return (
      <button key={m.key} onClick={() => toggle(m)} style={{ textAlign: 'left', cursor: m.core ? 'default' : 'pointer', fontFamily: T.fBody, background: T.card, border: `1px solid ${on ? T.accent.base + '55' : T.line}`, borderRadius: T.rLg, padding: 18, boxShadow: T.sh1, position: 'relative', opacity: m.core ? 0.92 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: on ? T.accent.soft : T.paperSink, color: on ? T.accent.base : T.inkMute, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{m.icon}</span>
          <span style={{ width: 38, height: 22, borderRadius: 99, background: on ? T.accent.base : T.lineMid, position: 'relative', transition: 'background .2s', opacity: m.core ? 0.5 : 1 }}>
            <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{m.name}</span>
          {m.addon && <Badge T={T} tone="violet">Add-on</Badge>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11.5, color: T.inkSub }}>{m.core ? 'Core · always on' : m.requires && m.requires.length > 1 ? 'Needs ' + m.requires.filter((r: any) => r !== 'core').join(', ') : m.group + ' module'}</span>
          {m.addon
            ? <span style={{ fontFamily: T.fMono, fontSize: 13, fontWeight: 700, color: on ? T.accent.text : T.inkSub }}>{money(m.price)}<span style={{ fontSize: 9.5, color: T.inkMute }}>/mo</span></span>
            : <span style={{ fontSize: 11, color: T.greenText, fontWeight: 600 }}>Included</span>}
        </div>
      </button>
    );
  };
  const sectionLabel = (txt: string) => <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub, margin: '4px 2px 12px' }}>{txt}</div>;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Plan & Modules" subtitle="Growth plan · billed monthly" right={<Btn T={T} kind="primary">Manage billing</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ background: `linear-gradient(135deg, ${T.navy}, ${T.navyLight})`, borderRadius: T.rLg, padding: '22px 26px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Current plan</div>
              <div style={{ fontFamily: T.fDisplay, fontSize: 26, fontWeight: T.dispWeight, marginTop: 4 }}>Growth</div>
              <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{activeCount} of {mods.length} modules active{addonTotal ? ` · +${money(addonTotal)} add-ons` : ''} · renews 1 Jul</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: T.fMono, fontSize: 32, fontWeight: 500, letterSpacing: '-1px' }}>{money(basePrice + addonTotal)}<span style={{ fontSize: 15, opacity: 0.6 }}>/mo</span></div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2, fontFamily: T.fMono }}>{money(basePrice)} base{addonTotal ? ` + ${money(addonTotal)}` : ''}</div>
            </div>
          </div>
          {sectionLabel('Included in your plan')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14, marginBottom: 26 }}>
            {included.map(card)}
          </div>
          {addons.length > 0 && <>
            {sectionLabel('Add-ons')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
              {addons.map(card)}
            </div>
          </>}
        </div>
      </div>
      {toastNode}
    </div>
  );
}
