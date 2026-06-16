'use client';
// ─────────────────────────────────────────────────────────────────
// POS TILL — the centerpiece.
// Left: category rail + searchable product grid.
// Right (or bottom / full): the ORDER — dominant totals + charge button.
// Tweaks: till theme (light/dark), grid (cards/list/category-first),
//         cart layout (rail/sheet/panel).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Badge, Modal, Field, TextField, SelectField, FormGrid, useViewport, swatchBg } from '@/components/kit';
import { useTheme, useTweaks } from '@/components/shell';
import { API } from '@/lib/api';
import { money } from '@/lib/theme';
import { CASHIER, CATEGORIES, PRODUCTS, PAYMENT_METHODS } from '@/lib/data';
import { setNavBlock } from '@/lib/nav-guard';

const { useState: useStateP, useMemo, useRef, useEffect: useEffectP } = React;

export default function POSPage() {
  const T = useTheme();
  const [tweaks] = useTweaks();
  return <POS T={T} tweaks={tweaks} />;
}

// Build a till-local theme (light = app paper; dark = deep navy surfaces)
function tillTheme(T: any, dark: any) {
  if (!dark) return {
    bg: T.paperAlt, grid: T.paperAlt, tile: T.card, tileLine: T.line, tileLineHi: T.lineMid,
    ink: T.ink, sub: T.inkSub, mute: T.inkMute, railBg: T.paper, railLine: T.line,
    cart: T.paper, cartLine: T.line, chip: T.paper, chipActive: T.navy, chipText: T.inkMid,
    search: T.paper, sink: T.paperSink,
  };
  return {
    bg: '#0B1422', grid: '#0B1422', tile: '#142133', tileLine: '#21314a', tileLineHi: '#33486a',
    ink: '#F2F0EA', sub: '#9FB0C8', mute: '#6F829E', railBg: '#0E1A2B', railLine: '#1d2c44',
    cart: '#0E1A2B', cartLine: '#1d2c44', chip: '#162539', chipActive: T.accent.base, chipText: '#C3D0E4',
    search: '#162539', sink: '#0A1320',
  };
}

function POS({ T, tweaks }: { T: any; tweaks: any }) {
  const dark = tweaks.tillDark;
  const D = tillTheme(T, dark);
  const gridMode = tweaks.posGrid;      // 'cards' | 'list' | 'category'
  const { isMobile } = useViewport();
  const cartMode = isMobile ? 'sheet' : tweaks.posCart;      // 'rail' | 'sheet' | 'panel'

  const [cat, setCat] = useStateP('all');
  const [q, setQ] = useStateP('');
  const [cart, setCart] = useStateP<any[]>([]); // {id, qty}
  const [held, setHeld] = useStateP(2);
  const [parked, setParked] = useStateP<any[]>([]);
  const [parkedOpen, setParkedOpen] = useStateP(false);
  const [sheetOpen, setSheetOpen] = useStateP(false);
  const [charged, setCharged] = useStateP<any>(null); // payment method id when charged
  const [payOpen, setPayOpen] = useStateP(false);
  const [posting, setPosting] = useStateP(false);  // sale POST in flight
  const [invoice, setInvoice] = useStateP<any>(null);   // invoice_no returned by the API
  const [postErr, setPostErr] = useStateP<any>(null);
  // till context: selected customer, reference data, variation picker, points redeem
  const [customer, setCustomer] = useStateP<any>(null);
  const [custOpen, setCustOpen] = useStateP(false);
  const [contacts, setContacts] = useStateP<any[]>([]);
  const [custGroups, setCustGroups] = useStateP<any[]>([]);
  const [reward, setReward] = useStateP<any>(null);
  const [varPick, setVarPick] = useStateP<any>(null);    // product awaiting a variation choice
  const [redeem, setRedeem] = useStateP(false);
  const [register, setRegister] = useStateP<any>(null);  // open cash register (or null)
  const [regModal, setRegModal] = useStateP<any>(null);  // 'open' | 'details' | 'close'
  const [priceGroups, setPriceGroups] = useStateP<any[]>([]);
  const [priceGroupId, setPriceGroupId] = useStateP<any>(0);
  const [discounts, setDiscounts] = useStateP<any[]>([]);
  const [serviceTypes, setServiceTypes] = useStateP<any[]>([]);
  const [serviceTypeId, setServiceTypeId] = useStateP<any>('');
  const [payMode, setPayMode] = useStateP('quick'); // 'quick' | 'split'
  const [tenders, setTenders] = useStateP<any[]>([]);      // split-payment lines [{method, amount}]
  const [changeDue, setChangeDue] = useStateP(0);

  // Catalog: default to the seed (mock mode); in real mode load it from /api/v1.
  const [prods, setProds] = useStateP<any[]>(PRODUCTS);
  const [cats, setCats] = useStateP<any[]>(CATEGORIES);

  useEffectP(() => {
    API.contact.list({ type: 'customer' }).then(setContacts).catch(() => {});
    API.customerGroup.list().then(setCustGroups).catch(() => {});
    API.reward.getSettings().then(setReward).catch(() => {});
    API.register.current().then(setRegister).catch(() => {});
    API.priceGroup.list().then(setPriceGroups).catch(() => {});
    API.heldSale.list().then(setParked).catch(() => {});
    API.serviceType.list().then(setServiceTypes).catch(() => {});
    API.discount.list().then(setDiscounts).catch(() => {});
    if (API.config?.isReal?.()) {
      API.product.list().then((r: any) => setProds(r.items || [])).catch(() => {});
      API.category.list().then((cs: any) => setCats([{ id: 'all', name: 'All Items' }, ...(cs || [])])).catch(() => {});
    }
  }, []);
  // keep the register's running totals fresh (every 30s)
  useEffectP(() => {
    const t = setInterval(() => { API.register.current().then(setRegister).catch(() => {}); }, 30000);
    return () => clearInterval(t);
  }, []);
  const refreshRegister = () => API.register.current().then(setRegister).catch(() => {});

  const items = useMemo(() => {
    let list = prods;
    if (cat !== 'all' && gridMode !== 'category') list = list.filter((p: any) => p.cat === cat);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((p: any) => p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s));
    }
    return list;
  }, [cat, q, gridMode, prods]);

  // group-adjusted price + variation resolution
  const group = customer ? custGroups.find((g: any) => g.id === customer.customer_group_id) : null;
  const groupMult = group ? 1 + (group.amount || 0) / 100 : 1;
  const activePG = priceGroups.find((g: any) => g.id === priceGroupId) || null;
  const usePG = activePG && activePG.id !== 0;
  const priceOf = (p: any, varName?: any) => {
    let base = p.price;
    if (varName && p.variations) { const v = p.variations.find((v: any) => v.name === varName); if (v) base = v.price; }
    if (usePG) {
      const override = p.group_prices && p.group_prices[activePG.id];
      return override != null ? Number(override) : Math.round(base * (1 + (activePG.percent || 0) / 100) * 100) / 100;
    }
    return Math.round(base * groupMult * 100) / 100;
  };
  const stockOf = (p: any, varName?: any) => {
    if (varName && p.variations) { const v = p.variations.find((v: any) => v.name === varName); return v ? v.stock : 0; }
    return p.stock;
  };

  const lines = cart.map((c: any) => {
    const p: any = prods.find((p: any) => p.id === c.id) || {};
    return { key: c.key, id: c.id, varName: c.varName, name: p.name + (c.varName ? ` · ${c.varName}` : ''), sw: p.sw, img: p.img, unit: p.unit, type: p.type, price: priceOf(p, c.varName), stock: stockOf(p, c.varName), qty: c.qty, brand_id: p.brand_id, cat: p.cat };
  });
  const subtotal = lines.reduce((s: number, l: any) => s + l.price * l.qty, 0);
  const taxRate = 0.05;
  const tax = subtotal * taxRate;

  // ── Auto-apply matching discount rules (by brand / category / location, in
  //    date window, highest priority wins per line). Zero impact if no rules. ──
  const locId = (register && register.location_id) || null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const ruleMatches = (r: any, l: any) =>
    r.is_active && (!r.starts_at || r.starts_at <= todayStr) && (!r.ends_at || r.ends_at >= todayStr)
    && (!r.brand_id || String(r.brand_id) === String(l.brand_id))
    && (!r.category || String(r.category) === String(l.cat))
    && (!r.location_id || String(r.location_id) === String(locId));
  let autoDiscountName: string | null = null;
  const autoDiscount = +lines.reduce((sum: number, l: any) => {
    const lineTotal = l.price * l.qty;
    const best = discounts.filter((r: any) => ruleMatches(r, l)).sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0))[0];
    if (!best) return sum;
    if (!autoDiscountName) autoDiscountName = best.name;
    const d = best.type === 'percentage' ? lineTotal * (Number(best.value) || 0) / 100 : Math.min(Number(best.value) || 0, lineTotal);
    return sum + d;
  }, 0).toFixed(2);

  // reward points — earn preview + optional redeem against this sale
  const rw = reward && reward.enabled ? reward : null;
  const custPoints = rw && customer ? Math.floor((customer.total_sale || 0) / rw.amount_per_unit_point) : 0;
  const canRedeem = !!(rw && customer && custPoints >= rw.min_redeem_point && subtotal >= rw.min_order_total_redeem);
  const redeemPts = canRedeem && redeem ? Math.min(custPoints, rw.max_redeem_point) : 0;
  const redeemDiscount = Math.min(subtotal, +(redeemPts * (rw ? rw.redeem_amount_per_point : 0)).toFixed(2));
  const pointsEarned = rw && subtotal >= rw.min_order_total_earn ? Math.min(rw.max_points_per_order || Infinity, Math.floor(subtotal / rw.amount_per_unit_point)) : 0;
  const discount = +(redeemDiscount + autoDiscount).toFixed(2);
  const svcType = serviceTypes.find((s: any) => String(s.id) === String(serviceTypeId)) || null;
  const packing = svcType ? (svcType.packing_charge_type === 'percentage' ? Math.round(subtotal * svcType.packing_charge) / 100 : svcType.packing_charge) : 0;
  const total = subtotal + tax - discount + packing;
  const count = cart.reduce((s: number, c: any) => s + c.qty, 0);
  // warn before leaving/refreshing if there's an unsaved order in the cart
  useEffectP(() => {
    const handler = (e: any) => { if (cart.length) { e.preventDefault(); e.returnValue = 'You have an unsaved order in the cart. Refreshing will lose it.'; return e.returnValue; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [cart.length]);

  // warn before switching to another section (SPA navigation) while the cart has items
  useEffectP(() => {
    setNavBlock(cart.length > 0, {
      title: 'Discard this order?',
      message: 'You have an unsaved order in the cart. Leaving this page will discard it. Continue?',
    });
    return () => setNavBlock(false);
  }, [cart.length]);

  function add(p: any, varName?: any) {
    if (p.not_for_selling) return;
    if (p.type === 'variable' && p.variations && p.variations.length && !varName) { setVarPick(p); return; }
    setCharged(null);
    const key = varName ? p.id + '::' + varName : p.id;
    setCart((prev: any[]) => {
      const ex = prev.find((c: any) => c.key === key);
      if (ex) return prev.map((c: any) => c.key === key ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { key, id: p.id, varName: varName || null, qty: 1 }];
    });
  }
  function setQty(key: any, d: number) {
    setCart((prev: any[]) => prev.flatMap((c: any) => c.key !== key ? [c] : (c.qty + d <= 0 ? [] : [{ ...c, qty: c.qty + d }])));
  }
  function clear() { setCart([]); setCharged(null); setInvoice(null); setPostErr(null); setRedeem(false); setPayMode('quick'); setTenders([]); setChangeDue(0); }
  function pickCustomer(c: any) { setCustomer(c); setCustOpen(false); }
  const refreshParked = () => API.heldSale.list().then(setParked).catch(() => {});
  async function park(type: any) {
    if (!cart.length) return;
    try {
      await API.heldSale.save({ type, customer_id: customer ? customer.id : null, customer_name: customer ? customer.name : 'Walk-in', cart, total, shift_id: register ? register.id : undefined });
      refreshParked(); clear();
    } catch (e: any) { setPostErr(e.message); }
  }
  async function resume(h: any) {
    setCart(h.cart || []);
    if (h.customer_id) { const c = contacts.find((c: any) => c.id === h.customer_id); if (c) setCustomer(c); } else setCustomer(null);
    try { await API.heldSale.remove(h.id); } catch (e) {}
    refreshParked(); setParkedOpen(false);
  }
  async function removeParked(h: any) { try { await API.heldSale.remove(h.id); } catch (e) {} refreshParked(); }
  function openPay() { if (!lines.length) return; if (!register) { setRegModal('open'); return; } setPayMode('quick'); setTenders([{ method: 'cash', amount: total.toFixed(2) }]); setPayOpen(true); }
  // payments: [{method, amount}]. credit = finalize with a remaining balance on the customer.
  async function finalize(payments: any[], methodLabel?: any) {
    if (posting) return;
    const paid = payments.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
    const remaining = +(total - Math.min(paid, total)).toFixed(2);
    if (remaining > 0.001 && (!customer)) { setPostErr('Select a customer to sell on credit.'); return; }
    setPostErr(null); setPosting(true);
    try {
      const created = await API.sell.create({
        location_id: (register && register.location_id) || 1, shift_id: register ? register.id : undefined, contact_id: customer ? customer.id : 1, customer_name: customer ? customer.name : 'Walk-in',
        method: payments[0] ? payments[0].method : 'cash', amount: total, discount_amount: discount, discount_type: 'fixed', tax_amount: tax,
        redeem_points: redeemPts,
        payments: payments.filter((p: any) => Number(p.amount) > 0).map((p: any) => ({ method: p.method, amount: Number(p.amount) })),
        lines: lines.map((l: any) => ({ product_id: l.id, variation: l.varName, quantity: l.qty, unit_price: l.price })),
      });
      setInvoice(created.invoice_no);
      setChangeDue(Number(created.change_return) || 0);
      setCharged(methodLabel || (payments[0] ? payments[0].method : 'credit'));
      setPayOpen(false); setSheetOpen(false);
      refreshRegister();
      setTimeout(() => { clear(); }, 2800);
    } catch (ex: any) {
      setPostErr(ex.message || 'Could not record the sale.');
    } finally { setPosting(false); }
  }
  // quick single-method full payment
  function charge(methodId: any) { finalize([{ method: methodId, amount: total }], methodId); }
  // express checkout = instant full cash
  function expressCheckout() { if (!lines.length) return; if (!register) { setRegModal('open'); return; } finalize([{ method: 'cash', amount: total }], 'cash'); }
  // credit sale = nothing paid now, full amount on the customer
  function creditSale() { finalize([], 'credit'); }

  // ── Product tile ────────────────────────────────────────────────
  const Tile = (p: any) => {
    const inCartQty = cart.filter((c: any) => c.id === p.id).reduce((s: number, c: any) => s + c.qty, 0);
    const avail = p.stock - inCartQty;
    const low = avail <= 12;
    const inCart = inCartQty > 0;
    return (
      <button key={p.id} onClick={() => add(p)} style={{
        position: 'relative', textAlign: 'left', cursor: 'pointer', fontFamily: T.fBody,
        background: D.tile, border: `1px solid ${inCart ? T.accent.base : D.tileLine}`, borderRadius: T.rLg,
        padding: 0, overflow: 'hidden', transition: 'transform .12s, box-shadow .12s, border-color .12s',
        boxShadow: dark ? 'none' : T.sh1, display: 'flex', flexDirection: 'column',
      } as React.CSSProperties}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = dark ? '0 6px 18px rgba(0,0,0,0.4)' : T.sh2; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = dark ? 'none' : T.sh1; }}
      >
        {/* swatch header */}
        <div style={{ height: 58, background: swatchBg(p), position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: 8 } as React.CSSProperties}>
          {p.rx && <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.28)', padding: '2px 6px', borderRadius: 5, letterSpacing: 0.4 }}>Rx</span>}
          {(p.enable_stock !== false && p.stock !== Infinity) && <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: avail <= 0 ? T.red : low ? T.amber : 'rgba(0,0,0,0.32)', padding: '2px 6px', borderRadius: 5, letterSpacing: 0.3, marginLeft: 'auto' }}>{avail <= 0 ? 'Out' : `${avail} in stock`}{inCart ? ` · ${p.stock}−${inCartQty}` : ''}</span>}
          {inCart && (
            <span style={{ position: 'absolute', bottom: -11, right: 9, width: 24, height: 24, borderRadius: 7, background: T.accent.base, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, fontFamily: T.fMono, boxShadow: '0 2px 6px rgba(0,0,0,0.25)' } as React.CSSProperties}>{inCartQty}</span>
          )}
          {p.type === 'variable' && <span style={{ position: 'absolute', bottom: 7, left: 8, fontSize: 8.5, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.32)', padding: '2px 6px', borderRadius: 5, letterSpacing: 0.3 } as React.CSSProperties}>OPTIONS</span>}
        </div>
        <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', flex: 1 } as React.CSSProperties}>
          <div style={{ fontSize: 13, fontWeight: 600, color: D.ink, lineHeight: 1.25, marginBottom: 6, minHeight: 32, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{p.name}</div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: T.fMono, fontSize: 15, fontWeight: 500, color: D.ink, letterSpacing: '-0.5px' }}>{money(priceOf(p))}</span>
            <span style={{ fontSize: 10.5, color: D.mute }}>/{p.unit}</span>
          </div>
        </div>
      </button>
    );
  };

  // list-row variant (dense)
  const Row = (p: any) => {
    const inCartQty = cart.filter((c: any) => c.id === p.id).reduce((s: number, c: any) => s + c.qty, 0);
    const inCart = inCartQty > 0;
    const avail = p.stock - inCartQty;
    const low = avail <= 12;
    return (
      <button key={p.id} onClick={() => add(p)} style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: T.fBody,
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
        background: inCart ? (dark ? '#16243a' : T.accent.soft) : D.tile,
        border: `1px solid ${inCart ? T.accent.base : D.tileLine}`, borderRadius: T.r, transition: 'background .12s',
      } as React.CSSProperties}>
        <span style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: swatchBg(p) }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: D.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties}>{p.name}</span>
          <span style={{ display: 'block', fontSize: 11, color: low ? T.amberText : D.mute, fontFamily: T.fMono, marginTop: 1 }}>{p.sku}{(p.enable_stock !== false && p.stock !== Infinity) ? ` · ${avail <= 0 ? 'Out of stock' : avail + ' in stock'}${inCart ? ` (${p.stock}−${inCartQty})` : ''}` : ''}</span>
        </span>
        <span style={{ fontFamily: T.fMono, fontSize: 14, fontWeight: 500, color: D.ink }}>{money(priceOf(p))}</span>
        <span style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: inCart ? T.accent.base : (dark ? '#1d2c44' : T.paperSink), color: inCart ? '#fff' : D.sub, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, fontFamily: T.fMono }}>{inCart ? inCartQty : '+'}</span>
      </button>
    );
  };

  // ── Product area ────────────────────────────────────────────────
  const showCat = gridMode === 'category';
  const groups = showCat
    ? cats.filter((c: any) => c.id !== 'all').map((c: any) => ({ cat: c, items: items.filter((p: any) => p.cat === c.id) })).filter((g: any) => g.items.length)
    : null;

  const ProductArea = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: D.grid } as React.CSSProperties}>
      {/* search + category chips */}
      <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${D.railLine}`, background: D.railBg }}>
        <div style={{ position: 'relative', marginBottom: 12 } as React.CSSProperties}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: D.mute, fontSize: 15 } as React.CSSProperties}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search products or scan barcode…" style={{
            width: '100%', padding: '12px 14px 12px 40px', fontSize: 14, fontFamily: T.fBody,
            background: D.search, color: D.ink, border: `1.5px solid ${D.tileLine}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box',
          } as React.CSSProperties} />
          {q && <button onClick={() => setQ('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: D.mute, cursor: 'pointer', fontSize: 14 } as React.CSSProperties}>✕</button>}
        </div>
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 } as React.CSSProperties}>
          {cats.map((c: any) => {
            const active = cat === c.id;
            return (
              <button key={c.id} onClick={() => setCat(c.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, fontFamily: T.fBody, whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .14s',
                background: active ? D.chipActive : D.chip, color: active ? '#fff' : D.chipText,
                border: `1px solid ${active ? D.chipActive : D.tileLine}`,
              } as React.CSSProperties}>
                <span style={{ fontSize: 13, opacity: 0.85 }}>{c.icon}</span>{c.name}
                <span style={{ fontSize: 10.5, fontFamily: T.fMono, opacity: 0.6 }}>{c.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* grid / list / grouped */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        {gridMode === 'list' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 720, margin: '0 auto' } as React.CSSProperties}>
            {items.map(Row)}
          </div>
        ) : showCat ? (
          groups!.map((g: any) => (
            <div key={g.cat.id} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14, opacity: 0.7, color: D.sub }}>{g.cat.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: D.sub, textTransform: 'uppercase', letterSpacing: 0.8 } as React.CSSProperties}>{g.cat.name}</span>
                <span style={{ flex: 1, height: 1, background: D.tileLine }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>{g.items.map(Tile)}</div>
            </div>
          ))
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 13 }}>{items.map(Tile)}</div>
        )}
        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: D.mute } as React.CSSProperties}>
            <div style={{ fontSize: 34, marginBottom: 10, opacity: 0.5 }}>⌕</div>
            <div style={{ fontSize: 14 }}>No products match “{q}”</div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Order / cart ────────────────────────────────────────────────
  const OrderHeader = (
    <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${D.cartLine}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontFamily: T.fDisplay, fontSize: 18, fontWeight: T.dispWeight, color: D.ink, letterSpacing: T.dispTrack }}>Current Order</div>
        <div style={{ fontSize: 11.5, color: D.sub, marginTop: 2 }}>{count} {count === 1 ? 'item' : 'items'} · {customer ? customer.name : 'Walk-in customer'}{group && group.amount ? ` · ${group.name}` : ''}</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button title="Hold / suspend order" onClick={() => park('suspended')} style={iconBtn(D, T)}>⏸</button>
        <button title="Save as draft" onClick={() => park('draft')} style={iconBtn(D, T)}>⎙</button>
        <button title="Save as quotation" onClick={() => park('quotation')} style={iconBtn(D, T)}>❝</button>
        <button title="Clear order" onClick={clear} style={iconBtn(D, T)}>🗑</button>
      </div>
    </div>
  );

  const CartLines = (
    <div style={{ flex: 1, overflowY: 'auto', padding: lines.length ? '8px 12px' : 0 }}>
      {lines.length === 0 ? (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center', color: D.mute } as React.CSSProperties}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: D.sink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 14 }}>🛒</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: D.sub, marginBottom: 4 }}>No items yet</div>
          <div style={{ fontSize: 12, maxWidth: 200 }}>Tap a product to start building the order.</div>
        </div>
      ) : lines.map((l: any) => (
        <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 8px', borderBottom: `1px solid ${D.cartLine}` }}>
          <span style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: swatchBg(l) }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: D.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties}>{l.name}</div>
            <div style={{ fontSize: 11, color: D.sub, fontFamily: T.fMono, marginTop: 1 }}>{money(l.price)} × {l.qty}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setQty(l.key, -1)} style={stepBtn(D, T)}>−</button>
            <span style={{ minWidth: 22, textAlign: 'center', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: D.ink } as React.CSSProperties}>{l.qty}</span>
            <button onClick={() => setQty(l.key, +1)} style={stepBtn(D, T)}>+</button>
          </div>
          <span style={{ minWidth: 58, textAlign: 'right', fontFamily: T.fMono, fontSize: 13.5, fontWeight: 600, color: D.ink } as React.CSSProperties}>{money(l.price * l.qty)}</span>
        </div>
      ))}
    </div>
  );

  const TotalsBlock = (
    <div style={{ padding: '14px 20px 16px', borderTop: `1px solid ${D.cartLine}`, background: dark ? '#0A1320' : T.paperAlt }}>
      {[['Subtotal', subtotal], ['Tax (5%)', tax]].map(([k, v]: any) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: D.sub, marginBottom: 6 }}>
          <span>{k}</span><span style={{ fontFamily: T.fMono, color: D.ink }}>{money(v)}</span>
        </div>
      ))}
      {group && group.amount ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.green, marginBottom: 6 }}>
          <span>{group.name} pricing ({group.amount > 0 ? '+' : ''}{group.amount}%)</span><span style={{ fontFamily: T.fMono }}>applied</span>
        </div>
      ) : null}
      {canRedeem && (
        <button onClick={() => setRedeem((r: any) => !r)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', marginBottom: 8, borderRadius: 8, cursor: 'pointer', background: redeem ? T.accent.soft : 'transparent', border: `1px solid ${redeem ? T.accent.base : D.tileLine}`, fontFamily: T.fBody }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: redeem ? T.accent.text : D.sub }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${redeem ? T.accent.base : D.mute}`, background: redeem ? T.accent.base : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{redeem ? '✓' : ''}</span>
            Redeem {custPoints} points
          </span>
          <span style={{ fontFamily: T.fMono, fontSize: 12, color: T.greenText }}>−{money(custPoints * rw.redeem_amount_per_point)}</span>
        </button>
      )}
      {redeemDiscount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.green, marginBottom: 6 }}>
          <span>Points redeemed ({redeemPts})</span><span style={{ fontFamily: T.fMono }}>−{money(redeemDiscount)}</span>
        </div>
      )}
      {autoDiscount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.green, marginBottom: 6 }}>
          <span>Discount{autoDiscountName ? ` (${autoDiscountName})` : ''}</span><span style={{ fontFamily: T.fMono }}>−{money(autoDiscount)}</span>
        </div>
      )}
      {packing > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: D.sub, marginBottom: 6 }}>
          <span>Packing ({svcType.name})</span><span style={{ fontFamily: T.fMono, color: D.ink }}>{money(packing)}</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10, paddingTop: 12, borderTop: `1px dashed ${D.tileLine}` }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: D.ink, textTransform: 'uppercase', letterSpacing: 0.6 } as React.CSSProperties}>Total</span>
        <span style={{ fontFamily: T.fMono, fontWeight: 500, fontSize: 32, color: D.ink, letterSpacing: '-1.5px' }}>{money(total)}</span>
      </div>
      <button onClick={openPay} disabled={!lines.length} style={{
        width: '100%', marginTop: 14, padding: '16px', borderRadius: T.r, cursor: lines.length ? 'pointer' : 'not-allowed',
        border: 'none', fontFamily: T.fBody, fontSize: 16, fontWeight: 700, letterSpacing: 0.2,
        color: '#fff', background: lines.length ? `linear-gradient(135deg, ${T.accent.bright}, ${T.accent.base})` : D.tileLine,
        boxShadow: lines.length ? '0 6px 18px rgba(161,98,7,0.32)' : 'none', transition: 'all .15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      }}>
        <span>Charge {money(total)}</span>
        <span style={{ opacity: 0.7, fontSize: 18 }}>→</span>
      </button>
      {pointsEarned > 0 && <div style={{ textAlign: 'center', marginTop: 9, fontSize: 11, color: D.sub } as React.CSSProperties}>Earns <b style={{ color: T.accent.text }}>{pointsEarned} {(rw.display_name || 'points').toLowerCase()}</b>{customer ? ` for ${customer.name.split(' ')[0]}` : ' — add a customer to award'}</div>}
    </div>
  );

  const Order = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: D.cart } as React.CSSProperties}>
      {OrderHeader}{CartLines}{TotalsBlock}
    </div>
  );

  // ── Layout assembly per cartMode ────────────────────────────────
  const railWidth = cartMode === 'panel' ? 420 : 360;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: D.bg } as React.CSSProperties}>
      {/* POS top bar */}
      <div style={{ height: 56, minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', background: D.railBg, borderBottom: `1px solid ${D.railLine}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {isMobile && <button onClick={() => (window as any).__bzOpenDrawer && (window as any).__bzOpenDrawer()} aria-label="Menu" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, border: `1px solid ${D.railLine}`, background: D.chip, color: D.ink, cursor: 'pointer', fontSize: 16 }}>☰</button>}
          <span style={{ fontFamily: T.fDisplay, fontSize: 18, fontWeight: T.dispWeight, color: D.ink, letterSpacing: T.dispTrack, whiteSpace: 'nowrap' } as React.CSSProperties}>Point of Sale</span>
          {!isMobile && (register
            ? <button onClick={() => setRegModal('details')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 99, cursor: 'pointer', background: T.greenSoft, border: `1px solid ${T.green}33`, color: T.greenText, fontSize: 11.5, fontWeight: 700, fontFamily: T.fBody }}>● Register open · {money(register.expected_cash)}</button>
            : <button onClick={() => setRegModal('open')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 99, cursor: 'pointer', background: T.amberSoft, border: `1px solid ${T.amber}33`, color: T.amberText, fontSize: 11.5, fontWeight: 700, fontFamily: T.fBody }}>○ Open register</button>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isMobile && <button onClick={() => setParkedOpen(true)} style={{ ...pillBtn(D, T), border: parked.length ? `1px solid ${T.accent.base}` : pillBtn(D, T).border, color: parked.length ? T.accent.text : D.chipText }}>⏸ Parked <b style={{ fontFamily: T.fMono }}>{parked.length}</b></button>}
          <button onClick={() => setCustOpen(true)} style={{ ...pillBtn(D, T), border: customer ? `1px solid ${T.accent.base}` : pillBtn(D, T).border, color: customer ? T.accent.text : pillBtn(D, T).color }}>◉ {customer ? customer.name.split(' ')[0] : 'Walk-in'}{customer ? ' ▾' : ''}</button>
          {priceGroups.length > 1 && (
            <select value={priceGroupId} onChange={e => setPriceGroupId(/^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value)} title="Selling price group" style={{ ...pillBtn(D, T), border: priceGroupId ? `1px solid ${T.accent.base}` : pillBtn(D, T).border, color: priceGroupId ? T.accent.text : D.chipText, appearance: 'none', cursor: 'pointer', paddingRight: 12 } as React.CSSProperties}>
              {priceGroups.map((g: any) => <option key={g.id} value={g.id}>{g.id === 0 ? '⊞ Default price' : '⊞ ' + g.name + (g.percent ? ` (${g.percent > 0 ? '+' : ''}${g.percent}%)` : '')}</option>)}
            </select>
          )}
          {!isMobile && serviceTypes.length > 0 && (
            <select value={serviceTypeId} onChange={e => setServiceTypeId(e.target.value)} title="Type of service" style={{ ...pillBtn(D, T), border: serviceTypeId ? `1px solid ${T.accent.base}` : pillBtn(D, T).border, color: serviceTypeId ? T.accent.text : D.chipText, appearance: 'none', cursor: 'pointer', paddingRight: 12 } as React.CSSProperties}>
              <option value="">⍰ Service…</option>
              {serviceTypes.map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.packing_charge ? ` (+${s.packing_charge_type === 'percentage' ? s.packing_charge + '%' : '$' + s.packing_charge})` : ''}</option>)}
            </select>
          )}
          {!isMobile && <><div style={{ width: 1, height: 22, background: D.railLine, margin: '0 2px' }} /><span style={{ fontSize: 12, color: D.sub, fontFamily: T.fMono }}>{CASHIER.name}</span></>}
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' } as React.CSSProperties}>
        {ProductArea}

        {/* rail / panel */}
        {cartMode !== 'sheet' && (
          <div style={{ width: railWidth, minWidth: railWidth, background: D.cart, borderLeft: `1px solid ${D.cartLine}`, boxShadow: dark ? 'none' : '-8px 0 24px rgba(40,30,12,0.04)' }}>
            {Order}
          </div>
        )}

        {/* sheet mode: floating bar + slide-up */}
        {cartMode === 'sheet' && (
          <>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, background: `linear-gradient(to top, ${D.bg} 70%, transparent)`, pointerEvents: 'none' } as React.CSSProperties}>
              <button onClick={() => setSheetOpen(true)} style={{
                pointerEvents: 'auto', width: '100%', maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', borderRadius: T.rLg, border: 'none', cursor: 'pointer', fontFamily: T.fBody,
                background: T.navy, color: '#fff', boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
              } as React.CSSProperties}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontFamily: T.fMono, fontWeight: 700 }}>{count}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>View order</span>
                </span>
                <span style={{ fontFamily: T.fMono, fontSize: 19, fontWeight: 500, letterSpacing: '-0.5px' }}>{money(total)}</span>
              </button>
            </div>
            {sheetOpen && (
              <div onClick={() => setSheetOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,20,0.5)', backdropFilter: 'blur(2px)', zIndex: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' } as React.CSSProperties}>
                <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, height: '82%', background: D.cart, borderRadius: `${T.rXl}px ${T.rXl}px 0 0`, overflow: 'hidden', boxShadow: T.shModal, animation: 'sheetUp .25s cubic-bezier(.2,.7,.3,1)' }}>
                  {Order}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment modal */}
      {payOpen && (() => {
        const paid = tenders.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
        const remaining = +(total - paid).toFixed(2);
        const change = +Math.max(0, paid - total).toFixed(2);
        const setT = (i: number, k: any, v: any) => setTenders((ts: any[]) => ts.map((t: any, j: number) => j === i ? { ...t, [k]: v } : t));
        return (
        <div onClick={() => !posting && setPayOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,20,0.55)', backdropFilter: 'blur(3px)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 } as React.CSSProperties}>
          <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: T.paper, borderRadius: T.rXl, boxShadow: T.shModal, overflow: 'hidden', animation: 'sheetUp .22s cubic-bezier(.2,.7,.3,1)' } as React.CSSProperties}>
            <div style={{ padding: '18px 24px', borderBottom: `1px solid ${T.line}`, textAlign: 'center' } as React.CSSProperties}>
              <div style={{ fontSize: 12, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 } as React.CSSProperties}>Amount due</div>
              <div style={{ fontFamily: T.fMono, fontSize: 40, fontWeight: 500, color: T.ink, letterSpacing: '-2px', marginTop: 2 }}>{money(total)}</div>
            </div>
            {/* mode tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '12px 20px 0' }}>
              {[['quick', 'Quick pay'], ['split', 'Split / Tender']].map(([m, lbl]: any) => (
                <button key={m} onClick={() => { setPayMode(m); if (m === 'split' && !tenders.length) setTenders([{ method: 'cash', amount: total.toFixed(2) }]); }} style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${payMode === m ? T.accent.base : T.line}`, background: payMode === m ? T.accent.soft : T.paper, color: payMode === m ? T.accent.text : T.inkMid, fontFamily: T.fBody, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {payMode === 'quick' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, opacity: posting ? 0.5 : 1, pointerEvents: posting ? 'none' : 'auto' } as React.CSSProperties}>
                  {PAYMENT_METHODS.map((m: any) => (
                    <button key={m.id} onClick={() => charge(m.id)} disabled={posting} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '15px 16px', cursor: posting ? 'wait' : 'pointer',
                      background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.rLg, fontFamily: T.fBody, transition: 'all .14s',
                    } as React.CSSProperties}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent.base; e.currentTarget.style.background = T.accent.soft; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = T.paper; }}>
                      <span style={{ fontSize: 20, color: T.accent.base }}>{m.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{m.label}</span>
                      <span style={{ fontSize: 11, color: T.inkSub }}>Pay {money(total)} in full</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 } as React.CSSProperties}>
                  {tenders.map((t: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select value={t.method} onChange={e => setT(i, 'method', e.target.value)} style={{ flex: 1, padding: '10px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none' }}>
                        {PAYMENT_METHODS.map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                      <input type="number" value={t.amount} onChange={e => setT(i, 'amount', e.target.value)} style={{ width: 110, padding: '10px', fontSize: 14, fontFamily: T.fMono, textAlign: 'right', color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} />
                      {tenders.length > 1 && <button onClick={() => setTenders((ts: any[]) => ts.filter((_: any, j: number) => j !== i))} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer' }}>✕</button>}
                    </div>
                  ))}
                  <button onClick={() => setTenders((ts: any[]) => [...ts, { method: 'cash', amount: Math.max(0, remaining).toFixed(2) }])} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: T.accent.text, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: T.fBody, padding: '4px 0' }}>+ Add payment line</button>
                  <div style={{ marginTop: 6, borderTop: `1px dashed ${T.line}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 } as React.CSSProperties}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: T.inkSub }}>Tendered</span><span style={{ fontFamily: T.fMono, color: T.ink }}>{money(paid)}</span></div>
                    {change > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}><span style={{ color: T.greenText }}>Change return</span><span style={{ fontFamily: T.fMono, color: T.greenText }}>{money(change)}</span></div>}
                    {remaining > 0.001 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}><span style={{ color: T.amberText }}>Remaining{customer ? ' → credit' : ''}</span><span style={{ fontFamily: T.fMono, color: T.amberText }}>{money(remaining)}</span></div>}
                  </div>
                  {remaining > 0.001 && !customer && <div style={{ fontSize: 11.5, color: T.redText, marginTop: 4 }}>Select a customer to leave a balance on credit.</div>}
                  <Btn T={T} kind="accent" onClick={() => finalize(tenders, tenders[0] && tenders[0].method)} disabled={posting || (remaining > 0.001 && !customer)} style={{ marginTop: 10, width: '100%', padding: '13px' }}>{posting ? 'Recording…' : remaining > 0.001 ? `Finalize · ${money(remaining)} credit` : change > 0 ? `Finalize · ${money(change)} change` : 'Finalize payment'}</Btn>
                </div>
              )}

              {/* credit + express row */}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, opacity: posting ? 0.5 : 1, pointerEvents: posting ? 'none' : 'auto' } as React.CSSProperties}>
                <Btn T={T} kind="ghost" style={{ flex: 1 }} onClick={creditSale} disabled={!customer}>◈ Credit sale</Btn>
                <Btn T={T} kind="ghost" style={{ flex: 1 }} onClick={() => finalize([{ method: 'cash', amount: total }], 'cash')}>⚡ Express cash</Btn>
              </div>
              {payMode === 'quick' && !customer && <div style={{ fontSize: 11, color: T.inkMute, marginTop: 8, textAlign: 'center' } as React.CSSProperties}>Credit sale needs a customer — pick one from the till.</div>}

              {postErr && (
                <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>⚠</span>{postErr}
                </div>
              )}
              <button onClick={() => setPayOpen(false)} disabled={posting} style={{ width: '100%', marginTop: 12, padding: 10, background: 'none', border: 'none', color: T.inkSub, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.fBody }}>Cancel</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Charged toast */}
      {charged && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,20,0.6)', backdropFilter: 'blur(3px)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties}>
          <div style={{ textAlign: 'center', animation: 'sheetUp .25s cubic-bezier(.2,.7,.3,1)' } as React.CSSProperties}>
            <div style={{ width: 90, height: 90, borderRadius: '50%', background: T.green, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', boxShadow: '0 12px 36px rgba(14,159,110,0.5)', fontSize: 44, color: '#fff' }}>✓</div>
            <div style={{ fontFamily: T.fDisplay, fontSize: 26, fontWeight: T.dispWeight, color: '#fff', letterSpacing: T.dispTrack }}>{charged === 'credit' ? 'Sale on credit' : 'Payment received'}</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>{money(total)} · {charged === 'credit' ? 'Credit' : (PAYMENT_METHODS.find((m: any) => m.id === charged)?.label || 'Paid')} · Receipt sent</div>
            {changeDue > 0 && <div style={{ fontSize: 20, color: '#fff', marginTop: 12, fontFamily: T.fMono, fontWeight: 700, background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 18px', display: 'inline-block' }}>Change {money(changeDue)}</div>}
            {invoice && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', marginTop: 12, fontFamily: T.fMono }}>Invoice {invoice}</div>}
          </div>
        </div>
      )}

      {/* Variation picker */}
      {varPick && (
        <div onClick={() => setVarPick(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,20,0.55)', backdropFilter: 'blur(3px)', zIndex: 65, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 } as React.CSSProperties}>
          <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', background: T.paper, borderRadius: T.rXl, boxShadow: T.shModal, overflow: 'hidden', animation: 'sheetUp .22s cubic-bezier(.2,.7,.3,1)' } as React.CSSProperties}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ fontFamily: T.fDisplay, fontSize: 19, fontWeight: T.dispWeight, color: T.ink }}>{varPick.name}</div>
              <div style={{ fontSize: 12.5, color: T.inkSub, marginTop: 2 }}>Choose a variation</div>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 } as React.CSSProperties}>
              {(varPick.variations || []).map((v: any) => {
                const out = v.stock <= 0;
                return (
                  <button key={v.name} disabled={out} onClick={() => { add(varPick, v.name); setVarPick(null); }} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderRadius: T.r, cursor: out ? 'not-allowed' : 'pointer', fontFamily: T.fBody,
                    background: T.paper, border: `1.5px solid ${T.line}`, opacity: out ? 0.5 : 1,
                  }}
                    onMouseEnter={e => { if (!out) { e.currentTarget.style.borderColor = T.accent.base; e.currentTarget.style.background = T.accent.soft; } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = T.paper; }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{v.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 11, color: out ? T.redText : T.inkSub }}>{out ? 'Out of stock' : `${v.stock} left`}</span>
                      <span style={{ fontFamily: T.fMono, fontSize: 15, fontWeight: 600, color: T.ink }}>{money(priceOf(varPick, v.name))}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Customer picker */}
      {custOpen && (
        <div onClick={() => setCustOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,20,0.55)', backdropFilter: 'blur(3px)', zIndex: 65, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 } as React.CSSProperties}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', maxHeight: '78%', display: 'flex', flexDirection: 'column', background: T.paper, borderRadius: T.rXl, boxShadow: T.shModal, overflow: 'hidden', animation: 'sheetUp .22s cubic-bezier(.2,.7,.3,1)' } as React.CSSProperties}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: T.fDisplay, fontSize: 19, fontWeight: T.dispWeight, color: T.ink }}>Select customer</div>
              {customer && <button onClick={() => { setCustomer(null); setRedeem(false); setCustOpen(false); }} style={{ fontSize: 12, fontWeight: 700, color: T.redText, background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              <button onClick={() => { setCustomer(null); setRedeem(false); setCustOpen(false); }} style={custRow(T, !customer)}>
                <span style={{ width: 34, height: 34, borderRadius: 99, background: T.paperSink, color: T.inkSub, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>◉</span>
                <span style={{ flex: 1, textAlign: 'left', fontSize: 13.5, fontWeight: 600, color: T.ink } as React.CSSProperties}>Walk-in customer</span>
              </button>
              {contacts.filter((c: any) => c.name !== 'Walk-in Customer').map((c: any) => {
                const g = custGroups.find((x: any) => x.id === c.customer_group_id);
                return (
                  <button key={c.id} onClick={() => pickCustomer(c)} style={custRow(T, customer && customer.id === c.id)}>
                    <span style={{ width: 34, height: 34, borderRadius: 99, background: T.accent.soft, color: T.accent.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{c.name.split(' ').map((w: any) => w[0]).slice(0, 2).join('')}</span>
                    <span style={{ flex: 1, textAlign: 'left', minWidth: 0 } as React.CSSProperties}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: T.ink }}>{c.name}</span>
                      <span style={{ display: 'block', fontSize: 11, color: T.inkSub }}>{c.mobile || c.contact_id}</span>
                    </span>
                    {g && g.amount ? <Badge T={T} tone="blue">{g.name} {g.amount > 0 ? '+' : ''}{g.amount}%</Badge> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {regModal && <RegisterModal T={T} mode={regModal} register={register} onClose={() => setRegModal(null)}
        onSwitchClose={() => setRegModal('close')}
        onOpened={(r: any) => { setRegister(r); setRegModal(null); }}
        onClosed={() => { setRegister(null); setRegModal(null); }} />}

      {/* Parked orders */}
      {parkedOpen && (
        <div onClick={() => setParkedOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,20,0.55)', backdropFilter: 'blur(3px)', zIndex: 65, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 } as React.CSSProperties}>
          <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '100%', maxHeight: '82%', display: 'flex', flexDirection: 'column', background: T.paper, borderRadius: T.rXl, boxShadow: T.shModal, overflow: 'hidden', animation: 'sheetUp .22s cubic-bezier(.2,.7,.3,1)' } as React.CSSProperties}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ fontFamily: T.fDisplay, fontSize: 19, fontWeight: T.dispWeight, color: T.ink }}>Parked orders</div>
              <div style={{ fontSize: 12.5, color: T.inkSub, marginTop: 2 }}>Suspended sales, drafts & quotations</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
              {parked.length === 0 && <div style={{ padding: '40px 10px', textAlign: 'center', color: T.inkMute, fontSize: 13 } as React.CSSProperties}>Nothing parked. Hold an order, or save it as a draft or quotation.</div>}
              {parked.map((h: any) => {
                const tone = h.type === 'quotation' ? 'blue' : h.type === 'draft' ? 'violet' : 'amber';
                return (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', border: `1px solid ${T.line}`, borderRadius: T.r, background: T.paper, marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: T.fMono, fontSize: 12.5, fontWeight: 700, color: T.ink }}>{h.ref}</span>
                        <Badge T={T} tone={tone}>{h.type}</Badge>
                      </div>
                      <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 3 }}>{h.customer_name} · {h.item_count} items · {h.created_at}</div>
                    </div>
                    <span style={{ fontFamily: T.fMono, fontSize: 14, fontWeight: 600, color: T.ink }}>{money(h.total)}</span>
                    <Btn T={T} kind="accent" onClick={() => resume(h)}>Resume</Btn>
                    <button onClick={() => removeParked(h)} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.line}`, background: T.paper, color: T.redText, cursor: 'pointer', fontSize: 13 }}>🗑</button>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '12px 22px', borderTop: `1px solid ${T.line}`, fontSize: 11, color: T.inkMute, lineHeight: 1.5 }}>Drafts & quotations don't deduct stock until finalized. Resume loads the order back to the till.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function custRow(T: any, active: any): React.CSSProperties {
  return { width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: T.fBody, marginBottom: 4, background: active ? T.accent.soft : 'transparent', border: `1px solid ${active ? T.accent.base : 'transparent'}` };
}

// ── Cash register: open / details / close ───────────────────────────
function RegisterModal({ T, mode, register, onClose, onOpened, onClosed, onSwitchClose }: { T: any; mode: any; register: any; onClose: () => void; onOpened: (r: any) => void; onClosed: () => void; onSwitchClose: () => void }) {
  const [openingCash, setOpeningCash] = useStateP('100');
  const [locId, setLocId] = useStateP<any>('');   // location id (UUID in real mode)
  const [locs, setLocs] = useStateP<any[]>([]);
  const [closeForm, setCloseForm] = useStateP<any>({ total_cash: '', total_card: '', total_cheque: '', note: '' });
  const [busy, setBusy] = useStateP(false);
  const [err, setErr] = useStateP<any>(null);
  const [shiftId, setShiftId] = useStateP<any>('');
  const [shifts, setShifts] = useStateP<any[]>([]);
  useEffectP(() => { if (mode === 'open') { API.location.list().then((ls: any[]) => { setLocs(ls); if (ls && ls[0]) setLocId(String(ls[0].id)); }).catch(() => {}); API.register.shifts().then(setShifts).catch(() => {}); } }, [mode]);

  async function doOpen() {
    setBusy(true); setErr(null);
    try { const r = await API.register.open({ opening_cash: Number(openingCash || 0), location_id: locId || undefined, shift_id: shiftId || undefined }); onOpened(r); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function doClose() {
    setBusy(true); setErr(null);
    try { await API.register.close(register.id, { total_cash: Number(closeForm.total_cash || 0), total_card: Number(closeForm.total_card || 0), total_cheque: Number(closeForm.total_cheque || 0), note: closeForm.note }); onClosed(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (mode === 'open') {
    return (
      <Modal T={T} title="Open cash register" subtitle="Start your till session" width={440} onClose={onClose}
        footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={doOpen} disabled={busy}>{busy ? 'Opening…' : 'Open register'}</Btn></>}>
        <FormGrid>
          <Field T={T} label="Cash in hand" full><TextField T={T} type="number" value={openingCash} onChange={setOpeningCash} placeholder="0.00" /></Field>
          <Field T={T} label="Location" full><SelectField T={T} value={String(locId)} options={locs.map((l: any) => String(l.id))} onChange={(v: any) => setLocId(v)} render={(v: any) => (locs.find((l: any) => String(l.id) === v) || {}).name} /></Field>
          {shifts.length > 0 && <Field T={T} label="Assign shift (optional)" full><SelectField T={T} value={String(shiftId)} options={['', ...shifts.map((s: any) => String(s.id))]} onChange={(v: any) => setShiftId(v)} render={(v: any) => { if (!v) return 'No shift — default cashier'; const s = shifts.find((x: any) => String(x.id) === v) || {}; return `${s.employee_name} · ${s.start}–${s.end}`; }} /></Field>}
        </FormGrid>
        <div style={{ fontSize: 11.5, color: T.inkMute, marginTop: 10, lineHeight: 1.5 }}>{shifts.length > 0 ? 'Assigning a shift records who is on the till for this session.' : 'Every sale this session is logged to the register. Close it at the end of the shift to reconcile cash.'}</div>
        {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
      </Modal>
    );
  }
  if (!register) return null;
  const methodRows = [['cash', 'Cash'], ['zaad', 'Zaad'], ['evc', 'EVC Plus'], ['card', 'Card'], ['bank', 'Bank'], ['advance', 'Advance']].filter(([k]: any) => (register.totals[k] || 0) > 0);

  if (mode === 'details') {
    return (
      <Modal T={T} title="Register details" subtitle={`Opened ${register.opened_at} · ${register.location_name}`} width={460} onClose={onClose} footer={null}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <MiniStat T={T} label="Opening cash" value={money(register.opening_cash)} />
          <MiniStat T={T} label="Total sales" value={money(register.total_sales)} tone={T.green} />
          <MiniStat T={T} label="Refunds" value={money(register.refunds)} tone={register.refunds ? T.red : T.ink} />
          <MiniStat T={T} label="Transactions" value={String(register.tx_count)} />
        </div>
        <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '8px 13px', background: T.paperAlt, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub } as React.CSSProperties}>Payments by method</div>
          {methodRows.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 12.5, color: T.inkMute } as React.CSSProperties}>No sales yet this session.</div>}
          {methodRows.map(([k, lbl]: any) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 13px', borderTop: `1px solid ${T.line}`, fontSize: 13 }}>
              <span style={{ color: T.inkMid }}>{lbl}</span><span style={{ fontFamily: T.fMono, fontWeight: 600, color: T.ink }}>{money(register.totals[k])}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 13px', borderTop: `1px solid ${T.line}`, background: T.accent.soft }}>
            <span style={{ fontWeight: 700, color: T.accent.text }}>Expected cash in drawer</span><span style={{ fontFamily: T.fMono, fontWeight: 700, color: T.accent.text }}>{money(register.expected_cash)}</span>
          </div>
        </div>
        <Btn T={T} kind="danger" onClick={onSwitchClose} style={{ width: '100%' }}>Close register & reconcile</Btn>
      </Modal>
    );
  }

  // mode === 'close'
  const counted = Number(closeForm.total_cash || 0);
  const diff = +(counted - register.expected_cash).toFixed(2);
  return (
    <Modal T={T} title="Close register" subtitle="Count the drawer to reconcile" width={460} onClose={onClose}
      footer={<><div style={{ flex: 1, fontSize: 12.5, color: diff === 0 ? T.greenText : T.amberText }}>{closeForm.total_cash === '' ? '' : (diff === 0 ? '✓ Balanced' : `${diff > 0 ? 'Over' : 'Short'} ${money(Math.abs(diff))}`)}</div><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="danger" onClick={doClose} disabled={busy}>{busy ? 'Closing…' : 'Close register'}</Btn></>}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}`, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: T.inkMid }}>Expected cash</span><span style={{ fontFamily: T.fMono, fontSize: 16, fontWeight: 600, color: T.ink }}>{money(register.expected_cash)}</span>
      </div>
      <FormGrid>
        <Field T={T} label="Counted cash"><TextField T={T} type="number" value={closeForm.total_cash} onChange={(v: any) => setCloseForm((f: any) => ({ ...f, total_cash: v }))} placeholder="0.00" /></Field>
        <Field T={T} label="Card slips"><TextField T={T} type="number" value={closeForm.total_card} onChange={(v: any) => setCloseForm((f: any) => ({ ...f, total_card: v }))} placeholder="0.00" /></Field>
        <Field T={T} label="Cheques"><TextField T={T} type="number" value={closeForm.total_cheque} onChange={(v: any) => setCloseForm((f: any) => ({ ...f, total_cheque: v }))} placeholder="0.00" /></Field>
        <Field T={T} label="Note"><TextField T={T} value={closeForm.note} onChange={(v: any) => setCloseForm((f: any) => ({ ...f, note: v }))} placeholder="optional" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function MiniStat({ T, label, value, tone }: { T: any; label: any; value: any; tone?: any }) {
  return (
    <div style={{ background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r, padding: '11px 13px' }}>
      <div style={{ fontSize: 10, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 } as React.CSSProperties}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: tone || T.ink, fontFamily: T.fMono, marginTop: 4, letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  );
}

function iconBtn(D: any, T: any): React.CSSProperties { return { width: 32, height: 32, borderRadius: 8, cursor: 'pointer', background: D.chip, border: `1px solid ${D.tileLine}`, color: D.sub, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }; }
function stepBtn(D: any, T: any): React.CSSProperties { return { width: 26, height: 26, borderRadius: 7, cursor: 'pointer', background: D.sink, border: `1px solid ${D.tileLine}`, color: D.ink, fontSize: 16, fontWeight: 700, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fMono }; }
function pillBtn(D: any, T: any): React.CSSProperties { return { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', background: D.chip, border: `1px solid ${D.tileLine}`, color: D.chipText, fontSize: 12, fontWeight: 600, fontFamily: T.fBody }; }
