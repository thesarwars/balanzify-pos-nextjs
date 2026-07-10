'use client';
// ─────────────────────────────────────────────────────────────────
// Live preview of a sticker sheet, drawn to scale from the form's
// inch values with example label content. Uses the same barsFor()
// the printer uses, so what you see is what prints.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { barsFor } from '../../products/components/print-labels';

const SAMPLE = { name: 'Sample Product', sku: 'AS0012-BLK', price: 19.99 };

const num = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

export function SheetPreview({ T, f, bizName }: { T: any; f: any; bizName: string }) {
  const roll = !!f.is_continuous;
  const sw = num(f.sticker_width);
  const sh = num(f.sticker_height);
  const tm = num(f.top_margin);
  const lm = num(f.left_margin);
  const cg = num(f.col_distance);
  const rg = num(f.row_distance);
  const perRow = Math.max(1, Math.floor(num(f.stickers_in_one_row)) || 1);

  const ready = sw > 0 && sh > 0 && (roll || (num(f.paper_width) > 0 && num(f.paper_height) > 0));
  if (!ready) {
    return (
      <Frame T={T} caption="Enter the sticker size to see a preview.">
        <div style={{ height: 240, display: 'grid', placeItems: 'center', color: T.inkMute, fontSize: 12.5, textAlign: 'center', padding: 16 } as React.CSSProperties}>
          {roll ? 'Enter the sticker width and height.' : 'Enter the sticker and paper sizes.'}
        </div>
      </Frame>
    );
  }

  // A roll has no sheet — show a short run of labels as they feed out.
  const cols = roll ? 1 : perRow;
  const perSheet = roll ? 3 : Math.max(1, Math.floor(num(f.stickers_per_sheet)) || perRow);
  const rows = Math.max(1, Math.ceil(perSheet / cols));

  const paperW = roll ? sw : num(f.paper_width);
  const paperH = roll ? rows * sh + (rows - 1) * rg : num(f.paper_height);

  const MAX_W = 300, MAX_H = 360;
  const scale = Math.min(MAX_W / paperW, MAX_H / paperH);

  const usedW = lm + cols * sw + (cols - 1) * cg;
  const usedH = tm + rows * sh + (rows - 1) * rg;
  const overW = !roll && usedW > paperW + 0.001;
  const overH = !roll && usedH > paperH + 0.001;

  const cells = Math.min(perSheet, rows * cols);
  const caption = roll
    ? `Roll · ${sw}" × ${sh}" per label`
    : `${paperW}" × ${paperH}" paper · ${perSheet} label${perSheet === 1 ? '' : 's'} · ${cols} across × ${rows} down`;

  // At sheet scale a single label is only a few pixels of type, so show one
  // close up too — that's the thing the user is actually choosing.
  const closeScale = Math.min(300 / sw, 130 / sh);

  return (
    <Frame T={T} caption={caption}>
      <div style={{ display: 'grid', placeItems: 'center', padding: 10, background: T.paperAlt, borderRadius: T.r, marginBottom: 10 }}>
        <Sticker w={sw * closeScale} h={sh * closeScale} bizName={bizName} />
        <div style={{ fontSize: 10.5, color: T.inkMute, marginTop: 6 }}>One label · {sw}" × {sh}"</div>
      </div>

      <div style={{ display: 'grid', placeItems: 'center', padding: 12, background: T.paperAlt, borderRadius: T.r }}>
        <div style={{
          position: 'relative', width: paperW * scale, height: paperH * scale,
          background: '#fff', border: `1px solid ${overW || overH ? '#d9534f' : '#d8d2c4'}`,
          boxShadow: '0 1px 6px rgba(0,0,0,.10)', overflow: 'hidden', flexShrink: 0,
        } as React.CSSProperties}>
          <div style={{
            position: 'absolute', left: lm * scale, top: tm * scale,
            display: 'grid', gridTemplateColumns: `repeat(${cols}, ${sw * scale}px)`,
            columnGap: cg * scale, rowGap: rg * scale,
          } as React.CSSProperties}>
            {Array.from({ length: cells }).map((_, i) => (
              <Sticker key={i} w={sw * scale} h={sh * scale} bizName={bizName} />
            ))}
          </div>
        </div>
      </div>

      {(overW || overH) && (
        <div style={{ marginTop: 10, padding: '8px 11px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 11.5, lineHeight: 1.5 }}>
          {overW && <div>Row needs {usedW.toFixed(2)}" but the paper is {paperW}" wide.</div>}
          {overH && <div>{rows} rows need {usedH.toFixed(2)}" but the paper is {paperH}" tall.</div>}
        </div>
      )}
    </Frame>
  );
}

function Frame({ T, caption, children }: { T: any; caption: string; children: any }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 7 } as React.CSSProperties}>Preview</div>
      {children}
      <div style={{ fontSize: 11, color: T.inkMute, marginTop: 7, lineHeight: 1.45 }}>{caption}</div>
    </div>
  );
}

// One example label, drawn at the same proportions the printer uses.
function Sticker({ w, h, bizName }: { w: number; h: number; bizName: string }) {
  // Scale the type to the label so a 4"×1" and a 1"×0.5" both read correctly.
  const px = (frac: number, min = 4) => Math.max(min, Math.round(h * frac));
  const bars = barsFor(SAMPLE.sku);
  const totalBarW = bars.reduce((s: number, b: any) => s + b.w, 0);
  const barsW = w * 0.82;
  const k = barsW / totalBarW;
  const barsH = Math.max(6, h * 0.34);

  return (
    <div style={{
      width: w, height: h, boxSizing: 'border-box', border: '1px dashed #cfc8ba',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 1, overflow: 'hidden', background: '#fff', padding: '2px 3px', textAlign: 'center',
    } as React.CSSProperties}>
      <div style={{ fontSize: px(0.11), color: '#7a7a7a', fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>{bizName}</div>
      <div style={{ fontSize: px(0.15), color: '#111', fontWeight: 700, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{SAMPLE.name}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: barsH, width: barsW }}>
        {bars.map((b: any, i: number) => (
          <span key={i} style={{ width: Math.max(0.5, b.w * k), height: '100%', background: b.on ? '#111' : 'transparent' }} />
        ))}
      </div>
      <div style={{ fontSize: px(0.10), fontFamily: 'monospace', color: '#333', letterSpacing: 0.3, lineHeight: 1, whiteSpace: 'nowrap' }}>{SAMPLE.sku}</div>
      <div style={{ fontSize: px(0.17), fontWeight: 700, color: '#111', lineHeight: 1 }}>${SAMPLE.price.toFixed(2)}</div>
    </div>
  );
}
