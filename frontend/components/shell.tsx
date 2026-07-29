'use client';
import React from 'react';
import { makeTheme, type Theme, SIDEBARS, setMoneyFormat } from '@/lib/theme';
import { setBusinessSettings, hydrateBusinessSettings, getBusinessSettings, getSetting } from '@/lib/business-settings';
import { BUSINESS, CASHIER } from '@/lib/data';
import { API } from '@/lib/api';
import { useViewport } from '@/components/kit';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiPanel } from '@/components/api-panel';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OfflineIndicator } from '@/components/offline-indicator';
import { useLocale } from '@/lib/locale-context';
import { navLabel } from '@/lib/i18n';
import { isNavBlocked, setNavBlock, navBlockMessage, navBlockTitle } from '@/lib/nav-guard';
import {
  LuLayoutDashboard, LuMapPin, LuPackage, LuClipboardCheck,
  LuShoppingCart, LuClipboardList, LuTruck, LuReceipt, LuUsers, LuGift,
  LuTicket, LuBedDouble, LuUtensils, LuPill, LuActivity, LuWarehouse, LuHardHat,
  LuBike, LuLandmark, LuBanknote, LuCoins, LuSlidersHorizontal, LuArrowLeftRight,
  LuHandCoins, LuPiggyBank, LuUserCog, LuFolderKanban, LuListTodo, LuRefreshCw,
  LuChartColumn, LuSparkles, LuUsersRound, LuFileCheck, LuSettings, LuLayers,
  LuShieldCheck, LuChevronRight,
} from 'react-icons/lu';

// ─────────────────────────────────────────────────────────────────
// App shell: refined navy sidebar + content topbar.
// ─────────────────────────────────────────────────────────────────

export const NAV = [
  {
    sect: null, items: [
      { id: 'dashboard', label: 'Dashboard', icon: LuLayoutDashboard },
      // Point of Sale lives in the Sales group below (Sell → POS), like the reference.
    ]
  },
  {
    sect: 'Inventory', items: [
      { id: 'locations', label: 'Locations', icon: LuMapPin },
      {
        id: 'products', label: 'Products', icon: LuPackage, children: [
          { key: 'products', activeId: 'products', label: 'All Products', route: '/products' },
          { key: 'categories', activeId: 'categories', label: 'Categories', route: '/categories' },
          { key: 'brands', activeId: 'brands', label: 'Brands', route: '/brands' },
          { key: 'labels', activeId: '', label: 'Print Labels', route: '/products?tool=labels' },
          { key: 'price-groups', activeId: '', label: 'Selling Price Groups', route: '/products?tool=price-groups' },
          { key: 'variations', activeId: '', label: 'Variations', route: '/products?tool=variations' },
          { key: 'units', activeId: '', label: 'Units', route: '/products?tool=units' },
        ]
      },
      { id: 'stocktake', label: 'Stocktake', icon: LuClipboardCheck },
      {
        id: 'purchase-orders', label: 'Purchases', icon: LuShoppingCart, children: [
          { key: 'list-purchases',   activeId: 'purchase-orders',  label: 'List Purchases',   route: '/purchase-orders' },
          { key: 'add-purchase',     activeId: '',                 label: 'Add Purchase',     route: '/purchase-orders?new=1' },
          { key: 'purchase-returns', activeId: 'purchase-returns', label: 'Purchase Returns', route: '/purchase-returns' },
        ]
      },
      { id: 'orders', label: 'Orders', icon: LuClipboardList },
      { id: 'suppliers', label: 'Suppliers', icon: LuTruck },
    ]
  },
  {
    sect: 'Sales', items: [
      {
        id: 'sales', label: 'Sales', icon: LuReceipt, children: [
          { key: 'all-sales',       activeId: 'sales', label: 'All Sales', route: '/sales' },
          { key: 'add-sale',        activeId: 'sales', activeParams: { new: '1' }, label: 'Add Sale', route: '/sales?new=1' },
          { key: 'list-pos',        activeId: 'sales', activeParams: { type: 'pos' }, label: 'List POS', route: '/sales?type=pos' },
          { key: 'pos',             activeId: 'pos', label: 'POS', route: '/pos' },
          { key: 'add-draft',       activeId: 'sales', activeParams: { new: '1', status: 'draft' }, label: 'Add Draft', route: '/sales?new=1&status=draft' },
          { key: 'list-drafts',     activeId: 'sales', activeParams: { status: 'draft' }, label: 'List Drafts', route: '/sales?status=draft' },
          { key: 'add-quotation',   activeId: 'sales', activeParams: { new: '1', status: 'quotation' }, label: 'Add Quotation', route: '/sales?new=1&status=quotation' },
          { key: 'list-quotations', activeId: 'sales', activeParams: { status: 'quotation' }, label: 'List Quotations', route: '/sales?status=quotation' },
          { key: 'list-sell-return', activeId: 'sales', activeParams: { returns: '1' }, label: 'List Sell Return', route: '/sales?returns=1' },
          { key: 'shipments',       activeId: 'sales', activeParams: { shipments: '1' }, label: 'Shipments', route: '/sales?shipments=1' },
          { key: 'discounts',       activeId: 'discounts', label: 'Discounts', route: '/discounts' },
          { key: 'import-sales',    activeId: 'sales', activeParams: { import: '1' }, label: 'Import Sales', route: '/sales?import=1' },
        ],
      },
      { id: 'customers', label: 'Customers', icon: LuUsers },
      { id: 'loyalty', label: 'Loyalty', icon: LuGift },
      { id: 'coupons', label: 'Coupons', icon: LuTicket },
    ]
  },
  {
    sect: 'Hospitality', items: [
      { id: 'hotel', label: 'Hotel', icon: LuBedDouble },
      { id: 'restaurant', label: 'Restaurant', icon: LuUtensils },
    ]
  },
  {
    sect: 'Verticals', items: [
      { id: 'pharmacy', label: 'Pharmacy', icon: LuPill },
      { id: 'interactions', label: 'Drug Interactions', icon: LuActivity },
      { id: 'wholesale', label: 'Wholesale', icon: LuWarehouse },
      { id: 'construction', label: 'Construction', icon: LuHardHat },
      { id: 'delivery', label: 'Delivery', icon: LuBike },
    ]
  },
  {
    sect: 'Finance', items: [
      {
        id: 'payment-accounts', label: 'Payment Accounts', icon: LuLandmark, children: [
          { key: 'list-accounts',   activeId: 'payment-accounts', label: 'List Accounts', route: '/payment-accounts' },
          { key: 'balance-sheet',   activeId: 'payment-accounts', activeParams: { 'balance-sheet': '1' }, label: 'Balance Sheet', route: '/payment-accounts?balance-sheet=1' },
          { key: 'trial-balance',   activeId: 'payment-accounts', activeParams: { 'trial-balance': '1' }, label: 'Trial Balance', route: '/payment-accounts?trial-balance=1' },
          { key: 'cash-flow',       activeId: 'payment-accounts', activeParams: { 'cash-flow': '1' }, label: 'Cash Flow', route: '/payment-accounts?cash-flow=1' },
          { key: 'account-report',  activeId: 'payment-accounts', activeParams: { report: '1' }, label: 'Payment Account Report', route: '/payment-accounts?report=1' },
        ],
      },
      {
        id: 'expenses', label: 'Expenses', icon: LuBanknote, children: [
          { key: 'list-expenses',      activeId: 'expenses', label: 'List Expenses', route: '/expenses' },
          { key: 'add-expense',        activeId: 'expenses', activeParams: { new: '1' }, label: 'Add Expense', route: '/expenses?new=1' },
          { key: 'expense-categories', activeId: 'expenses', activeParams: { categories: '1' }, label: 'Expense Categories', route: '/expenses?categories=1' },
        ],
      },
      { id: 'petty-cash', label: 'Petty Cash', icon: LuCoins },
      {
        id: 'adjustments', label: 'Stock Adjustment', icon: LuSlidersHorizontal, children: [
          { key: 'list-adjustments', activeId: 'adjustments', label: 'List Stock Adjustments', route: '/adjustments' },
          { key: 'add-adjustment',   activeId: 'adjustments', activeParams: { new: '1' }, label: 'Add Stock Adjustment', route: '/adjustments?new=1' },
        ],
      },
      {
        id: 'transfers', label: 'Stock Transfers', icon: LuArrowLeftRight, children: [
          { key: 'list-transfers', activeId: 'transfers', label: 'List Stock Transfers', route: '/transfers' },
          { key: 'add-transfer',   activeId: 'transfers', activeParams: { new: '1' }, label: 'Add Stock Transfer', route: '/transfers?new=1' },
        ],
      },
      { id: 'zakat', label: 'Zakat', icon: LuHandCoins },
      { id: 'lending', label: 'Financing', icon: LuPiggyBank },
    ]
  },
  {
    sect: 'Operations', items: [
      { id: 'hrm', label: 'HRM / Staff', icon: LuUserCog },
      { id: 'projects', label: 'Projects', icon: LuFolderKanban },
      { id: 'tasks', label: 'Tasks', icon: LuListTodo },
      { id: 'sync', label: 'Offline Sync', icon: LuRefreshCw },
    ]
  },
  {
    sect: 'Analytics', items: [
      {
        // collapsedRoute: a collapsed-sidebar click lands on Overview (visible
        // to every role) rather than the owner/manager-only Profit / Loss.
        id: 'reports', label: 'Reports', icon: LuChartColumn, collapsedRoute: '/reports', children: [
          { key: 'profit-loss', activeId: 'reports', activeParams: { tab: 'profit-loss' }, label: 'Profit / Loss', route: '/reports?tab=profit-loss' },
          { key: 'purchase-sale', activeId: 'reports', activeParams: { tab: 'purchase-sale' }, label: 'Purchase & Sale', route: '/reports?tab=purchase-sale' },
          { key: 'tax-report', activeId: 'reports', activeParams: { tab: 'tax' }, label: 'Tax Report', route: '/reports?tab=tax' },
          { key: 'contacts-report', activeId: 'reports', activeParams: { tab: 'contacts' }, label: 'Supplier & Customer', route: '/reports?tab=contacts' },
          { key: 'customer-groups-report', activeId: 'reports', activeParams: { tab: 'customer-groups' }, label: 'Customer Groups', route: '/reports?tab=customer-groups' },
          { key: 'stock-report', activeId: 'reports', activeParams: { tab: 'stock' }, label: 'Stock Report', route: '/reports?tab=stock' },
          { key: 'stock-adjustment-report', activeId: 'reports', activeParams: { tab: 'stock-adjustment' }, label: 'Stock Adjustment', route: '/reports?tab=stock-adjustment' },
          { key: 'trending-products', activeId: 'reports', activeParams: { tab: 'trending' }, label: 'Trending Products', route: '/reports?tab=trending' },
          { key: 'items-report', activeId: 'reports', activeParams: { tab: 'items' }, label: 'Items Report', route: '/reports?tab=items' },
          { key: 'product-purchase-report', activeId: 'reports', activeParams: { tab: 'product-purchase' }, label: 'Product Purchase', route: '/reports?tab=product-purchase' },
          { key: 'product-sell-report', activeId: 'reports', activeParams: { tab: 'product-sell' }, label: 'Product Sell', route: '/reports?tab=product-sell' },
          { key: 'purchase-sale-product-report', activeId: 'reports', activeParams: { tab: 'purchase-sale-product' }, label: 'Purchase & Sale Product', route: '/reports?tab=purchase-sale-product' },
          { key: 'reports-overview', activeId: 'reports', label: 'Overview', route: '/reports' },
          { key: 'reports-commission', activeId: 'reports', activeParams: { tab: 'commission' }, label: 'Sales Representative', route: '/reports?tab=commission' },
          { key: 'reports-register', activeId: 'reports', activeParams: { tab: 'register' }, label: 'Cash Register', route: '/reports?tab=register' },
        ]
      },
      { id: 'insights', label: 'AI Insights', icon: LuSparkles, badge: 'AI' },
    ]
  },
  {
    sect: 'Admin', items: [
      { id: 'users', label: 'Users', icon: LuUsersRound },
      { id: 'fiscal', label: 'Fiscalization', icon: LuFileCheck },
      {
        id: 'settings', label: 'Settings', icon: LuSettings, children: [
          { key: 'settings', activeId: 'settings', label: 'General', route: '/settings' },
          { key: 'business-settings', activeId: 'business-settings', label: 'Business Settings', route: '/business-settings' },
          { key: 'invoice-settings', activeId: 'invoice-settings', label: 'Invoice Settings', route: '/invoice-settings' },
      { key: 'barcode-settings',  activeId: 'barcode-settings',  label: 'Barcode Settings', route: '/barcode-settings' },
          { key: 'receipt-printers', activeId: 'receipt-printers', label: 'Receipt Printers', route: '/receipt-printers' },
          { key: 'tax-rates', activeId: 'tax-rates', label: 'Tax Rates', route: '/tax-rates' },
          { key: 'notification-templates', activeId: 'notification-templates', label: 'Notification Templates', route: '/notification-templates' },
        ]
      },
      { id: 'modules', label: 'Plan & Modules', icon: LuLayers },
      { id: 'superadmin', label: 'Superadmin', icon: LuShieldCheck },
    ]
  },
];

// Nav icons are react-icons components; a plain string is still tolerated so an
// item can fall back to a glyph.
function NavIcon({ icon, size = 17 }: { icon: any; size?: number }) {
  if (!icon) return null;
  return typeof icon === 'string' ? <>{icon}</> : React.createElement(icon, { size });
}

// Nav items that belong to a paid/optional module — hidden from the sidebar
// unless that module is enabled for the business. Everything else is core.
const NAV_MODULE: Record<string, string> = {
  hotel: 'hotel', restaurant: 'restaurant',
  pharmacy: 'pharmacy', interactions: 'pharmacy', wholesale: 'wholesale', construction: 'construction',
  delivery: 'delivery',
  hrm: 'hrm', insights: 'insights', superadmin: 'superadmin',
};

export function Sidebar({ T, screen, setScreen, collapsed, setCollapsed, onLogout, onLock, mobile, enabledMods }: any) {
  // Some children live at the same path as their sibling and differ only by a
  // query flag (e.g. Add Sale = /sales?new=1). `screen` is the path segment only,
  // so read the query here to tell them apart.
  const searchParams = useSearchParams();
  const { locale } = useLocale();
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
  // Nav entries are REAL links: middle-click / Cmd+click opens the page in a new
  // tab natively. A plain click is intercepted and routed through setScreen so
  // client-side navigation (and the unsaved-changes guard) still apply.
  const hrefOf = (r: string) => (r.startsWith('/') ? r : '/' + r);
  const navClick = (route: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab/window
    e.preventDefault();
    setScreen(route);
  };
  // Expand/collapse state for parent nav items with children. Undefined = follow
  // whether the active screen lives inside the group; a click overrides it.
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});
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
              } as React.CSSProperties}>{navLabel(locale, group.sect, group.sect)}</div>
            )}
            {group.sect && collapsed && <div style={{ height: 1, background: S.line, margin: '8px 16px' }} />}
            {group.items.map((item: any) => {
              // ── Parent item with a sub-menu (e.g. Products) ──
              if (item.children) {
                const inGroup = item.children.some((c: any) => c.activeId && c.activeId === screen);
                // Children that share one path may pin themselves to query params
                // (activeParams). Among those whose params ALL match the current URL,
                // the most specific (most params) is THE active child — so on
                // /sales?new=1&status=draft, "Add Draft" beats "Add Sale". With no
                // param match, the plain activeId children match as usual. Groups
                // that declare no activeParams behave exactly as before.
                const querySub = item.children
                  .filter((c: any) => c.activeParams && c.activeId === screen
                    && Object.entries(c.activeParams).every(([k, v]) => searchParams.get(k) === v))
                  .sort((a: any, b: any) => Object.keys(b.activeParams).length - Object.keys(a.activeParams).length)[0] || null;
                const isChildActive = (c: any) => (querySub
                  ? c === querySub
                  : c.activeId && c.activeId === screen && !c.activeParams);
                const isOpen = openGroups[item.id] !== undefined ? openGroups[item.id] : inGroup;
                const toggle = () => setOpenGroups((s) => ({ ...s, [item.id]: !(s[item.id] !== undefined ? s[item.id] : inGroup) }));
                return (
                  <div key={item.id}>
                    <button onClick={() => collapsed ? setScreen(item.collapsedRoute || item.children[0].route) : toggle()} title={collapsed ? item.label : undefined}
                      style={{
                        width: collapsed ? 'auto' : 'calc(100% - 10px)', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer',
                        padding: collapsed ? '10px 0' : '9px 14px',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        margin: collapsed ? '2px 8px' : '1px 5px 1px 0',
                        border: 'none', borderRadius: collapsed ? 10 : '0 9px 9px 0',
                        borderLeft: `3px solid ${inGroup ? S.activeRail : 'transparent'}`,
                        background: inGroup ? S.activeBg : 'transparent',
                        color: inGroup ? S.activeText : S.itemText,
                        fontFamily: T.fBody, fontSize: 13.5, fontWeight: inGroup ? 600 : 450,
                        transition: 'background .14s, color .14s',
                      } as React.CSSProperties}
                      onMouseEnter={e => { if (!inGroup) e.currentTarget.style.background = S.hover; }}
                      onMouseLeave={e => { if (!inGroup) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, flexShrink: 0, opacity: inGroup ? 1 : 0.8 } as React.CSSProperties}><NavIcon icon={item.icon} /></span>
                      {!collapsed && <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{navLabel(locale, item.id, item.label)}</span>}
                      {!collapsed && <span style={{ display: 'inline-flex', color: S.chev, transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'none' }}><LuChevronRight size={13} /></span>}
                    </button>
                    {!collapsed && isOpen && item.children.map((c: any) => {
                      const cActive = isChildActive(c);
                      return (
                        <a key={c.key} href={hrefOf(c.route)} onClick={navClick(c.route)}
                          style={{
                            width: 'calc(100% - 10px)', textAlign: 'left', boxSizing: 'border-box',
                            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                            padding: '7px 14px 7px 30px', margin: '1px 5px 1px 0',
                            border: 'none', borderRadius: '0 9px 9px 0', textDecoration: 'none',
                            borderLeft: `3px solid ${cActive ? S.activeRail : 'transparent'}`,
                            background: cActive ? S.activeBg : 'transparent',
                            color: cActive ? S.activeText : S.itemText,
                            fontFamily: T.fBody, fontSize: 12.75, fontWeight: cActive ? 600 : 440,
                            transition: 'background .14s, color .14s',
                          } as React.CSSProperties}
                          onMouseEnter={e => { if (!cActive) e.currentTarget.style.background = S.hover; }}
                          onMouseLeave={e => { if (!cActive) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span style={{ fontSize: 6, width: 8, textAlign: 'center', flexShrink: 0, opacity: cActive ? 1 : 0.55 } as React.CSSProperties}>●</span>
                          {/* keyed by c.key, so the POS child keeps the 'pos' translation it had as a top-level item */}
                          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{navLabel(locale, c.key, c.label)}</span>
                        </a>
                      );
                    })}
                  </div>
                );
              }
              const active = screen === item.id;
              return (
                <a key={item.id} href={hrefOf(item.id)} onClick={navClick(item.id)} title={collapsed ? item.label : undefined}
                  style={{
                    width: collapsed ? 'auto' : 'calc(100% - 10px)', textAlign: 'left', boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer',
                    padding: collapsed ? '10px 0' : '9px 14px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    margin: collapsed ? '2px 8px' : '1px 5px 1px 0',
                    border: 'none', borderRadius: collapsed ? 10 : '0 9px 9px 0', textDecoration: 'none',
                    borderLeft: `3px solid ${active ? S.activeRail : 'transparent'}`,
                    background: active ? S.activeBg : (item.highlight ? S.highlight : 'transparent'),
                    color: active ? S.activeText : S.itemText,
                    fontFamily: T.fBody, fontSize: 13.5, fontWeight: active ? 600 : 450,
                    transition: 'background .14s, color .14s', position: 'relative',
                  } as React.CSSProperties}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = S.hover; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = item.highlight ? S.highlight : 'transparent'; }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, flexShrink: 0, opacity: active ? 1 : 0.8 } as React.CSSProperties}><NavIcon icon={item.icon} /></span>
                  {!collapsed && <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{navLabel(locale, item.id, item.label)}</span>}
                  {!collapsed && item.badge && (
                    <span style={{
                      fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 20,
                      background: `linear-gradient(135deg, ${T.accent.bright}, ${T.accent.base})`, color: '#fff',
                    }}>{item.badge}</span>
                  )}
                  {!collapsed && item.soft && !item.badge && (
                    <span style={{ fontSize: 9, color: S.chev }}>›</span>
                  )}
                </a>
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
              <OfflineIndicator />
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

const TweaksCtx = React.createContext<[any, (key: string, value: any) => void]>([TWEAK_DEFAULTS, () => { }]);
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
    try { ok = localStorage.getItem('bz_authed') === '1'; } catch { }
    if (!ok) { router.replace('/login'); setAuthed(false); return; }
    setAuthed(true);
    API.auth.me().then(setSession).catch(() => { });
  }, [router]);

  // Business Settings preference bag — hydrate from storage so the first paint is
  // already formatted, then refresh from the server. The Business Settings screen
  // dispatches 'bz:settings-changed' after a save so this picks it up live.
  React.useEffect(() => {
    if (authed !== true) return;
    const apply = (bag: any) => {
      setBusinessSettings(bag);
      setMoneyFormat({
        precision: getSetting<number | null>('currency_precision', null),
        symbolAfter: getSetting<string>('currency_symbol_placement', 'before') === 'after',
        quantityPrecision: getSetting<number | null>('quantity_precision', 0),
      });
    };
    hydrateBusinessSettings();
    apply(getBusinessSettings());
    const load = () => {
      if (!(API.config?.isReal?.())) return;
      API.business.get().then((b: any) => { if (b) apply(b.settings || {}); }).catch(() => { /* keep hydrated values */ });
    };
    load();
    if (typeof window === 'undefined') return;
    window.addEventListener('bz:settings-changed', load);
    return () => window.removeEventListener('bz:settings-changed', load);
  }, [authed]);

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
        try { localStorage.setItem('bz_tweaks', JSON.stringify(next)); } catch { }
      }
      return next;
    });
  }, []);

  // System → Theme Color overrides the accent when set.
  const themeColor = getSetting('theme_color', '') as any;
  const T = makeTheme({ accent: themeColor || tweaks.accent, type: tweaks.type, sidebar: tweaks.sidebar });

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
      try { localStorage.setItem('bz_authed', '0'); } catch { }
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
  // Accepts a bare screen id ('products') or a full path ('/products?tool=units').
  const toPath = (idOrPath: string) => (idOrPath.startsWith('/') ? idOrPath : '/' + idOrPath);
  const go = (idOrPath: string) => {
    if (isNavBlocked()) { setPendingNav({ kind: 'route', id: idOrPath }); return; }
    router.push(toPath(idOrPath)); setDrawerOpen(false);
  };
  function confirmPendingNav() {
    const p = pendingNav;
    setPendingNav(null);
    setNavBlock(false); // user chose to discard; release the guard
    if (p?.kind === 'logout') doLogout();
    else if (p) { router.push(toPath(p.id)); setDrawerOpen(false); }
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
                  <Sidebar T={T} screen={active} setScreen={go} collapsed={false} setCollapsed={() => { }} onLogout={logout} onLock={() => setLocked(true)} enabledMods={enabledMods} mobile />
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
