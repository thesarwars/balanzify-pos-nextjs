'use client';
// ─────────────────────────────────────────────────────────────────
// Customer Display Screen — open this page in a second tab of the
// SAME browser as the till and mirror it to the customer-facing
// monitor. The POS broadcasts the live order over a BroadcastChannel;
// between sales the carousel from Business Settings plays.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { useTheme } from '@/components/shell';
import { money } from '@/lib/theme';
import { useBusinessSettings } from '@/lib/business-settings';

export default function DisplayPage() {
  const T = useTheme();
  const bset = useBusinessSettings();
  const [order, setOrder] = React.useState<any>(null);
  const [slide, setSlide] = React.useState(0);
  const enabled = bset.display_enabled === true;
  const images: string[] = Array.isArray(bset.display_images) ? bset.display_images.filter(Boolean) : [];
  const heading = bset.display_heading || 'Welcome';

  React.useEffect(() => {
    if (!enabled || typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('bz-pos-display');
    ch.onmessage = (e) => setOrder(e.data && e.data.lines && e.data.lines.length ? e.data : null);
    return () => ch.close();
  }, [enabled]);

  React.useEffect(() => {
    if (images.length < 2) return;
    const t = setInterval(() => setSlide((n) => (n + 1) % images.length), 5000);
    return () => clearInterval(t);
  }, [images.length]);

  if (!enabled) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paperAlt }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <div style={{ fontFamily: T.fDisplay, fontSize: 22, color: T.ink, marginBottom: 8 }}>Customer display is off</div>
          <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6 }}>Enable it under Business Settings → Display Screen, then open this page in a new tab of the same browser as the POS.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0B1422', color: '#F2F0EA', overflow: 'hidden' }}>
      <div style={{ padding: '26px 40px 14px', textAlign: 'center', fontFamily: T.fDisplay, fontSize: 34, fontWeight: 600, letterSpacing: '-0.5px', whiteSpace: 'pre-wrap' }}>{heading}</div>
      {order ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 40px 30px', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #21314a' }}>
            {order.lines.map((l: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 18, padding: '13px 4px', borderBottom: '1px solid #16233a', fontSize: 20 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                <span style={{ color: '#9FB0C8', fontFamily: T.fMono }}>× {l.qty}</span>
                <span style={{ fontFamily: T.fMono, minWidth: 110, textAlign: 'right' }}>{money(l.price * l.qty)}</span>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 16 }}>
            {[['Subtotal', order.subtotal], ...(order.discount > 0 ? [['Discount', -order.discount]] : []), ...(order.tax > 0 ? [['Tax', order.tax]] : [])].map(([k, v]: any) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, color: '#9FB0C8', padding: '3px 0' }}>
                <span>{k}</span><span style={{ fontFamily: T.fMono }}>{money(Math.abs(v))}{v < 0 ? ' −' : ''}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 40, fontWeight: 700, marginTop: 8, paddingTop: 12, borderTop: '2px solid #33486a' }}>
              <span>Total</span><span style={{ fontFamily: T.fMono }}>{money(order.total)}</span>
            </div>
            {order.charged && <div style={{ marginTop: 12, textAlign: 'center', fontSize: 22, color: '#4ADE80', fontWeight: 700 }}>Thank you! {order.change > 0 ? `Change: ${money(order.change)}` : ''}</div>}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          {images.length
            ? <img src={images[slide % images.length]} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 16 }} />
            : <div style={{ fontSize: 22, color: '#6F829E' }}>Ready to serve you</div>}
        </div>
      )}
    </div>
  );
}
