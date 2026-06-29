'use client';
// Top-level safety net. If anything in the root layout throws, React would
// otherwise unmount the whole tree to a blank page. This replaces that white
// screen with a branded, recoverable fallback. Must render its own <html>/<body>.
import React from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '"DM Sans", system-ui, sans-serif', background: '#F6F3EE', color: '#1A1611' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div role="alert" style={{ maxWidth: 440, textAlign: 'center', background: '#FFFDF9', border: '1px solid #EFEAE0', borderRadius: 14, boxShadow: '0 8px 18px rgba(40,30,12,0.08)', padding: '40px 32px' }}>
            <div aria-hidden style={{ fontSize: 34, color: '#961717', marginBottom: 10 }}>⚠</div>
            <h1 style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>Something went wrong</h1>
            <p style={{ fontSize: 13.5, color: '#7A7264', margin: '0 0 22px' }}>
              The app hit an unexpected error. Your data is safe — try reloading this screen.
            </p>
            <button onClick={() => reset()} style={{ padding: '11px 22px', borderRadius: 10, border: 'none', background: '#B6862C', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
