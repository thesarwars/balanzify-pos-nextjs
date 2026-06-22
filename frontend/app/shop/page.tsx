'use client';
// ═══════════════════════════════════════════════════════════════════
//  Public storefront — the consumer side, app-free. A customer opens
//  /shop?b=<businessId> (a link or WhatsApp), browses the catalog, and
//  places a delivery order with no account. Self-contained: does NOT
//  use the authed app shell. Talks to the public /api/v1/shop endpoints.
//  Uses a query param (not a dynamic path) so it works under static export.
// ═══════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';

type Product = { id: string; name: string; price: number; unit: string; image: string | null };
type Shop = { id: string; name: string; currency: string };
const NAVY = '#0E1C33', BRASS = '#D9A441', INK = '#1A2230', SUB = '#6B7686', LINE = '#E7E2D6', PAPER = '#FBF8F1';
const money = (n: number, c = 'USD') => (c === 'USD' ? '$' : c + ' ') + Number(n || 0).toFixed(2);

export default function Storefront() {
  const [businessId, setBusinessId] = useState('');
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ customer_name: '', phone: '', address: '' });
  const [placed, setPlaced] = useState<{ order_id: string; order_amount: number; items: string[] } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const b = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('b') || '' : '';
    setBusinessId(b);
    if (!b) { setErr('No shop specified.'); setLoading(false); return; }
    API.shop.catalog(b)
      .then((r: { shop: Shop; products: Product[] }) => { setShop(r.shop); setProducts(r.products || []); })
      .catch(() => setErr('This shop is not available for orders right now.'))
      .finally(() => setLoading(false));
  }, []);

  const add = (id: string, d: number) => setQty((q) => { const n = Math.max(0, (q[id] || 0) + d); const c = { ...q }; if (n) c[id] = n; else delete c[id]; return c; });
  const cart = useMemo(() => products.filter((p) => qty[p.id] > 0).map((p) => ({ ...p, q: qty[p.id] })), [products, qty]);
  const total = cart.reduce((s, c) => s + c.price * c.q, 0);
  const cur = shop?.currency || 'USD';

  const submit = async () => {
    if (!cart.length || !form.customer_name.trim() || !form.address.trim()) { setErr('Add items and fill your name + address.'); return; }
    setErr(''); setSubmitting(true);
    try {
      const res = await API.shop.order(businessId, {
        customer_name: form.customer_name, phone: form.phone || undefined, address: form.address,
        items: cart.map((c) => ({ product_id: c.id, quantity: c.q })),
      });
      setPlaced(res);
    } catch {
      setErr('Could not place the order. Please try again.');
    } finally { setSubmitting(false); }
  };

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 16 };
  const input: React.CSSProperties = { width: '100%', padding: '11px 13px', fontSize: 14, border: `1.5px solid ${LINE}`, borderRadius: 10, outline: 'none', boxSizing: 'border-box', marginTop: 8 };

  if (loading) return <Shell><p style={{ color: SUB }}>Loading…</p></Shell>;
  if (err && !shop) return <Shell><p style={{ color: SUB }}>{err}</p></Shell>;

  if (placed) return (
    <Shell title={shop?.name}>
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ width: 54, height: 54, borderRadius: 999, background: '#E7F2E7', color: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 12px' }}>✓</div>
        <h2 style={{ margin: '0 0 6px', color: INK }}>Order placed</h2>
        <p style={{ color: SUB, margin: '0 0 14px' }}>A driver will be assigned shortly.</p>
        <div style={{ fontFamily: 'monospace', color: INK }}>{money(placed.order_amount, cur)}</div>
        <div style={{ fontSize: 12, color: SUB, marginTop: 6 }}>{placed.items.join(', ')}</div>
        <div style={{ fontSize: 11, color: SUB, marginTop: 14 }}>Order ref: {placed.order_id.slice(0, 8)}</div>
      </div>
    </Shell>
  );

  return (
    <Shell title={shop?.name}>
      <div style={{ display: 'grid', gap: 10 }}>
        {products.map((p) => (
          <div key={p.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: INK, fontWeight: 600 }}>{p.name}</div>
              <div style={{ color: SUB, fontSize: 13 }}>{money(p.price, cur)} · {p.unit}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {qty[p.id] > 0 && <button onClick={() => add(p.id, -1)} style={qBtn}>−</button>}
              {qty[p.id] > 0 && <span style={{ minWidth: 18, textAlign: 'center', color: INK }}>{qty[p.id]}</span>}
              <button onClick={() => add(p.id, 1)} style={{ ...qBtn, background: NAVY, color: '#fff', borderColor: NAVY }}>+</button>
            </div>
          </div>
        ))}
        {products.length === 0 && <p style={{ color: SUB }}>No items available.</p>}
      </div>

      {cart.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: INK, marginBottom: 10 }}>
            <span>Total</span><span>{money(total, cur)}</span>
          </div>
          <input style={input} placeholder="Your name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          <input style={input} placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input style={input} placeholder="Delivery address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          {err && <div style={{ color: '#C0504D', fontSize: 13, marginTop: 10 }}>{err}</div>}
          <button onClick={submit} disabled={submitting} style={{ width: '100%', marginTop: 14, padding: '13px', border: 'none', borderRadius: 10, background: BRASS, color: NAVY, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
            {submitting ? 'Placing…' : `Place order · ${money(total, cur)}`}
          </button>
        </div>
      )}
    </Shell>
  );
}

const qBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 18, cursor: 'pointer', lineHeight: 1 };

function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: PAPER, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <div style={{ background: NAVY, color: '#fff', padding: '18px 20px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: BRASS, fontSize: 20 }}>◧</span>
          <strong style={{ fontSize: 17 }}>{title || 'Shop'}</strong>
        </div>
      </div>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>{children}</div>
    </div>
  );
}
