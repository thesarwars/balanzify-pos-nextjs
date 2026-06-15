'use client';
// ─────────────────────────────────────────────────────────────────
// Business Registration — the manual's first flow ("Register a new
// business"). Three steps: Business details → Tax → Admin user,
// then a review, then POST /business/register. On success it hands
// back the new username so Login can prefill it.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { AuthBrand } from '@/components/auth-brand';
import { API } from '@/lib/api';

const { useState: useStateRg, useEffect: useEffectRg } = React;

export default function RegisterPage() {
  const T = useTheme();
  const router = useRouter();

  const onBackToLogin = () => router.push('/login');
  const onRegistered = (username: any) => {
    if (typeof window !== 'undefined') localStorage.setItem('bz_prefill', username);
    router.push('/login');
  };

  return <RegisterBusiness T={T} onRegistered={onRegistered} onBackToLogin={onBackToLogin} />;
}

const REG_STEPS = [
  ['Business', 'Name, currency & time zone'],
  ['Tax', 'GST / VAT — optional'],
  ['Admin user', 'Your login credentials'],
  ['Review', 'Confirm & register'],
];

function RegisterBusiness({ T, onRegistered, onBackToLogin }: { T: Theme; onRegistered: (username: any) => void; onBackToLogin: () => void }) {
  const [step, setStep] = useStateRg(0);
  const [busy, setBusy] = useStateRg(false);
  const [err, setErr] = useStateRg<any>(null);
  const [errField, setErrField] = useStateRg<any>(null);
  const [done, setDone] = useStateRg<any>(null);
  const [currencies, setCurrencies] = useStateRg<any[]>([]);
  const [timezones, setTimezones] = useStateRg<any[]>([]);
  const [showPw, setShowPw] = useStateRg(false);

  const [biz, setBiz] = useStateRg<any>({ name: '', start_date: new Date().toISOString().slice(0, 10), currency_id: 1, time_zone: '' });
  const [tax, setTax] = useStateRg<any>({ tax_label_1: 'VAT', tax_number_1: '', tax_label_2: '', tax_number_2: '' });
  const [user, setUser] = useStateRg<any>({ name: '', email: '', username: '', password: '' });

  // Reference data from the API (GET /business/currencies, /business/timezones)
  useEffectRg(() => {
    API.business.currencies().then(setCurrencies).catch(() => {});
    API.business.timezones().then((tz: any) => { setTimezones(tz); setBiz((b: any) => ({ ...b, time_zone: tz[0] })); }).catch(() => {});
  }, []);

  const sB = (k: any, v: any) => { setBiz((b: any) => ({ ...b, [k]: v })); clearErr(k); };
  const sT = (k: any, v: any) => setTax((t: any) => ({ ...t, [k]: v }));
  const sU = (k: any, v: any) => { setUser((u: any) => ({ ...u, [k]: v })); clearErr(k === 'name' ? 'user_name' : k); };
  const clearErr = (field: any) => { if (errField === field) { setErr(null); setErrField(null); } };

  // client-side gate per step (server re-validates on register)
  function canAdvance() {
    if (step === 0) return biz.name.trim().length > 0;
    if (step === 2) return user.name.trim() && user.email.trim() && user.username.trim() && user.password.length >= 6;
    return true;
  }

  async function submit() {
    setBusy(true); setErr(null); setErrField(null);
    try {
      const res = await API.business.register({ business: biz, tax, user });
      setDone(res);
    } catch (ex: any) {
      setErr(ex.message || 'Registration failed.');
      setErrField(ex.body && ex.body.field);
      // jump back to the step that owns the offending field
      const f = ex.body && ex.body.field;
      if (['name'].includes(f)) setStep(0);
      else if (['user_name', 'email', 'username', 'password'].includes(f)) setStep(2);
    } finally { setBusy(false); }
  }

  const cur: any = currencies.find((c: any) => c.id === Number(biz.currency_id)) || {};

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: T.fBody, background: T.paperAlt } as React.CSSProperties}>
      {/* brand banner + vertical step rail */}
      <AuthBrand T={T} badge="Free to start · no card needed" monogram sheen maxWidth={440}>
        <h1 style={{ color: '#fff', fontFamily: T.fDisplay, fontSize: 38, fontWeight: T.dispWeight, lineHeight: 1.14, letterSpacing: '-1px', margin: '0 0 16px' }}>
          Set up your business<br />in a few <span style={{ color: T.accent.bright }}>minutes.</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14.5, lineHeight: 1.65, margin: '0 0 40px' }}>
          One workspace for inventory, POS, contacts and reports. The admin you create here owns the business — add more users later.
        </p>
        {/* vertical step indicator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {REG_STEPS.map(([label, sub], i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'todo';
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 0', opacity: state === 'todo' ? 0.42 : 1, transition: 'opacity .2s' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, fontFamily: T.fMono,
                  background: state === 'active' ? T.accent.base : state === 'done' ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: '#fff', border: state === 'todo' ? '1.5px solid rgba(255,255,255,0.25)' : 'none',
                  boxShadow: state === 'active' ? `0 0 0 4px ${T.accent.base}33` : 'none', transition: 'all .2s',
                }}>{state === 'done' ? '✓' : i + 1}</div>
                <div>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{label}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </AuthBrand>

      {/* form panel */}
      <div style={{ width: 'min(520px, 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, background: T.paperAlt } as React.CSSProperties}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 70, height: 70, borderRadius: '50%', background: T.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, margin: '0 auto 22px', boxShadow: '0 10px 28px rgba(14,159,110,0.4)' }}>✓</div>
              <div style={{ fontFamily: T.fDisplay, fontSize: 28, fontWeight: T.dispWeight, color: T.ink, letterSpacing: '-0.6px', marginBottom: 8 }}>You&apos;re all set</div>
              <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6, marginBottom: 6 }}>{done.message}</div>
              <div style={{ fontSize: 12.5, color: T.inkSub, marginBottom: 26 }}>Signed up as <b style={{ color: T.ink, fontFamily: T.fMono }}>{done.username}</b> · {done.role}</div>
              <button onClick={() => onRegistered(done.username)} style={primaryBtn(T)}>Go to sign in →</button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 6, fontSize: 11.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.accent.text }}>Step {step + 1} of {REG_STEPS.length}</div>
              <div style={{ fontFamily: T.fDisplay, fontSize: 27, fontWeight: T.dispWeight, color: T.ink, letterSpacing: '-0.6px' }}>{REG_STEPS[step][0]}</div>
              <div style={{ fontSize: 13, color: T.inkSub, marginTop: 5, marginBottom: 24 }}>{REG_STEPS[step][1]}</div>

              {/* STEP 0 — business */}
              {step === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                  <RField T={T} label="Business name" required error={errField === 'name'}>
                    <RInp T={T} value={biz.name} onChange={(e: any) => sB('name', e.target.value)} placeholder="e.g. Hodan Mini Market" autoFocus />
                  </RField>
                  <RField T={T} label="Start date">
                    <RInp T={T} type="date" value={biz.start_date} onChange={(e: any) => sB('start_date', e.target.value)} />
                  </RField>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <RField T={T} label="Currency" style={{ flex: 1 }}>
                      <RSelect T={T} value={biz.currency_id} onChange={(e: any) => sB('currency_id', e.target.value)}>
                        {currencies.map((c: any) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                      </RSelect>
                    </RField>
                    <RField T={T} label="Time zone" style={{ flex: 1 }}>
                      <RSelect T={T} value={biz.time_zone} onChange={(e: any) => sB('time_zone', e.target.value)}>
                        {timezones.map((tz: any) => <option key={tz} value={tz}>{tz}</option>)}
                      </RSelect>
                    </RField>
                  </div>
                </div>
              )}

              {/* STEP 1 — tax */}
              {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                  <div style={{ padding: '11px 14px', borderRadius: T.r, background: T.accent.soft, color: T.accent.text, fontSize: 12, lineHeight: 1.55 }}>
                    Tax details are optional and vary by country. You can add or change these anytime in Business Settings.
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <RField T={T} label="Tax 1 name" style={{ flex: 1 }}><RInp T={T} value={tax.tax_label_1} onChange={(e: any) => sT('tax_label_1', e.target.value)} placeholder="VAT / GST" /></RField>
                    <RField T={T} label="Tax 1 number" style={{ flex: 1.3 }}><RInp T={T} value={tax.tax_number_1} onChange={(e: any) => sT('tax_number_1', e.target.value)} placeholder="Registration no." /></RField>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <RField T={T} label="Tax 2 name" style={{ flex: 1 }}><RInp T={T} value={tax.tax_label_2} onChange={(e: any) => sT('tax_label_2', e.target.value)} placeholder="Optional" /></RField>
                    <RField T={T} label="Tax 2 number" style={{ flex: 1.3 }}><RInp T={T} value={tax.tax_number_2} onChange={(e: any) => sT('tax_number_2', e.target.value)} placeholder="Optional" /></RField>
                  </div>
                </div>
              )}

              {/* STEP 2 — admin user */}
              {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                  <RField T={T} label="Your name" required error={errField === 'user_name'}><RInp T={T} value={user.name} onChange={(e: any) => sU('name', e.target.value)} placeholder="Full name" autoFocus /></RField>
                  <RField T={T} label="Email address" required error={errField === 'email'}><RInp T={T} type="email" value={user.email} onChange={(e: any) => sU('email', e.target.value)} placeholder="you@business.com" /></RField>
                  <RField T={T} label="Username" required error={errField === 'username'} hint="Used to sign in — can't be changed later.">
                    <RInp T={T} value={user.username} onChange={(e: any) => sU('username', e.target.value.replace(/\s/g, ''))} placeholder="e.g. amina" />
                  </RField>
                  <RField T={T} label="Password" required error={errField === 'password'} hint="At least 6 characters.">
                    <div style={{ position: 'relative' }}>
                      <RInp T={T} type={showPw ? 'text' : 'password'} value={user.password} onChange={(e: any) => sU('password', e.target.value)} placeholder="••••••••" style={{ paddingRight: 44 }} />
                      <button type="button" onClick={() => setShowPw((s: any) => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: T.inkMute, cursor: 'pointer', fontSize: 13 }}>{showPw ? '◯' : '●'}</button>
                    </div>
                  </RField>
                </div>
              )}

              {/* STEP 3 — review */}
              {step === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <ReviewBlock T={T} title="Business" onEdit={() => setStep(0)} rows={[['Name', biz.name || '—'], ['Start date', biz.start_date], ['Currency', `${cur.code} (${cur.symbol})`], ['Time zone', biz.time_zone]]} />
                  <ReviewBlock T={T} title="Tax" onEdit={() => setStep(1)} rows={[[tax.tax_label_1 || 'Tax 1', tax.tax_number_1 || '—'], ...(tax.tax_label_2 ? [[tax.tax_label_2, tax.tax_number_2 || '—']] : [])]} />
                  <ReviewBlock T={T} title="Admin user" onEdit={() => setStep(2)} rows={[['Name', user.name], ['Email', user.email], ['Username', user.username], ['Password', '•'.repeat(user.password.length || 6)]]} />
                </div>
              )}

              {err && (
                <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>⚠</span>{err}
                </div>
              )}

              {/* nav */}
              <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
                {step > 0 && <button onClick={() => { setErr(null); setStep((s: any) => s - 1); }} style={ghostBtn(T)}>Back</button>}
                {step < 3
                  ? <button onClick={() => { if (canAdvance()) setStep((s: any) => s + 1); }} disabled={!canAdvance()} style={{ ...primaryBtn(T), flex: 1, opacity: canAdvance() ? 1 : 0.5, cursor: canAdvance() ? 'pointer' : 'not-allowed' }}>Continue</button>
                  : <button onClick={submit} disabled={busy} style={{ ...primaryBtn(T), flex: 1, opacity: busy ? 0.8 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                      {busy && <span style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin .7s linear infinite' }} />}
                      {busy ? 'Registering…' : 'Register business'}
                    </button>}
              </div>

              <div style={{ textAlign: 'center', marginTop: 22, fontSize: 12.5, color: T.inkSub }}>
                Already have an account? <span onClick={onBackToLogin} style={{ color: T.accent.text, fontWeight: 700, cursor: 'pointer' }}>Sign in</span>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 860px){ .auth-brand{ display:none !important; } }`}</style>
    </div>
  );
}

function RField({ T, label, required, hint, error, children, style }: any) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: error ? T.redText : T.inkSub, marginBottom: 6, letterSpacing: 0.2 }}>
        {label}{required && <span style={{ color: T.accent.text, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: T.inkMute, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}
function RInp({ T, style, error, ...p }: any) {
  return <input {...p} style={{
    width: '100%', padding: '11px 13px', fontSize: 14, fontFamily: T.fBody, color: T.ink,
    background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s', ...style,
  } as React.CSSProperties} onFocus={(e: any) => e.target.style.borderColor = T.accent.base} onBlur={(e: any) => e.target.style.borderColor = T.line} />;
}
function RSelect({ T, children, style, ...p }: any) {
  return <select {...p} style={{
    width: '100%', padding: '11px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink,
    background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', cursor: 'pointer', ...style,
  } as React.CSSProperties}>{children}</select>;
}
function ReviewBlock({ T, title, rows, onEdit }: any) {
  return (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: T.rLg, overflow: 'hidden', background: T.paper }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: `1px solid ${T.line}`, background: T.paperAlt }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: T.inkMid }}>{title}</span>
        <span onClick={onEdit} style={{ fontSize: 11.5, fontWeight: 700, color: T.accent.text, cursor: 'pointer' }}>Edit</span>
      </div>
      <div style={{ padding: '6px 14px' }}>
        {rows.map(([k, v]: any) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '6px 0', fontSize: 13 }}>
            <span style={{ color: T.inkSub }}>{k}</span>
            <span style={{ color: T.ink, fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function primaryBtn(T: Theme): React.CSSProperties { return { width: '100%', padding: '13px', borderRadius: T.r, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 14.5, fontWeight: 700, color: '#fff', background: `linear-gradient(135deg, ${T.navyLight}, ${T.navy})`, boxShadow: '0 4px 14px rgba(15,31,61,0.35)' }; }
function ghostBtn(T: Theme): React.CSSProperties { return { padding: '13px 20px', borderRadius: T.r, border: `1.5px solid ${T.line}`, background: T.paper, cursor: 'pointer', fontFamily: T.fBody, fontSize: 14, fontWeight: 600, color: T.inkMid }; }
