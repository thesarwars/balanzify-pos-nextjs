'use client';
// components/auth-brand.tsx — shared espresso brand banner for the auth screens
// (Login + Register). Implements AUTH_COMPONENTS.md §1.1: espresso radial ground,
// brass glows, masked grid texture, optional oversized "B" monogram + top sheen,
// logo row and a pill badge. The body (headline / features / step rail) is passed
// in as children. Hidden under 860px via the `.auth-brand` class.
import React from 'react';
import type { Theme } from '@/lib/theme';

export function AuthBrand({ T, badge, monogram, sheen, maxWidth = 440, children }:
  { T: Theme; badge: string; monogram?: boolean; sheen?: boolean; maxWidth?: number; children: React.ReactNode }) {
  return (
    <div className="auth-brand" style={{
      flex: 1.15, position: 'relative', overflow: 'hidden',
      padding: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      // espresso ground (the one place we hard-code, per the spec)
      background: 'radial-gradient(120% 90% at 18% 30%, #4A3320 0%, #2A1D11 50%, #140D06 100%)',
    } as React.CSSProperties}>
      {/* brass glow — top-right */}
      <div style={{ position: 'absolute', top: -130, right: -110, width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, ${T.accent.base}40 0%, transparent 68%)`, filter: 'blur(10px)', zIndex: 0 } as React.CSSProperties} />
      {/* soft brass glow — bottom-left */}
      <div style={{ position: 'absolute', bottom: -90, left: -70, width: 380, height: 380, borderRadius: '50%', background: `radial-gradient(circle, ${T.accent.base}22 0%, transparent 70%)`, filter: 'blur(12px)', zIndex: 0 } as React.CSSProperties} />
      {/* faint grid texture, radially masked */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, opacity: 0.45,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
        backgroundSize: '44px 44px',
        WebkitMaskImage: 'radial-gradient(circle at 28% 38%, #000, transparent 78%)',
        maskImage: 'radial-gradient(circle at 28% 38%, #000, transparent 78%)',
      } as React.CSSProperties} />
      {/* top sheen (register) */}
      {sheen && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160, background: 'linear-gradient(180deg, rgba(255,255,255,0.05), transparent)', zIndex: 0 } as React.CSSProperties} />}
      {/* oversized monogram (register) */}
      {monogram && <div style={{ position: 'absolute', bottom: -150, right: -50, fontFamily: T.fDisplay, fontWeight: 700, fontSize: 460, lineHeight: 1, color: 'rgba(255,255,255,0.025)', zIndex: 0, userSelect: 'none', pointerEvents: 'none' } as React.CSSProperties}>B</div>}

      <div style={{ position: 'relative', zIndex: 1, maxWidth } as React.CSSProperties}>
        {/* logo row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 26 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: `linear-gradient(150deg, ${T.accent.bright}, ${T.accent.base})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fDisplay, fontWeight: 700, fontSize: 23, color: '#fff', boxShadow: `0 6px 20px ${T.accent.base}66` }}>B</div>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>Balanzify</span>
        </div>
        {/* pill badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 13px', borderRadius: 999, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 28 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.accent.bright, boxShadow: `0 0 8px ${T.accent.bright}` }} />
          <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2 }}>{badge}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
