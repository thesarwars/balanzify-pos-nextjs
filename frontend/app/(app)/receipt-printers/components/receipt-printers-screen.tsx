'use client';
// ─────────────────────────────────────────────────────────────────
// Receipt Printers — thermal printers used to print sale receipts.
// `characters per line` drives the ESC/POS layout (58mm ≈ 32 chars,
// 80mm ≈ 42–48). Only a network printer has an address; Windows and
// Linux printers go through a local spooler.
// Exactly one printer per business may be the default.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState, useEffect, useCallback } = React;

const CONNECTIONS: [string, string][] = [['network', 'Network'], ['windows', 'Windows'], ['linux', 'Linux']];
const PROFILES: [string, string][] = [
  ['default', 'Default'], ['simple', 'Simple'], ['sp2000', 'SP2000'], ['tep200m', 'TEP-200M'], ['p822d', 'P822D'],
];
// Common paper widths, as a hint next to characters-per-line.
const paperHint = (cpl: number) => (cpl <= 34 ? '≈ 58mm paper' : cpl <= 50 ? '≈ 80mm paper' : 'wide carriage');

const blank = () => ({
  name: '', connection_type: 'network', capability_profile: 'default',
  characters_per_line: '42', ip_address: '', port: '9100', is_default: false,
});

export function ReceiptPrinters({ T }: { T: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<any>(null);
  const [delFor, setDelFor] = useState<any>(null);
  const [show, node] = useToast();

  const reload = useCallback(() => {
    setLoading(true);
    API.receiptPrinter.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const openEdit = (r: any) => setEdit({
    ...blank(), ...r,
    characters_per_line: String(r.characters_per_line),
    port: r.port == null ? '9100' : String(r.port),
  });

  async function doDelete(r: any) {
    try { await API.receiptPrinter.remove(r.id); setDelFor(null); show('Printer deleted'); reload(); }
    catch (e: any) { show(e.message || 'Could not delete.'); }
  }

  const label = (list: [string, string][], v: string) => (list.find(([k]) => k === v) || [, v])[1];
  const where = (r: any) => (r.connection_type === 'network' ? `${r.ip_address}:${r.port}` : label(CONNECTIONS, r.connection_type) + ' spooler');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Receipt Printers" subtitle={`${rows.length} printer${rows.length === 1 ? '' : 's'}`}
        right={<Btn T={T} kind="accent" onClick={() => setEdit(blank())}>+ Add printer</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Name', 'Connection', 'Profile', 'Chars/line', 'Default', ''].map((h, i) => (
                <th key={i} style={{ textAlign: i === 5 ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{r.name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub, fontFamily: T.fMono }}>{where(r)}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{label(PROFILES, r.capability_profile)}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub, fontFamily: T.fMono }}>{r.characters_per_line} <span style={{ color: T.inkMute }}>· {paperHint(r.characters_per_line)}</span></td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}` }}>{r.is_default ? <Badge T={T} tone="green">Default</Badge> : null}</td>
                    <td style={{ padding: '10px 18px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', whiteSpace: 'nowrap' } as React.CSSProperties}>
                      <Btn T={T} kind="ghost" onClick={() => openEdit(r)} style={{ marginRight: 8 }}>Edit</Btn>
                      <Btn T={T} kind="danger" onClick={() => setDelFor(r)}>Delete</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div style={{ padding: 44, textAlign: 'center', fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub } as React.CSSProperties}>Loading…</div>}
            {!loading && !rows.length && (
              <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13, lineHeight: 1.6 } as React.CSSProperties}>
                No printers yet. Receipts use a 32-character layout until you add one.
              </div>
            )}
          </Panel>
        </div>
      </div>

      {edit && <EditModal T={T} initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); show('Printer saved'); reload(); }} />}
      {delFor && (
        <Modal T={T} title="Delete printer?" width={420} onClose={() => setDelFor(null)}
          footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={() => setDelFor(null)}>Close</Btn><Btn T={T} kind="danger" onClick={() => doDelete(delFor)}>Delete</Btn></>}>
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>Delete “{delFor.name}”? Receipts fall back to the default printer’s layout.</div>
        </Modal>
      )}
      {node}
    </div>
  );
}

function EditModal({ T, initial, onClose, onSaved }: { T: any; initial: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<any>(null);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const isEdit = !!initial.id;
  const network = f.connection_type === 'network';

  // Mirrors ReceiptPrinterSchema so one bad field never discards the save.
  function validate(): string | null {
    if (!f.name.trim()) return 'Printer name is required.';
    const cpl = Number(f.characters_per_line);
    if (!Number.isInteger(cpl) || cpl < 24 || cpl > 64) return 'Characters per line must be a whole number between 24 and 64.';
    if (!network) return null;
    const host = String(f.ip_address || '').trim();
    if (!host) return 'IP address is required for a network printer.';
    const ipish = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (ipish && !host.split('.').every((o: string) => Number(o) <= 255)) return 'That IP address is not valid.';
    if (!ipish && !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host)) return 'Enter a valid IP address or hostname.';
    const port = Number(f.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 'Port must be between 1 and 65535.';
    return null;
  }

  async function save() {
    const v = validate();
    if (v) { setErr(v); return; }
    setBusy(true); setErr(null);
    const body: any = {
      name: f.name.trim(),
      connection_type: f.connection_type,
      capability_profile: f.capability_profile,
      characters_per_line: Number(f.characters_per_line),
      is_default: !!f.is_default,
      // Only a network printer has an address.
      ip_address: network ? String(f.ip_address).trim() : null,
      port: network ? Number(f.port) : null,
    };
    try {
      if (isEdit) await API.receiptPrinter.update(f.id, body);
      else await API.receiptPrinter.create(body);
      onSaved();
    } catch (e: any) {
      const errs = e && e.body && e.body.errors;
      setErr(Array.isArray(errs) && errs.length
        ? errs.map((x: any) => (x.field ? `${x.field}: ${x.message}` : x.message)).join('; ')
        : (e.message || 'Could not save.'));
      setBusy(false);
    }
  }

  const cpl = Number(f.characters_per_line);

  return (
    <Modal T={T} title={isEdit ? 'Edit printer' : 'Add printer'} width={620} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Printer name *" full>
          <TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="Short descriptive name to recognize printer" />
        </Field>
        <Field T={T} label="Connection type *">
          <SelectField T={T} value={f.connection_type} options={CONNECTIONS.map(([k]) => k)} onChange={(v: any) => set('connection_type', v)}
            render={(v: any) => (CONNECTIONS.find(([k]) => k === v) || [, v])[1]} />
        </Field>
        <Field T={T} label="Capability profile *" hint="Match your printer model; Default suits most">
          <SelectField T={T} value={f.capability_profile} options={PROFILES.map(([k]) => k)} onChange={(v: any) => set('capability_profile', v)}
            render={(v: any) => (PROFILES.find(([k]) => k === v) || [, v])[1]} />
        </Field>
        <Field T={T} label="Characters per line *" hint={Number.isFinite(cpl) && cpl >= 24 && cpl <= 64 ? paperHint(cpl) : '24–64 (58mm ≈ 32, 80mm ≈ 42)'} full>
          <TextField T={T} type="number" value={f.characters_per_line} onChange={(v: any) => set('characters_per_line', v)} placeholder="42" />
        </Field>

        {network && (
          <Field T={T} label="IP address *" full>
            <TextField T={T} value={f.ip_address} onChange={(v: any) => set('ip_address', v)} placeholder="IP address for connecting to the printer" />
          </Field>
        )}
        {network && (
          <Field T={T} label="Port *" hint="Most printers work on port 9100" full>
            <TextField T={T} type="number" value={f.port} onChange={(v: any) => set('port', v)} placeholder="9100" />
          </Field>
        )}
        {!network && (
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: T.inkSub, background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r, padding: '10px 12px', lineHeight: 1.5 }}>
            A {f.connection_type === 'windows' ? 'Windows' : 'Linux'} printer is driven by the local print spooler, so it needs no address.
          </div>
        )}
      </FormGrid>

      <label style={{ display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer', marginTop: 14 }}>
        <input type="checkbox" checked={!!f.is_default} onChange={(e: any) => set('is_default', e.target.checked)} style={{ width: 16, height: 16, accentColor: T.accent.base, cursor: 'pointer' }} />
        <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>Set as default</span>
        <span style={{ fontSize: 11.5, color: T.inkSub }}>Used to lay out receipts when none is specified</span>
      </label>

      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
    </Modal>
  );
}
