'use client';
import React from 'react';
import { API } from '@/lib/api';

// ═══════════════════════════════════════════════════════════════════
//  API DEV PANEL  —  bottom-left chip that proves the API layer is real.
//  Shows MOCK/LIVE mode, lets you set the backend base URL & flip to
//  live, simulate latency, and watch every /connector/api request as
//  it happens. This is the switch you throw when the backend is ready.
// ═══════════════════════════════════════════════════════════════════

const readCfg = (): any => {
  const cfg: any = API.config.get();
  return { mode: cfg.mode, baseUrl: cfg.baseUrl || '', latency: cfg.latency ?? 0 };
};
const readLog = (): any[] => (typeof (API.config as any).log === 'function' ? (API.config as any).log() : []);

export function ApiPanel({ T }: any) {
  const [open, setOpen] = React.useState(false);
  const [cfg, setCfg] = React.useState<any>(readCfg);
  const [log, setLog] = React.useState<any[]>(readLog);
  const [pulse, setPulse] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onLog = () => { setLog(readLog()); setPulse(true); setTimeout(() => setPulse(false), 360); };
    const onCfg = () => setCfg(readCfg());
    window.addEventListener('bz-api-log', onLog);
    window.addEventListener('bz-api-cfg', onCfg);
    return () => { window.removeEventListener('bz-api-log', onLog); window.removeEventListener('bz-api-cfg', onCfg); };
  }, []);

  const live = cfg.mode === 'live';
  const dotColor = live ? '#0E9F6E' : '#C8881A';

  return (
    <div style={{ position: 'fixed', left: 18, bottom: 18, zIndex: 9000, fontFamily: T.fBody } as React.CSSProperties}>
      {open && (
        <div style={{
          position: 'absolute', bottom: 44, left: 0, width: 360, background: '#0E1A2B', color: '#E8EDF4',
          borderRadius: 14, border: '1px solid #21314a', boxShadow: '0 18px 50px rgba(0,0,0,0.45)', overflow: 'hidden',
          animation: 'sheetUp .2s cubic-bezier(.2,.7,.3,1)',
        } as React.CSSProperties}>
          {/* header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #1d2c44', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: dotColor, boxShadow: `0 0 0 3px ${dotColor}33` }} />
              <span style={{ fontWeight: 700, fontSize: 13.5, letterSpacing: 0.2 }}>API Connection</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#7F92AD', cursor: 'pointer', fontSize: 15 }}>✕</button>
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 15 }}>
            {/* mode toggle */}
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#7F92AD', marginBottom: 7 } as React.CSSProperties}>Transport</div>
              <div style={{ display: 'flex', background: '#0A1320', borderRadius: 9, padding: 3, gap: 3 }}>
                {[['mock', 'Mock', 'In-browser'], ['live', 'Live', 'Real backend']].map(([m, lbl, sub]) => (
                  <button key={m} onClick={() => API.config.set({ mode: m } as any)} style={{
                    flex: 1, padding: '8px 6px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody,
                    background: cfg.mode === m ? (m === 'live' ? '#0E9F6E' : '#C8881A') : 'transparent',
                    color: cfg.mode === m ? '#fff' : '#9FB0C8', transition: 'background .15s',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{lbl}</div>
                    <div style={{ fontSize: 9.5, opacity: 0.8, marginTop: 1 }}>{sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* base url */}
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#7F92AD', marginBottom: 7 } as React.CSSProperties}>Backend base URL</div>
              <input value={cfg.baseUrl} placeholder="https://pos.yourdomain.com" onChange={e => API.config.set({ baseUrl: e.target.value } as any)}
                style={{ width: '100%', padding: '9px 11px', fontSize: 12, fontFamily: T.fMono, color: '#E8EDF4', background: '#0A1320', border: '1px solid #21314a', borderRadius: 8, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} />
              <div style={{ fontSize: 10.5, marginTop: 6, lineHeight: 1.5, color: '#6F829E' }}>
                Requests go to <span style={{ fontFamily: T.fMono, color: '#9FB0C8' }}>{(cfg.baseUrl || '…') + '/connector/api/…'}</span>
              </div>
            </div>

            {/* latency (mock only) */}
            {!live && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#7F92AD' } as React.CSSProperties}>Simulated latency</span>
                  <span style={{ fontSize: 11, fontFamily: T.fMono, color: '#9FB0C8' }}>{cfg.latency} ms</span>
                </div>
                <input type="range" min="0" max="1200" step="20" value={cfg.latency} onChange={e => API.config.set({ latency: Number(e.target.value) } as any)} style={{ width: '100%', accentColor: '#C8881A' }} />
              </div>
            )}

            {live && !cfg.baseUrl && (
              <div style={{ fontSize: 11.5, color: '#F0B45E', background: 'rgba(240,180,94,0.1)', border: '1px solid rgba(240,180,94,0.25)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
                Set a base URL above — live requests have nowhere to go yet.
              </div>
            )}

            {/* request log */}
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#7F92AD', marginBottom: 7 } as React.CSSProperties}>Request log</div>
              <div style={{ background: '#0A1320', borderRadius: 8, border: '1px solid #1d2c44', maxHeight: 168, overflowY: 'auto' }}>
                {log.length === 0 && <div style={{ padding: '14px', fontSize: 11.5, color: '#5F728F', textAlign: 'center' } as React.CSSProperties}>No requests yet.</div>}
                {log.map((e: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: i < log.length - 1 ? '1px solid #15233a' : 'none', fontFamily: T.fMono, fontSize: 11 }}>
                    <span style={{ color: e.ok ? '#5BC98E' : '#E47D7D', fontWeight: 700, width: 30, flexShrink: 0 }}>{e.method}</span>
                    <span style={{ color: '#C3D0E4', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.path.replace('/connector/api', '…')}</span>
                    <span style={{ color: e.ok ? '#5BC98E' : '#E47D7D', flexShrink: 0 }}>{e.status}</span>
                    <span style={{ color: '#5F728F', width: 42, textAlign: 'right', flexShrink: 0 } as React.CSSProperties}>{e.ms}ms</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* status chip */}
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13px', borderRadius: 99, cursor: 'pointer',
        background: '#0E1A2B', border: '1px solid #21314a', color: '#E8EDF4', fontFamily: T.fBody, fontSize: 12, fontWeight: 600,
        boxShadow: '0 6px 20px rgba(0,0,0,0.3)', transition: 'transform .12s',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: dotColor, boxShadow: pulse ? `0 0 0 4px ${dotColor}55` : `0 0 0 3px ${dotColor}22`, transition: 'box-shadow .3s' }} />
        {live ? 'Live API' : 'Mock API'}
        <span style={{ fontFamily: T.fMono, fontSize: 10.5, color: '#7F92AD' }}>Balanzify POS</span>
      </button>
    </div>
  );
}
