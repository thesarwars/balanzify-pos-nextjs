'use client';
// ─────────────────────────────────────────────────────────────────
// Shared primitives for the purchases screens — small styled helpers,
// PO status mapping, and the generic confirm dialog.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Modal } from '@/components/kit';

const { useState: useStatePu } = React;

export function blankLine() { return { product_id: '', qty: '', unit_id: '', unit_cost: '', discount_percent: '', selling_price: '' }; }
export function sub(T: any): React.CSSProperties { return { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.inkSub, marginBottom: 6 } as React.CSSProperties; }
// Backend PO status → the editor's three-way status.
export function formStatus(s: any): string {
  if (s === 'received' || s === 'partial' || s === 'approved') return 'received';
  if (s === 'sent' || s === 'ordered') return 'ordered';
  return 'pending';
}
// Read-only field value (used for locked fields when editing a received purchase).
export function StaticVal({ T, children }: { T: any; children: any }) {
  return <div style={{ padding: '9px 11px', fontSize: 13.5, fontFamily: T.fBody, color: T.inkMid, background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r } as React.CSSProperties}>{children || '—'}</div>;
}

// Small label / value row used in the detail header.
export function Row({ T, k, v, mono }: { T: any; k: any; v: any; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: T.inkSub }}>{k}</span>
      <span style={{ color: T.ink, fontWeight: 600, ...(mono ? { fontFamily: T.fMono } : {}) }}>{v}</span>
    </div>
  );
}

// ── Generic confirm ─────────────────────────────────────────────────
export function ConfirmModal({ T, title, body, confirmLabel, confirmKind, onConfirm, onClose }: { T: any; title: any; body: any; confirmLabel: any; confirmKind?: any; onConfirm: () => void; onClose: () => void }) {
  const [busy, setBusy] = useStatePu(false);
  return (
    <Modal T={T} title={title} width={420} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn><Btn T={T} kind={confirmKind || 'danger'} onClick={async () => { setBusy(true); await onConfirm(); }} disabled={busy}>{busy ? '…' : confirmLabel}</Btn></>}>
      <div style={{ fontSize: 13.5, color: T.inkMid, lineHeight: 1.6 }}>{body}</div>
    </Modal>
  );
}

export function miniNum(T: any): React.CSSProperties { return { width: '100%', padding: '7px 9px', fontSize: 12.5, fontFamily: T.fMono, color: T.ink, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 7, outline: 'none', boxSizing: 'border-box', textAlign: 'right' }; }

// ── Local helpers (StatStrip / MiniStat) ────────────────────────────
export function StatStrip({ T, stats }: { T: any; stats: any[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 150px), 1fr))`, gap: 14, marginBottom: 18 }}>
      {stats.map(([label, value]: any, i: number) => (
        <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '15px 18px', boxShadow: T.sh1 }}>
          <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 } as React.CSSProperties}>{label}</div>
          <div style={{ fontFamily: T.fMono, fontWeight: 500, fontSize: 24, color: T.ink, marginTop: 7, letterSpacing: '-0.8px' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

export function MiniStat({ T, label, value, tone }: { T: any; label: any; value: any; tone?: any }) {
  return (
    <div style={{ background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r, padding: '11px 13px' }}>
      <div style={{ fontSize: 10, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 } as React.CSSProperties}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: tone || T.ink, fontFamily: T.fMono, marginTop: 4, letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  );
}
