'use client';
// ─────────────────────────────────────────────────────────────────
// Login — two-pane auth screen (AUTH_COMPONENTS.md §2).
// Espresso brand banner + light form panel. Authorizes via POST /oauth/token.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { AuthBrand } from '@/components/auth-brand';
import { API } from '@/lib/api';

const { useState: useStateM } = React;

export default function LoginPage() {
  const T = useTheme();
  const router = useRouter();
  const prefillUser =
    typeof window !== 'undefined' ? localStorage.getItem('bz_prefill') || undefined : undefined;

  const onLogin = () => {
    if (typeof window !== 'undefined') localStorage.setItem('bz_authed', '1');
    router.push('/dashboard');
  };
  const onRegister = () => router.push('/register');

  return <Login T={T} onLogin={onLogin} onRegister={onRegister} prefillUser={prefillUser} />;
}

// ── Login ──────────────────────────────────────────────────────────
function Login({ T, onLogin, onRegister, prefillUser }: { T: Theme; onLogin: () => void; onRegister: () => void; prefillUser?: string }) {
  const [show, setShow] = useStateM(false);
  const [email, setEmail] = useStateM(prefillUser || 'amina@hodanmarket.so');
  const [pw, setPw] = useStateM(prefillUser ? '' : 'demo1234');
  const [busy, setBusy] = useStateM(false);
  const [err, setErr] = useStateM<any>(null);
  const [stage, setStage] = useStateM<'login' | 'mfa' | 'forgot' | 'sent'>('login');
  const [preToken, setPreToken] = useStateM<any>(null);
  const [code, setCode] = useStateM('');
  const [fgEmail, setFgEmail] = useStateM('');

  async function submit(e: any) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res: any = await API.auth.login(email, pw);
      if (res && res.mfa_required) { setPreToken(res.pre_token); setStage('mfa'); setBusy(false); return; }
      onLogin();
    } catch (ex: any) {
      setErr(ex.message || 'Sign in failed. Check your credentials.');
      setBusy(false);
    }
  }
  async function submitMfa(e: any) {
    e.preventDefault();
    if (!code.trim()) return;
    setErr(null); setBusy(true);
    try { await API.auth.mfaVerify(preToken, code.trim()); onLogin(); }
    catch (ex: any) { setErr(ex.message || 'Invalid code. Try again.'); setBusy(false); }
  }
  async function submitForgot(e: any) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try { await API.auth.forgotPassword((fgEmail.trim() || email)); setStage('sent'); setBusy(false); }
    catch (ex: any) { setErr(ex.message || 'Could not send the reset link.'); setBusy(false); }
  }
  function backToLogin() { setStage('login'); setErr(null); setCode(''); setBusy(false); }

  const features = [
    ['◈', 'Zaad, EVC Plus & M-Pesa', 'Mobile money built into every sale'],
    ['◫', 'Works offline', 'Keep selling, syncs when you reconnect'],
    ['✦', 'AI insights', 'In Somali, Arabic & English'],
  ];
  const stats = [
    ['2,400+', 'shops'],
    ['12M+', 'sales rung'],
    ['4', 'countries and growing'],
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: T.fBody, background: T.paperAlt } as React.CSSProperties}>
      {/* brand banner */}
      <AuthBrand T={T} badge="Built for East-African retail" maxWidth={460}>
        <h1 style={{ color: '#fff', fontFamily: T.fDisplay, fontSize: 40, fontWeight: T.dispWeight, lineHeight: 1.12, letterSpacing: '-1.2px', margin: '0 0 18px' }}>
          Run your shop from<br />one calm <span style={{ color: T.accent.bright }}>counter.</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: 14.5, lineHeight: 1.65, margin: '0 0 36px' }}>
          POS, inventory, pharmacy, hotel, HR and credit — one warm, fast platform trusted by shops across Somaliland, Somalia, Kenya &amp; Ethiopia.
        </p>
        {/* feature list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {features.map(([ic, title, sub], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: T.accent.bright, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{ic}</span>
              <div>
                <div style={{ color: '#fff', fontSize: 13.5, fontWeight: 600 }}>{title}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5, marginTop: 1 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
        {/* trust stats */}
        <div style={{ display: 'flex', gap: 26, marginTop: 40, paddingTop: 26, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {stats.map(([n, lbl], i) => (
            <div key={i}>
              <div style={{ color: '#fff', fontFamily: T.fMono, fontSize: 20, fontWeight: 500, letterSpacing: '-0.5px' }}>{n}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11.5, marginTop: 2 }}>{lbl}</div>
            </div>
          ))}
        </div>
      </AuthBrand>

      {/* form panel */}
      <div style={{ width: 'min(480px, 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, background: T.paperAlt } as React.CSSProperties}>
        <div style={{ width: '100%', maxWidth: 372 }}>
          {/* mobile-only mini logo */}
          <div className="login-mini-logo" style={{ display: 'none', alignItems: 'center', gap: 11, marginBottom: 26 } as React.CSSProperties}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: `linear-gradient(150deg, ${T.accent.bright}, ${T.accent.base})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fDisplay, fontWeight: 700, fontSize: 21, color: '#fff' }}>B</div>
            <span style={{ color: T.ink, fontSize: 19, fontWeight: 700, letterSpacing: '-0.3px' }}>Balanzify</span>
          </div>

          {stage === 'login' && (<>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: T.fDisplay, fontSize: 30, fontWeight: T.dispWeight, color: T.ink, letterSpacing: '-0.8px' }}>Welcome back</div>
              <div style={{ fontSize: 13.5, color: T.inkSub, marginTop: 5 }}>Sign in to your Balanzify account</div>
            </div>
            <form onSubmit={submit}>
              <Lbl T={T}>Email address</Lbl>
              <IconInp T={T} icon="✉" type="email" placeholder="you@business.com" value={email} onChange={(e: any) => { setEmail(e.target.value); setErr(null); }} />
              <div style={{ height: 16 }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Lbl T={T} noMargin>Password</Lbl>
                <button type="button" onClick={() => { setFgEmail(email); setStage('forgot'); setErr(null); }} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 600, color: T.accent.text, cursor: 'pointer' }}>Forgot?</button>
              </div>
              <IconInp T={T} icon="⚿" type={show ? 'text' : 'password'} placeholder="••••••••" value={pw} onChange={(e: any) => { setPw(e.target.value); setErr(null); }}
                trailing={<button type="button" onClick={() => setShow(!show)} style={{ background: 'none', border: 'none', color: T.inkMute, cursor: 'pointer', fontSize: 13, padding: 0 }}>{show ? '◯' : '●'}</button>} />
              <ErrBox T={T} err={err} />
              <SubmitBtn T={T} busy={busy} busyLabel="Authorizing…" label="Sign in →" marginTop={err ? 16 : 24} />
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 18px' }}>
              <span style={{ flex: 1, height: 1, background: T.line }} />
              <span style={{ fontSize: 12, color: T.inkSub }}>New to Balanzify?</span>
              <span style={{ flex: 1, height: 1, background: T.line }} />
            </div>
            <button type="button" onClick={onRegister}
              onMouseEnter={(e: any) => (e.currentTarget.style.borderColor = T.accent.base)}
              onMouseLeave={(e: any) => (e.currentTarget.style.borderColor = T.line)}
              style={{ width: '100%', padding: '13px', borderRadius: T.r, background: T.paper, border: `1.5px solid ${T.line}`, cursor: 'pointer', fontFamily: T.fBody, fontSize: 14, fontWeight: 600, color: T.ink, transition: 'border-color .15s' } as React.CSSProperties}>
              Register a business
            </button>
          </>)}

          {stage === 'mfa' && (<>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: T.fDisplay, fontSize: 30, fontWeight: T.dispWeight, color: T.ink, letterSpacing: '-0.8px' }}>Two-factor auth</div>
              <div style={{ fontSize: 13.5, color: T.inkSub, marginTop: 5 }}>Enter the 6-digit code from your authenticator app.</div>
            </div>
            <form onSubmit={submitMfa}>
              <Lbl T={T}>Authentication code</Lbl>
              <IconInp T={T} icon="🔐" inputMode="numeric" autoFocus placeholder="123456" maxLength={6} value={code}
                onChange={(e: any) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(null); }}
                style={{ fontFamily: T.fMono, letterSpacing: 4, fontSize: 17 }} />
              <ErrBox T={T} err={err} />
              <SubmitBtn T={T} busy={busy} busyLabel="Verifying…" label="Verify →" marginTop={err ? 16 : 24} />
            </form>
            <BackLink T={T} onClick={backToLogin} />
          </>)}

          {stage === 'forgot' && (<>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: T.fDisplay, fontSize: 30, fontWeight: T.dispWeight, color: T.ink, letterSpacing: '-0.8px' }}>Reset password</div>
              <div style={{ fontSize: 13.5, color: T.inkSub, marginTop: 5 }}>Enter your email and we’ll send a reset link.</div>
            </div>
            <form onSubmit={submitForgot}>
              <Lbl T={T}>Email address</Lbl>
              <IconInp T={T} icon="✉" type="email" autoFocus placeholder="you@business.com" value={fgEmail} onChange={(e: any) => { setFgEmail(e.target.value); setErr(null); }} />
              <ErrBox T={T} err={err} />
              <SubmitBtn T={T} busy={busy} busyLabel="Sending…" label="Send reset link" marginTop={err ? 16 : 24} />
            </form>
            <BackLink T={T} onClick={backToLogin} />
          </>)}

          {stage === 'sent' && (<>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: T.fDisplay, fontSize: 30, fontWeight: T.dispWeight, color: T.ink, letterSpacing: '-0.8px' }}>Check your email</div>
            </div>
            <div style={{ padding: '14px 16px', borderRadius: T.r, background: T.accent.soft, color: T.accent.text, fontSize: 13, lineHeight: 1.55 }}>
              If <b>{fgEmail.trim() || email}</b> is registered, a password-reset link is on its way. The link expires in 30 minutes.
            </div>
            <BackLink T={T} onClick={backToLogin} />
          </>)}
        </div>
      </div>

      <style>{`
        @media (max-width: 860px){ .auth-brand{ display:none !important; } .login-mini-logo{ display:flex !important; } }
      `}</style>
    </div>
  );
}

function SubmitBtn({ T, busy, busyLabel, label, marginTop = 24 }: { T: Theme; busy: boolean; busyLabel: string; label: string; marginTop?: number }) {
  return (
    <button type="submit" disabled={busy}
      onMouseDown={(e: any) => (e.currentTarget.style.transform = 'scale(0.99)')}
      onMouseUp={(e: any) => (e.currentTarget.style.transform = 'none')}
      onMouseLeave={(e: any) => (e.currentTarget.style.transform = 'none')}
      style={{
        width: '100%', marginTop, padding: '14px', borderRadius: T.r, border: 'none', cursor: busy ? 'wait' : 'pointer',
        fontFamily: T.fBody, fontSize: 15, fontWeight: 700, color: '#fff', opacity: busy ? 0.8 : 1,
        background: `linear-gradient(135deg, ${T.navyLight}, ${T.navy})`, boxShadow: '0 4px 14px rgba(15,31,61,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'transform .08s',
      } as React.CSSProperties}>
      {busy && <span style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin .7s linear infinite' }} />}
      {busy ? busyLabel : label}
    </button>
  );
}

function ErrBox({ T, err }: { T: Theme; err: any }) {
  if (!err) return null;
  return (
    <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14 }}>⚠</span>{err}
    </div>
  );
}

function BackLink({ T, onClick }: { T: Theme; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={{ width: '100%', marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: 600, color: T.inkSub }}>← Back to sign in</button>;
}

function Lbl({ T, children, noMargin }: { T: Theme; children: React.ReactNode; noMargin?: boolean }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.inkSub, marginBottom: noMargin ? 0 : 6, letterSpacing: 0.2 }}>{children}</label>;
}

// Input with a left icon (and optional right "trailing" node) + brass focus ring.
function IconInp({ T, icon, trailing, style, ...p }: any) {
  const wrap = React.useRef<HTMLDivElement>(null);
  return (
    <div ref={wrap} style={{ position: 'relative', display: 'flex', alignItems: 'center' } as React.CSSProperties}>
      <span style={{ position: 'absolute', left: 13, color: T.inkMute, fontSize: 14, pointerEvents: 'none' } as React.CSSProperties}>{icon}</span>
      <input {...p} style={{
        width: '100%', padding: trailing ? '12px 40px 12px 38px' : '12px 14px 12px 38px',
        fontSize: 14, fontFamily: T.fBody, color: T.ink, background: T.paper,
        border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s, box-shadow .15s', ...style,
      } as React.CSSProperties}
        onFocus={(e: any) => { e.target.style.borderColor = T.accent.base; e.target.style.boxShadow = `0 0 0 3px ${T.accent.soft}`; }}
        onBlur={(e: any) => { e.target.style.borderColor = T.line; e.target.style.boxShadow = 'none'; }} />
      {trailing && <span style={{ position: 'absolute', right: 13, display: 'flex', alignItems: 'center' } as React.CSSProperties}>{trailing}</span>}
    </div>
  );
}
