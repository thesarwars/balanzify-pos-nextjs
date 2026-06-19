'use client';
// ─────────────────────────────────────────────────────────────────
// Reset password — opened from the emailed link (/reset-password?token=…).
// Sets a new password via POST /api/v1/auth/reset-password, then sends
// the user back to sign in.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { AuthBrand } from '@/components/auth-brand';
import { API } from '@/lib/api';

const { useState: useStateR } = React;

export default function ResetPasswordPage() {
  return <React.Suspense fallback={null}><ResetInner /></React.Suspense>;
}

function ResetInner() {
  const T = useTheme();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [pw, setPw] = useStateR('');
  const [confirm, setConfirm] = useStateR('');
  const [show, setShow] = useStateR(false);
  const [busy, setBusy] = useStateR(false);
  const [err, setErr] = useStateR<any>(null);
  const [done, setDone] = useStateR(false);

  async function submit(e: any) {
    e.preventDefault();
    if (pw.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (pw !== confirm) { setErr('Passwords don’t match.'); return; }
    setErr(null); setBusy(true);
    try { await API.auth.resetPassword(token, pw); setDone(true); }
    catch (ex: any) { setErr(ex.message || 'Could not reset your password. The link may have expired.'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: T.fBody, background: T.paperAlt } as React.CSSProperties}>
      <AuthBrand T={T} badge="Account security" maxWidth={460}>
        <h1 style={{ color: '#fff', fontFamily: T.fDisplay, fontSize: 40, fontWeight: T.dispWeight, lineHeight: 1.12, letterSpacing: '-1.2px', margin: '0 0 18px' }}>
          Set a new<br /><span style={{ color: T.accent.bright }}>password.</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: 14.5, lineHeight: 1.65, margin: 0 }}>
          Choose a strong password you don’t use anywhere else. All other sessions will be signed out.
        </p>
      </AuthBrand>

      <div style={{ width: 'min(480px, 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, background: T.paperAlt } as React.CSSProperties}>
        <div style={{ width: '100%', maxWidth: 372 }}>
          {!token ? (
            <Panel T={T} title="Invalid reset link" body="This link is missing its token. Request a new reset email from the sign-in page." onBack={() => router.push('/login')} />
          ) : done ? (
            <Panel T={T} title="Password reset" body="Your password has been updated. You can now sign in with it." onBack={() => router.push('/login')} backLabel="Go to sign in →" />
          ) : (
            <>
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: T.fDisplay, fontSize: 30, fontWeight: T.dispWeight, color: T.ink, letterSpacing: '-0.8px' }}>New password</div>
                <div style={{ fontSize: 13.5, color: T.inkSub, marginTop: 5 }}>Enter and confirm your new password.</div>
              </div>
              <form onSubmit={submit}>
                <Lbl T={T}>New password</Lbl>
                <Inp T={T} type={show ? 'text' : 'password'} placeholder="At least 8 characters" value={pw} onChange={(e: any) => { setPw(e.target.value); setErr(null); }}
                  trailing={<button type="button" onClick={() => setShow(!show)} style={{ background: 'none', border: 'none', color: T.inkMute, cursor: 'pointer', fontSize: 13, padding: 0 }}>{show ? '◯' : '●'}</button>} />
                <div style={{ height: 16 }} />
                <Lbl T={T}>Confirm password</Lbl>
                <Inp T={T} type={show ? 'text' : 'password'} placeholder="Re-enter password" value={confirm} onChange={(e: any) => { setConfirm(e.target.value); setErr(null); }} />
                {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
                <button type="submit" disabled={busy} style={{
                  width: '100%', marginTop: err ? 16 : 24, padding: '14px', borderRadius: T.r, border: 'none', cursor: busy ? 'wait' : 'pointer',
                  fontFamily: T.fBody, fontSize: 15, fontWeight: 700, color: '#fff', opacity: busy ? 0.8 : 1,
                  background: `linear-gradient(135deg, ${T.navyLight}, ${T.navy})`, boxShadow: '0 4px 14px rgba(15,31,61,0.35)',
                } as React.CSSProperties}>{busy ? 'Saving…' : 'Reset password'}</button>
              </form>
              <button type="button" onClick={() => router.push('/login')} style={{ width: '100%', marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: 600, color: T.inkSub }}>← Back to sign in</button>
            </>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 860px){ .auth-brand{ display:none !important; } }`}</style>
    </div>
  );
}

function Panel({ T, title, body, onBack, backLabel }: { T: Theme; title: string; body: string; onBack: () => void; backLabel?: string }) {
  return (
    <div>
      <div style={{ fontFamily: T.fDisplay, fontSize: 30, fontWeight: T.dispWeight, color: T.ink, letterSpacing: '-0.8px', marginBottom: 12 }}>{title}</div>
      <div style={{ padding: '14px 16px', borderRadius: T.r, background: T.accent.soft, color: T.accent.text, fontSize: 13, lineHeight: 1.55 }}>{body}</div>
      <button type="button" onClick={onBack} style={{ width: '100%', marginTop: 18, padding: '13px', borderRadius: T.r, background: T.paper, border: `1.5px solid ${T.line}`, cursor: 'pointer', fontFamily: T.fBody, fontSize: 14, fontWeight: 600, color: T.ink }}>{backLabel || '← Back to sign in'}</button>
    </div>
  );
}

function Lbl({ T, children }: { T: Theme; children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.inkSub, marginBottom: 6, letterSpacing: 0.2 }}>{children}</label>;
}

function Inp({ T, trailing, ...p }: any) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' } as React.CSSProperties}>
      <input {...p} style={{
        width: '100%', padding: trailing ? '12px 40px 12px 14px' : '12px 14px', fontSize: 14, fontFamily: T.fBody, color: T.ink, background: T.paper,
        border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s, box-shadow .15s',
      } as React.CSSProperties}
        onFocus={(e: any) => { e.target.style.borderColor = T.accent.base; e.target.style.boxShadow = `0 0 0 3px ${T.accent.soft}`; }}
        onBlur={(e: any) => { e.target.style.borderColor = T.line; e.target.style.boxShadow = 'none'; }} />
      {trailing && <span style={{ position: 'absolute', right: 13, display: 'flex', alignItems: 'center' } as React.CSSProperties}>{trailing}</span>}
    </div>
  );
}
