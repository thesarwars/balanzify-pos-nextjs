'use client';
// ─────────────────────────────────────────────────────────────────
// Tax Rates — individual rates, and tax groups that combine them
// (GST@18% = CGST@10% + SGST@8%). A group's rate is always the sum
// of its components, computed server-side.
//
// A rate marked "for tax group only" is a component: it is hidden
// from the product/purchase tax pickers but selectable inside groups.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Badge, Panel, Modal, Field, TextField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState, useEffect, useCallback } = React;

const pct = (n: any) => `${(Number(n) || 0).toFixed(2)}%`;

export function TaxRates({ T }: { T: any }) {
  const [rates, setRates] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rateEdit, setRateEdit] = useState<any>(null);
  const [groupEdit, setGroupEdit] = useState<any>(null);
  const [delFor, setDelFor] = useState<any>(null);   // { kind: 'rate'|'group', row }
  const [show, node] = useToast();

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      API.taxRate.list({ all: true }).catch(() => []),
      API.taxRate.groups().catch(() => []),
    ]).then(([r, g]: any[]) => { setRates(r || []); setGroups(g || []); }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function doDelete() {
    const { kind, row } = delFor;
    try {
      if (kind === 'rate') await API.taxRate.remove(row.id);
      else await API.taxRate.removeGroup(row.id);
      setDelFor(null); show(kind === 'rate' ? 'Tax rate deleted' : 'Tax group deleted'); reload();
    } catch (e: any) { setDelFor(null); show(e.message || 'Could not delete.'); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` };
  const td: React.CSSProperties = { padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13 };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Tax Rates" subtitle="Manage your tax rates" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Tax rates ── */}
          <Panel T={T} pad={false}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${T.line}` }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>All your tax rates</div>
                <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 2 }}>Rates marked “for tax group only” are components, hidden from the product and purchase pickers.</div>
              </div>
              <Btn T={T} kind="accent" onClick={() => setRateEdit({ name: '', amount: '', for_tax_group_only: false })}>+ Add</Btn>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Name</th><th style={th}>Tax rate %</th><th style={{ ...th, textAlign: 'right' }}>Action</th></tr></thead>
              <tbody>
                {rates.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 600, color: T.ink }}>
                      {r.name}
                      {r.for_tax_group_only && <span style={{ marginLeft: 8 }}><Badge T={T} tone="gray">group only</Badge></span>}
                      {r.is_default && <span style={{ marginLeft: 6 }}><Badge T={T} tone="green">default</Badge></span>}
                    </td>
                    <td style={{ ...td, fontFamily: T.fMono, color: T.inkSub }}>{pct(r.amount)}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' } as React.CSSProperties}>
                      <Btn T={T} kind="ghost" onClick={() => setRateEdit({ ...r, amount: String(r.amount) })} style={{ marginRight: 8 }}>Edit</Btn>
                      <Btn T={T} kind="danger" onClick={() => setDelFor({ kind: 'rate', row: r })}>Delete</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div style={{ padding: 34, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>Loading…</div>}
            {!loading && !rates.length && <div style={{ padding: 34, textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>No tax rates yet.</div>}
          </Panel>

          {/* ── Tax groups ── */}
          <Panel T={T} pad={false}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${T.line}` }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>Tax groups <span style={{ fontWeight: 400, color: T.inkSub }}>(combination of multiple taxes)</span></div>
                <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 2 }}>A group’s rate is always the sum of its taxes.</div>
              </div>
              <Btn T={T} kind="accent" onClick={() => setGroupEdit({ name: '', tax_ids: [] })} disabled={rates.length < 2}>+ Add</Btn>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Name</th><th style={th}>Tax rate %</th><th style={th}>Sub taxes</th><th style={{ ...th, textAlign: 'right' }}>Action</th></tr></thead>
              <tbody>
                {groups.map((g: any) => (
                  <tr key={g.id}>
                    <td style={{ ...td, fontWeight: 600, color: T.ink }}>{g.name}</td>
                    <td style={{ ...td, fontFamily: T.fMono, color: T.inkSub }}>{pct(g.amount)}</td>
                    <td style={{ ...td, color: T.inkSub }}>{g.sub_taxes.map((s: any) => s.name).join(' + ') || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' } as React.CSSProperties}>
                      <Btn T={T} kind="ghost" onClick={() => setGroupEdit({ ...g })} style={{ marginRight: 8 }}>Edit</Btn>
                      <Btn T={T} kind="danger" onClick={() => setDelFor({ kind: 'group', row: g })}>Delete</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !groups.length && (
              <div style={{ padding: 34, textAlign: 'center', color: T.inkMute, fontSize: 13, lineHeight: 1.6 } as React.CSSProperties}>
                No tax groups yet.{rates.length < 2 && <div style={{ marginTop: 4 }}>Add at least two tax rates first.</div>}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {rateEdit && <RateModal T={T} initial={rateEdit} onClose={() => setRateEdit(null)} onSaved={() => { setRateEdit(null); show('Tax rate saved'); reload(); }} />}
      {groupEdit && <GroupModal T={T} initial={groupEdit} rates={rates} onClose={() => setGroupEdit(null)} onSaved={() => { setGroupEdit(null); show('Tax group saved'); reload(); }} />}
      {delFor && (
        <Modal T={T} title={delFor.kind === 'rate' ? 'Delete tax rate?' : 'Delete tax group?'} width={430} onClose={() => setDelFor(null)}
          footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={() => setDelFor(null)}>Close</Btn><Btn T={T} kind="danger" onClick={doDelete}>Delete</Btn></>}>
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>
            Delete “{delFor.row.name}”? It stays on past transactions for the audit trail and is only removed from future pickers.
          </div>
        </Modal>
      )}
      {node}
    </div>
  );
}

function RateModal({ T, initial, onClose, onSaved }: { T: any; initial: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<any>(null);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const isEdit = !!initial.id;

  async function save() {
    if (!String(f.name || '').trim()) { setErr('Name is required.'); return; }
    const amt = Number(f.amount);
    if (!Number.isFinite(amt) || amt < 0 || amt > 100) { setErr('Tax rate must be between 0 and 100.'); return; }
    setBusy(true); setErr(null);
    const body = { name: String(f.name).trim(), amount: amt, for_tax_group_only: !!f.for_tax_group_only };
    try {
      if (isEdit) await API.taxRate.update(f.id, body); else await API.taxRate.create(body);
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not save.'); setBusy(false); }
  }

  return (
    <Modal T={T} title={isEdit ? 'Edit tax rate' : 'Add tax rate'} width={480} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Name *" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. VAT@10%" /></Field>
        <Field T={T} label="Tax rate % *" full><TextField T={T} type="number" value={f.amount} onChange={(v: any) => set('amount', v)} placeholder="10" /></Field>
      </FormGrid>
      <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', marginTop: 12 }}>
        <input type="checkbox" checked={!!f.for_tax_group_only} onChange={(e: any) => set('for_tax_group_only', e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: T.accent.base, cursor: 'pointer' }} />
        <span>
          <span style={{ display: 'block', fontSize: 13, color: T.ink, fontWeight: 600 }}>For tax group only</span>
          <span style={{ display: 'block', fontSize: 11.5, color: T.inkSub, marginTop: 1 }}>Usable inside a tax group, hidden from the product and purchase tax pickers.</span>
        </span>
      </label>
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function GroupModal({ T, initial, rates, onClose, onSaved }: { T: any; initial: any; rates: any[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial.name || '');
  const [picked, setPicked] = useState<string[]>(initial.tax_ids || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<any>(null);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const total = rates.filter((r) => picked.includes(r.id)).reduce((s, r) => s + Number(r.amount || 0), 0);
  const isEdit = !!initial.id;

  async function save() {
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (picked.length < 2) { setErr('A tax group needs at least two taxes.'); return; }
    setBusy(true); setErr(null);
    try {
      if (isEdit) await API.taxRate.updateGroup(initial.id, { name: name.trim(), tax_ids: picked });
      else await API.taxRate.createGroup({ name: name.trim(), tax_ids: picked });
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not save.'); setBusy(false); }
  }

  return (
    <Modal T={T} title={isEdit ? 'Edit tax group' : 'Add tax group'} width={520} onClose={onClose}
      footer={<>
        <div style={{ flex: 1, fontSize: 13.5, color: T.inkSub }}>Group rate <b style={{ color: T.ink, fontFamily: T.fMono, marginLeft: 6, fontSize: 15 }}>{pct(total)}</b></div>
        <Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
      </>}>
      <FormGrid>
        <Field T={T} label="Name *" full><TextField T={T} value={name} onChange={setName} placeholder="e.g. GST@18%" /></Field>
      </FormGrid>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 } as React.CSSProperties}>Sub taxes · pick at least two</div>
        <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, maxHeight: 240, overflowY: 'auto' }}>
          {rates.map((r: any, i: number) => (
            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
              <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} style={{ width: 15, height: 15, accentColor: T.accent.base, cursor: 'pointer' }} />
              <span style={{ flex: 1, fontSize: 13, color: T.ink, fontWeight: 500 }}>{r.name}</span>
              <span style={{ fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>{pct(r.amount)}</span>
            </label>
          ))}
          {!rates.length && <div style={{ padding: 20, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>Add tax rates first.</div>}
        </div>
        <div style={{ fontSize: 11, color: T.inkMute, marginTop: 6 }}>
          {picked.length ? rates.filter((r) => picked.includes(r.id)).map((r) => r.name).join(' + ') + ` = ${pct(total)}` : 'Nothing selected.'}
        </div>
      </div>
      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}
