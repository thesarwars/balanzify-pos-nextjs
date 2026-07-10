'use client';
// ─────────────────────────────────────────────────────────────────
// Barcode sticker sheet settings — the physical geometry the label
// printer uses. All lengths are inches. A continuous-feed roll has no
// sheet, so paper size and stickers-per-sheet drop away for it.
// Exactly one setting per business may be the default.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Badge, Panel, Modal, Field, TextField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState, useEffect, useCallback } = React;

const blank = () => ({
  name: '', description: '', is_continuous: false,
  top_margin: '0', left_margin: '0',
  sticker_width: '', sticker_height: '',
  paper_width: '', paper_height: '',
  stickers_in_one_row: '', row_distance: '0', col_distance: '0',
  stickers_per_sheet: '', is_default: false,
});

export function BarcodeSettings({ T }: { T: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<any>(null);      // form object, or null
  const [delFor, setDelFor] = useState<any>(null);
  const [show, node] = useToast();

  const reload = useCallback(() => {
    setLoading(true);
    API.barcodeSetting.list().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const openEdit = (r: any) => setEdit({
    ...blank(), ...r,
    top_margin: String(r.top_margin), left_margin: String(r.left_margin),
    sticker_width: String(r.sticker_width), sticker_height: String(r.sticker_height),
    paper_width: r.paper_width == null ? '' : String(r.paper_width),
    paper_height: r.paper_height == null ? '' : String(r.paper_height),
    stickers_in_one_row: String(r.stickers_in_one_row),
    row_distance: String(r.row_distance), col_distance: String(r.col_distance),
    stickers_per_sheet: String(r.stickers_per_sheet),
  });

  async function doDelete(r: any) {
    try { await API.barcodeSetting.remove(r.id); setDelFor(null); show('Barcode setting deleted'); reload(); }
    catch (e: any) { show(e.message || 'Could not delete.'); }
  }

  const dims = (r: any) => r.is_continuous
    ? `Roll · ${r.sticker_width}" × ${r.sticker_height}"`
    : `${r.stickers_per_sheet} per sheet · ${r.paper_width}" × ${r.paper_height}" · label ${r.sticker_width}" × ${r.sticker_height}"`;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Barcode Settings" subtitle={`${rows.length} sticker sheet${rows.length === 1 ? '' : 's'}`}
        right={<Btn T={T} kind="accent" onClick={() => setEdit(blank())}>+ Add barcode sticker setting</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Panel T={T} pad={false}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Name', 'Description', 'Layout', 'Default', ''].map((h, i) => (
                <th key={i} style={{ textAlign: i === 4 ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` } as React.CSSProperties}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: T.ink }}>{r.name}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, color: T.inkSub }}>{r.description || '—'}</td>
                    <td style={{ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 12, color: T.inkSub, fontFamily: T.fMono }}>{dims(r)}</td>
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
            {!loading && !rows.length && <div style={{ padding: 44, textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>No barcode settings yet. Add one to control the sticker sheet the label printer uses.</div>}
          </Panel>
        </div>
      </div>

      {edit && <EditModal T={T} initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); show('Barcode setting saved'); reload(); }} />}
      {delFor && (
        <Modal T={T} title="Delete barcode setting?" width={420} onClose={() => setDelFor(null)}
          footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={() => setDelFor(null)}>Close</Btn><Btn T={T} kind="danger" onClick={() => doDelete(delFor)}>Delete</Btn></>}>
          <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>Delete “{delFor.name}”? Any label printing that used it falls back to the default sheet.</div>
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

  const num = (v: any) => (v === '' || v == null ? NaN : Number(v));

  // Mirrors the backend BarcodeSettingSchema so one bad field never discards the save.
  function validate(): string | null {
    if (!f.name.trim()) return 'Sticker sheet setting name is required.';
    if (!(num(f.sticker_width) > 0)) return 'Width of sticker must be greater than 0.';
    if (!(num(f.sticker_height) > 0)) return 'Height of sticker must be greater than 0.';
    const perRow = num(f.stickers_in_one_row);
    if (!(perRow >= 1)) return 'Stickers in one row must be at least 1.';
    if (f.is_continuous) return null;
    if (!(num(f.paper_width) > 0)) return 'Paper width is required for sheet stock.';
    if (!(num(f.paper_height) > 0)) return 'Paper height is required for sheet stock.';
    if (!(num(f.stickers_per_sheet) >= 1)) return 'No. of stickers per sheet is required for sheet stock.';
    const used = num(f.left_margin || 0) + perRow * num(f.sticker_width) + (perRow - 1) * num(f.col_distance || 0);
    if (used > num(f.paper_width) + 0.001) {
      return `${perRow} stickers of ${f.sticker_width}" need ${used.toFixed(2)}" but the paper is ${f.paper_width}" wide.`;
    }
    return null;
  }

  async function save() {
    const v = validate();
    if (v) { setErr(v); return; }
    setBusy(true); setErr(null);
    const body: any = {
      name: f.name.trim(), description: f.description.trim() || null,
      is_continuous: !!f.is_continuous,
      top_margin: Number(f.top_margin || 0), left_margin: Number(f.left_margin || 0),
      sticker_width: Number(f.sticker_width), sticker_height: Number(f.sticker_height),
      stickers_in_one_row: Number(f.stickers_in_one_row),
      row_distance: Number(f.row_distance || 0), col_distance: Number(f.col_distance || 0),
      is_default: !!f.is_default,
      // A roll has no sheet; the backend also nulls these, but don't send junk.
      paper_width: f.is_continuous ? null : Number(f.paper_width),
      paper_height: f.is_continuous ? null : Number(f.paper_height),
      stickers_per_sheet: f.is_continuous ? 0 : Number(f.stickers_per_sheet),
    };
    try {
      if (isEdit) await API.barcodeSetting.update(f.id, body);
      else await API.barcodeSetting.create(body);
      onSaved();
    } catch (e: any) {
      const errs = e && e.body && e.body.errors;
      setErr(Array.isArray(errs) && errs.length
        ? errs.map((x: any) => (x.field ? `${x.field}: ${x.message}` : x.message)).join('; ')
        : (e.message || 'Could not save.'));
      setBusy(false);
    }
  }

  const Inches = ({ k, label }: { k: string; label: string }) => (
    <Field T={T} label={`${label} (in inches)`}>
      <TextField T={T} type="number" value={f[k]} onChange={(v: any) => set(k, v)} placeholder="0" />
    </Field>
  );

  return (
    <Modal T={T} title={isEdit ? 'Edit barcode sticker setting' : 'Add barcode sticker setting'} width={720} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Sticker sheet setting name *" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. 20 per sheet (Avery 5160)" /></Field>
        <Field T={T} label="Sticker sheet setting description" full>
          <textarea value={f.description} onChange={(e: any) => set('description', e.target.value)} rows={2}
            style={{ width: '100%', padding: '9px 11px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', resize: 'vertical', boxSizing: 'border-box' } as React.CSSProperties} />
        </Field>
      </FormGrid>

      <label style={{ display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer', margin: '14px 0 4px' }}>
        <input type="checkbox" checked={!!f.is_continuous} onChange={(e: any) => set('is_continuous', e.target.checked)} style={{ width: 16, height: 16, accentColor: T.accent.base, cursor: 'pointer' }} />
        <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>Continuous feed or rolls</span>
        <span style={{ fontSize: 11.5, color: T.inkSub }}>No sheet — labels print one after another</span>
      </label>

      <FormGrid cols={2}>
        <Inches k="top_margin" label="Additional top margin" />
        <Inches k="left_margin" label="Additional left margin" />
        <Inches k="sticker_width" label="Width of sticker *" />
        <Inches k="sticker_height" label="Height of sticker *" />
        {!f.is_continuous && <Inches k="paper_width" label="Paper width *" />}
        {!f.is_continuous && <Inches k="paper_height" label="Paper height *" />}
        <Field T={T} label="Stickers in one row *"><TextField T={T} type="number" value={f.stickers_in_one_row} onChange={(v: any) => set('stickers_in_one_row', v)} placeholder="e.g. 3" /></Field>
        {!f.is_continuous && <Field T={T} label="No. of stickers per sheet *"><TextField T={T} type="number" value={f.stickers_per_sheet} onChange={(v: any) => set('stickers_per_sheet', v)} placeholder="e.g. 30" /></Field>}
        <Inches k="row_distance" label="Distance between two rows" />
        <Inches k="col_distance" label="Distance between two columns" />
      </FormGrid>

      <label style={{ display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer', marginTop: 14 }}>
        <input type="checkbox" checked={!!f.is_default} onChange={(e: any) => set('is_default', e.target.checked)} style={{ width: 16, height: 16, accentColor: T.accent.base, cursor: 'pointer' }} />
        <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>Set as default</span>
        <span style={{ fontSize: 11.5, color: T.inkSub }}>Preselected when printing labels</span>
      </label>

      {err && <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
    </Modal>
  );
}
