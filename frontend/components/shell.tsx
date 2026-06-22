'use client';
import React from 'react';
import { makeTheme, type Theme, SIDEBARS } from '@/lib/theme';
import { BUSINESS, CASHIER } from '@/lib/data';
import { API } from '@/lib/api';
import { useViewport } from '@/components/kit';
import { usePathname, useRouter } from 'next/navigation';
import { ApiPanel } from '@/components/api-panel';
import { LanguageSwitcher } from '@/components/language-switcher';
import { isNavBlocked, setNavBlock, navBlockMessage, navBlockTitle } from '@/lib/nav-guard';

// ─────────────────────────────────────────────────────────────────
// App shell: refined navy sidebar + content topbar.
// ─────────────────────────────────────────────────────────────────

export const NAV = [
  { sect: null, items: [
    { id: 'dashboard', label: 'Dashboard', icon: '▦' },
    { id: 'pos', label: 'Point of Sale', icon: '⊞' },
  ]},
  { sect: 'Inventory', items: [
    { id: 'locations', label: 'Locations', icon: '☖' },
    { id: 'categories', label: 'Categories', icon: '⊞' },
    { id: 'products', label: 'Products', icon: '◫' },
    { id: 'stock', label: 'Stock', icon: '◱' },
    { id: 'stocktake', label: 'Stocktake', icon: '☑' },
    { id: 'purchase-orders', label: 'Purchase Orders', icon: '◨' },
    { id: 'orders', label: 'Orders', icon: '◵' },
    { id: 'suppliers', label: 'Suppliers', icon: '◈' },
  ]},
  { sect: 'Sales', items: [
    { id: 'sales', label: 'Sales History', icon: '◎' },
    { id: 'customers', label: 'Customers', icon: '◉' },
    { id: 'loyalty', label: 'Loyalty', icon: '◆' },
    { id: 'discounts', label: 'Discounts', icon: '◌' },
    { id: 'coupons', label: 'Coupons', icon: '◇' },
  ]},
  { sect: 'Hospitality', items: [
    { id: 'hotel', label: 'Hotel', icon: '⌂' },
    { id: 'restaurant', label: 'Restaurant', icon: '♨' },
  ]},
  { sect: 'Verticals', items: [
    { id: 'pharmacy', label: 'Pharmacy', icon: '✚' },
    { id: 'wholesale', label: 'Wholesale', icon: '⊟' },
    { id: 'construction', label: 'Construction', icon: '◭' },
  ]},
  { sect: 'Finance', items: [
    { id: 'payment-accounts', label: 'Payment Accounts', icon: '▭' },
    { id: 'expenses', label: 'Expenses', icon: '◔' },
    { id: 'petty-cash', label: 'Petty Cash', icon: '◐' },
    { id: 'adjustments', label: 'Adjustments', icon: '◑' },
    { id: 'transfers', label: 'Transfers', icon: '⇄' },
  ]},
  { sect: 'Operations', items: [
    { id: 'hrm', label: 'HRM / Staff', icon: '⚇' },
    { id: 'projects', label: 'Projects', icon: '◳' },
    { id: 'tasks', label: 'Tasks', icon: '◻' },
  ]},
  { sect: 'Analytics', items: [
    { id: 'reports', label: 'Reports', icon: '◳' },
    { id: 'insights', label: 'AI Insights', icon: '✦', badge: 'AI' },
  ]},
  { sect: 'Admin', items: [
    { id: 'users', label: 'Users', icon: '◉' },
    { id: 'invoice-layouts', label: 'Invoice Layouts', icon: '▤' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
    { id: 'modules', label: 'Plan & Modules', icon: '▣' },
    { id: 'superadmin', label: 'Superadmin', icon: '⚿' },
  ]},
];

// Nav items that belong to a paid/optional module — hidden from the sidebar
// unless that module is enabled for the business. Everything else is core.
const NAV_MODULE: Record<string, string> = {
  hotel: 'hotel', restaurant: 'restaurant',
  pharmacy: 'pharmacy', wholesale: 'wholesale', construction: 'construction',
  hrm: 'hrm', insights: 'insights', superadmin: 'superadmin',
};

export function Sidebar({ T, screen, setScreen, collapsed, setCollapsed, onLogout, onLock, mobile, enabledMods }: any) {
  const W = collapsed ? 68 : 244;
  const S = T.side;
  // Show a module's nav item only when it's enabled. `enabledMods === 'all'`
  // (mock dev / fetch failed) shows everything; a Set gates by key; null (still
  // loading in real mode) hides the optional items until we know.
  const showItem = (id: string) => {
    const mod = NAV_MODULE[id];
    if (!mod) return true;
    if (enabledMods === 'all') return true;
    if (!enabledMods) return false;
    return enabledMods.has(mod);
  };
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((it: any) => showItem(it.id)) })).filter((g) => g.items.length > 0);
  const session = useSession();
  const bizName = (session && session.business_name) || BUSINESS.name;
  const userName = (session && session.name) || CASHIER.name;
  const userRole = (session && session.role) || CASHIER.role;
  const userInitials = (session && session.name)
    ? session.name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : CASHIER.initials;
  return (
    <aside style={{
      width: W, minWidth: W, height: mobile ? '100vh' : undefined, background: S.bg, color: S.brand,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      transition: 'width .22s cubic-bezier(.4,0,.2,1)', overflow: 'hidden',
      borderRight: `1px solid ${S.line}`, position: 'relative', zIndex: 20,
    } as React.CSSProperties}>
      {/* Brand */}
      <div style={{
        height: 66, minHeight: 66, display: 'flex', alignItems: 'center',
        gap: 11, padding: collapsed ? '0 17px' : '0 18px',
        borderBottom: `1px solid ${S.line}`,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: `linear-gradient(150deg, ${T.accent.bright}, ${T.accent.base})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: T.fDisplay, fontWeight: 700, fontSize: 19, color: '#fff',
          boxShadow: S.markShadow,
        }}>B</div>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.2px', lineHeight: 1.1, color: S.brand }}>Balanzify</div>
            <div style={{ fontSize: 10.5, color: S.brandSub, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bizName}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 0 6px' }}>
        {groups.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 4 }}>
            {group.sect && !collapsed && (
              <div style={{
                fontSize: 9.5, letterSpacing: 1.5, fontWeight: 700, textTransform: 'uppercase',
                color: S.section, padding: '12px 20px 5px',
              } as React.CSSProperties}>{group.sect}</div>
            )}
            {group.sect && collapsed && <div style={{ height: 1, background: S.line, margin: '8px 16px' }} />}
            {group.items.map((item: any) => {
              const active = screen === item.id;
              return (
                <button key={item.id} onClick={() => setScreen(item.id)} title={collapsed ? item.label : undefined}
                  style={{
                    width: collapsed ? 'auto' : 'calc(100% - 10px)', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer',
                    padding: collapsed ? '10px 0' : '9px 14px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    margin: collapsed ? '2px 8px' : '1px 5px 1px 0',
                    border: 'none', borderRadius: collapsed ? 10 : '0 9px 9px 0',
                    borderLeft: `3px solid ${active ? S.activeRail : 'transparent'}`,
                    background: active ? S.activeBg : (item.highlight ? S.highlight : 'transparent'),
                    color: active ? S.activeText : S.itemText,
                    fontFamily: T.fBody, fontSize: 13.5, fontWeight: active ? 600 : 450,
                    transition: 'background .14s, color .14s', position: 'relative',
                  } as React.CSSProperties}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = S.hover; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = item.highlight ? S.highlight : 'transparent'; }}
                >
                  <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0, opacity: active ? 1 : 0.8 } as React.CSSProperties}>{item.icon}</span>
                  {!collapsed && <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span style={{
                      fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 20,
                      background: `linear-gradient(135deg, ${T.accent.bright}, ${T.accent.base})`, color: '#fff',
                    }}>{item.badge}</span>
                  )}
                  {!collapsed && item.soft && !item.badge && (
                    <span style={{ fontSize: 9, color: S.chev }}>›</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div style={{ borderTop: `1px solid ${S.line}`, padding: collapsed ? '12px 0' : '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <div style={{
            width: 33, height: 33, borderRadius: 9, flexShrink: 0,
            background: S.avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: S.avatarText,
          }}>{userInitials}</div>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: S.footerText }}>{userName}</div>
              <div style={{ fontSize: 10, color: S.footerSub, textTransform: 'capitalize' }}>{userRole}</div>
            </div>
          )}
          {!collapsed && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
              <LanguageSwitcher compact />
              {onLock && <button onClick={onLock} title="Lock / switch user" style={{
                width: 28, height: 28, borderRadius: 7, cursor: 'pointer',
                background: S.iconBg, border: 'none', color: S.iconText, fontSize: 13,
              }}>🔒</button>}
              <button onClick={onLogout} title="Sign out" style={{
                width: 28, height: 28, borderRadius: 7, cursor: 'pointer',
                background: S.iconBg, border: 'none', color: S.iconText, fontSize: 13,
              }}>⏻</button>
            </div>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      {!mobile && <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'} style={{
        position: 'absolute', top: 23, right: collapsed ? 13 : 14,
        width: 22, height: 22, borderRadius: 6, cursor: 'pointer', zIndex: 2,
        background: collapsed ? S.iconBg : 'transparent', border: 'none',
        color: S.iconText, fontSize: 12, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      } as React.CSSProperties}>{collapsed ? '›' : '‹'}</button>}
    </aside>
  );
}

// Topbar shown above content screens (not POS, which has its own)
export function Topbar({ T, title, subtitle, right }: any) {
  const { isMobile } = useViewport();
  return (
    <div style={{
      height: 66, minHeight: 66, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: isMobile ? '0 14px' : '0 28px', borderBottom: `1px solid ${T.line}`, background: T.paper, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {isMobile && (
          <button onClick={() => typeof window !== 'undefined' && (window as any).__bzOpenDrawer && (window as any).__bzOpenDrawer()} aria-label="Menu" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 9, border: `1px solid ${T.line}`, background: T.paper, color: T.ink, cursor: 'pointer', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>☰</button>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: T.fDisplay, fontSize: isMobile ? 18 : 22, fontWeight: T.dispWeight, color: T.ink, letterSpacing: T.dispTrack, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties}>{title}</div>
          {subtitle && !isMobile && <div style={{ fontSize: 12.5, color: T.inkSub, marginTop: 3 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, flexShrink: 0 }}>{right}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AppShell — theme assembly from tweaks + authed-app layout.
// ─────────────────────────────────────────────────────────────────
const TWEAK_DEFAULTS = {
  accent: 'brass',
  type: 'ledger',
  sidebar: 'linen',
  tillDark: false,
  posGrid: 'cards',
  posCart: 'rail',
  density: 'regular',
} as any;

const ThemeCtx = React.createContext<Theme>(makeTheme());
export const useTheme = () => React.useContext(ThemeCtx);

const TweaksCtx = React.createContext<[any, (key: string, value: any) => void]>([TWEAK_DEFAULTS, () => {}]);
export function useTweaks() { return React.useContext(TweaksCtx); }

// The signed-in identity (real mode) — null until loaded / in mock mode.
const SessionCtx = React.createContext<any>(null);
export function useSession() { return React.useContext(SessionCtx); }

// Themed confirm dialog used by the navigation guard (replaces the native confirm()).
function ConfirmDialog({ T, onCancel, onConfirm }: { T: Theme; onCancel: () => void; onConfirm: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);
  const btn: React.CSSProperties = { padding: '10px 18px', borderRadius: T.r, fontSize: 13.5, fontWeight: 700, fontFamily: T.fBody, cursor: 'pointer', border: '1px solid transparent', transition: 'all .15s' };
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,15,5,0.55)', backdropFilter: 'blur(3px)', padding: 20 } as React.CSSProperties}>
      <div role="alertdialog" aria-modal="true" style={{ width: 'min(420px, 94vw)', background: T.paper, borderRadius: T.rXl, boxShadow: T.shModal, overflow: 'hidden', animation: 'sheetUp .22s cubic-bezier(.2,.7,.3,1)' } as React.CSSProperties}>
        <div style={{ padding: '26px 26px 20px', textAlign: 'center' } as React.CSSProperties}>
          <div style={{ width: 56, height: 56, borderRadius: T.rFull, background: T.amberSoft, color: T.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' }}>!</div>
          <div style={{ fontFamily: T.fDisplay, fontSize: 20, fontWeight: T.dispWeight, color: T.ink, letterSpacing: T.dispTrack }}>{navBlockTitle()}</div>
          <div style={{ fontSize: 13.5, color: T.inkSub, marginTop: 8, lineHeight: 1.55 }}>{navBlockMessage()}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '0 22px 22px' }}>
          <button onClick={onCancel} style={{ ...btn, flex: 1, background: T.paper, color: T.inkMid, border: `1px solid ${T.line}` }}>Stay on page</button>
          <button onClick={onConfirm} style={{ ...btn, flex: 1, background: T.red, color: '#fff' }}>Discard &amp; leave</button>
        </div>
      </div>
    </div>
  );
}

// Lock / switch-user overlay — a cashier unlocks the till with their PIN
// (POST /auth/pin-login within the current business), swapping the session.
function LockScreen({ T, session, onCancel }: { T: Theme; session: any; onCancel: () => void }) {
  const [pin, setPin] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<any>(null);
  const bizId = session && session.business_id;
  async function unlock() {
    if (pin.length < 4) { setErr('Enter your 4–10 digit PIN.'); return; }
    if (!bizId) { setErr('Session not ready — please sign in again.'); return; }
    setBusy(true); setErr(null);
    try { await API.auth.pinLogin(pin, bizId); if (typeof window !== 'undefined') window.location.reload(); }
    catch (e: any) { setErr(e.message || 'Invalid PIN.'); setPin(''); setBusy(false); }
  }
  const press = (d: string) => { setErr(null); setPin((p) => (p + d).slice(0, 10)); };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: T.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fBody } as React.CSSProperties}>
      <div style={{ width: 320, textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>🔒</div>
        <div style={{ fontFamily: T.fDisplay, fontSize: 24, fontWeight: T.dispWeight }}>Till locked</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4, marginBottom: 20 }}>{(session && session.business_name) || 'Balanzify'} · enter PIN to continue</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 18, minHeight: 12 }}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <span key={i} style={{ width: 12, height: 12, borderRadius: 99, background: i < pin.length ? T.accent.bright : 'rgba(255,255,255,0.2)' }} />)}
        </div>
        {err && <div style={{ marginBottom: 14, color: '#FCA5A5', fontSize: 12.5 }}>⚠ {err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {keys.map((k, i) => k === '' ? <span key={i} /> : (
            <button key={i} onClick={() => k === '⌫' ? setPin((p) => p.slice(0, -1)) : press(k)} style={{ padding: '16px 0', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: T.fMono, fontSize: 20, fontWeight: 600, background: 'rgba(255,255,255,0.08)', color: '#fff' }}>{k}</button>
          ))}
        </div>
        <button onClick={unlock} disabled={busy} style={{ width: '100%', marginTop: 16, padding: '14px', borderRadius: 12, border: 'none', cursor: busy ? 'wait' : 'pointer', fontFamily: T.fBody, fontSize: 15, fontWeight: 700, color: '#fff', background: `linear-gradient(135deg, ${T.accent.bright}, ${T.accent.base})`, opacity: busy ? 0.8 : 1 }}>{busy ? 'Unlocking…' : 'Unlock'}</button>
        <button onClick={onCancel} style={{ marginTop: 12, background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Cancel</button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // Auth gate: every (app) route requires a signed-in session. `null` = still
  // checking (render nothing to avoid flashing protected content); `false` =
  // redirecting to /login; `true` = authorized.
  const [authed, setAuthed] = React.useState<boolean | null>(null);
  const [session, setSession] = React.useState<any>(null);
  const [locked, setLocked] = React.useState(false);
  const [enabledMods, setEnabledMods] = React.useState<any>(null);   // Set<key> | 'all' | null(loading)
  React.useEffect(() => {
    let ok = false;
    try { ok = localStorage.getItem('bz_authed') === '1'; } catch {}
    if (!ok) { router.replace('/login'); setAuthed(false); return; }
    setAuthed(true);
    API.auth.me().then(setSession).catch(() => {});
  }, [router]);

  // Enabled modules drive which nav items show. Reloads when a module is
  // toggled (the Plan & Modules screen dispatches 'bz:modules-changed').
  React.useEffect(() => {
    if (authed !== true) return;
    const load = () => {
      if (!(API.config?.isReal?.())) { setEnabledMods('all'); return; }
      API.module.list()
        .then((ms: any) => setEnabledMods(new Set((ms || []).filter((m: any) => m.enabled).map((m: any) => m.key))))
        .catch(() => setEnabledMods('all'));   // fail open — never strand the user with an empty sidebar
    };
    load();
    if (typeof window === 'undefined') return;
    window.addEventListener('bz:modules-changed', load);
    return () => window.removeEventListener('bz:modules-changed', load);
  }, [authed]);

  const [tweaks, setTweaks] = React.useState<any>(() => {
    if (typeof window === 'undefined') return TWEAK_DEFAULTS;
    try {
      const raw = localStorage.getItem('bz_tweaks');
      return raw ? { ...TWEAK_DEFAULTS, ...JSON.parse(raw) } : TWEAK_DEFAULTS;
    } catch { return TWEAK_DEFAULTS; }
  });
  const setTweak = React.useCallback((key: string, value: any) => {
    setTweaks((prev: any) => {
      const next = { ...prev, [key]: value };
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('bz_tweaks', JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }, []);

  const T = makeTheme({ accent: tweaks.accent, type: tweaks.type, sidebar: tweaks.sidebar });

  const [collapsed, setCollapsed] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const { isMobile } = useViewport();

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__bzOpenDrawer = () => setDrawerOpen(true);
    return () => { delete (window as any).__bzOpenDrawer; };
  }, []);

  // A pending navigation held back by the nav guard (e.g. POS has an unsaved cart),
  // awaiting the user's choice in the themed confirm dialog below.
  const [pendingNav, setPendingNav] = React.useState<null | { kind: 'route'; id: string } | { kind: 'logout' }>(null);

  function doLogout() {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('bz_authed', '0'); } catch {}
    }
    if (API.auth && typeof (API.auth as any).logout === 'function') (API.auth as any).logout();
    router.push('/login');
  }
  function logout() {
    if (isNavBlocked()) { setPendingNav({ kind: 'logout' }); return; }
    doLogout();
  }

  // active item = first path segment ( '/' → 'dashboard' )
  const active = (pathname && pathname.split('/')[1]) || 'dashboard';
  // If the current screen is dirty (isNavBlocked), defer to a confirm dialog instead of navigating.
  const go = (id: string) => {
    if (isNavBlocked()) { setPendingNav({ kind: 'route', id }); return; }
    router.push('/' + id); setDrawerOpen(false);
  };
  function confirmPendingNav() {
    const p = pendingNav;
    setPendingNav(null);
    setNavBlock(false); // user chose to discard; release the guard
    if (p?.kind === 'logout') doLogout();
    else if (p) { router.push('/' + p.id); setDrawerOpen(false); }
  }

  // While checking auth (or redirecting an unauthorized visitor), render nothing
  // so protected content never flashes before the bounce to /login.
  if (authed !== true) {
    return <div style={{ height: '100vh', background: T.paperAlt } as React.CSSProperties} />;
  }

  return (
    <ThemeCtx.Provider value={T}>
     <SessionCtx.Provider value={session}>
      <TweaksCtx.Provider value={[tweaks, setTweak]}>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: T.paperAlt, fontFamily: T.fBody } as React.CSSProperties}>
          {isMobile ? (
            <>
              {drawerOpen && <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.5)', backdropFilter: 'blur(2px)', zIndex: 60 } as React.CSSProperties} />}
              <div style={{ position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 70, transform: drawerOpen ? 'none' : 'translateX(-100%)', transition: 'transform .24s cubic-bezier(.4,0,.2,1)', boxShadow: drawerOpen ? '8px 0 30px rgba(0,0,0,0.3)' : 'none' } as React.CSSProperties}>
                <Sidebar T={T} screen={active} setScreen={go} collapsed={false} setCollapsed={() => {}} onLogout={logout} onLock={() => setLocked(true)} enabledMods={enabledMods} mobile />
              </div>
            </>
          ) : (
            <Sidebar T={T} screen={active} setScreen={go} collapsed={collapsed} setCollapsed={setCollapsed} onLogout={logout} onLock={() => setLocked(true)} enabledMods={enabledMods} />
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>{children}</div>
          {/* Dev/debug overlay — only in mock mode; hidden in the real (production) build. */}
          {!(API.config?.isReal?.()) && <ApiPanel T={T} />}
          {pendingNav && <ConfirmDialog T={T} onCancel={() => setPendingNav(null)} onConfirm={confirmPendingNav} />}
          {locked && <LockScreen T={T} session={session} onCancel={() => setLocked(false)} />}
        </div>
      </TweaksCtx.Provider>
     </SessionCtx.Provider>
    </ThemeCtx.Provider>
  );
}
