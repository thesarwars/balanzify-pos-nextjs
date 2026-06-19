'use client';
// ─────────────────────────────────────────────────────────────────
// Invoice Layouts — the manual's Settings ▸ Invoice Layout. Multiple
// layouts, designs (classic / elegant / slim-thermal), header/footer,
// show-hide fields, gift receipt (hide prices), QR, letterhead, total
// in words. Live preview. Wired through API.invoiceLayout.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Badge, Panel, Field, TextField, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { BUSINESS } from '@/lib/data';

const { useState: useStateIv, useEffect: useEffectIv } = React;

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words(n: any): string {
  n = Math.floor(n);
  if (n < 20) return NUM_WORDS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + NUM_WORDS[n % 10] : '');
  if (n < 1000) return NUM_WORDS[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + words(n % 100) : '');
  return NUM_WORDS[Math.floor(n / 1000)] + ' thousand' + (n % 1000 ? ' ' + words(n % 1000) : '');
}
function amountInWords(v: any) { const d = Math.round((v % 1) * 100); return (words(v) + ' dollars' + (d ? ' and ' + words(d) + ' cents' : '')).replace(/^\w/, c => c.toUpperCase()); }

// sample invoice data for the preview
const SAMPLE_INV = {
  no: 'AS0042', date: '2024-11-18 14:32', customer: 'Khadija Ali',
  lines: [{ name: 'Basmati Rice 5kg', qty: 2, price: 8.9 }, { name: 'Cooking Oil 3L', qty: 1, price: 6.5 }, { name: 'Somali Tea (Shaah)', qty: 4, price: 1.5 }],
};

export function InvoiceLayouts({ T }: { T: Theme }) {
  const [rows, setRows] = useStateIv<any[]>([]);
  const [sel, setSel] = useStateIv<any>(null);
  const [adding, setAdding] = useStateIv(false);
  const [name, setName] = useStateIv('');
  const [toast, toastNode] = useToast();

  const reload = React.useCallback(() => API.invoiceLayout.list().then((ls: any) => { setRows(ls); setSel((s: any) => ls.find((x: any) => x.id === (s && s.id)) || ls[0] || null); }).catch(() => {}), []);
  useEffectIv(() => { reload(); }, [reload]);

  const set = (k: any, v: any) => { const up = { ...sel, [k]: v }; setSel(up); save(up); };
  let saveTimer: any;
  function save(layout: any) { clearTimeout(saveTimer); saveTimer = setTimeout(() => { API.invoiceLayout.update(layout.id, layout).then((u: any) => setRows((rs: any) => rs.map((r: any) => r.id === u.id ? u : r))).catch(() => {}); }, 250); }
  async function add() {
    if (!name.trim()) return;
    const l = await API.invoiceLayout.create({ name }); setName(''); setAdding(false); await reload(); setSel(l); toast('Layout added');
  }
  async function makeDefault() { const u = await API.invoiceLayout.update(sel.id, { is_default: true }); await reload(); setSel({ ...sel, is_default: true }); toast('Set as default'); }
  async function del() { try { await API.invoiceLayout.remove(sel.id); await reload(); toast('Layout deleted'); } catch (e: any) { toast(e.message); } }

  if (!sel) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paperAlt, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>GET /connector/api/invoice-layout…</div>;

  const OPTS = [
    ['show_address', 'Show business address'], ['show_tax_summary', 'Tax summary'], ['show_total_in_words', 'Total in words'],
    ['show_discount', 'Show discount'], ['show_qr', 'QR code'], ['show_letterhead', 'Letterhead'], ['hide_prices', 'Gift receipt (hide prices)'],
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Invoice Layouts" subtitle="Receipt & invoice formats" right={<Btn T={T} kind="accent" onClick={() => setAdding(true)}>+ Add Layout</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'min(100%, 340px) 1fr', gap: 20, alignItems: 'start' }}>
          {/* editor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Panel T={T} title="Layouts" pad={false}>
              {rows.map((l: any) => (
                <button key={l.id} onClick={() => setSel(l)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', borderBottom: `1px solid ${T.line}`, background: sel.id === l.id ? T.accent.soft : T.paper, cursor: 'pointer', fontFamily: T.fBody }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: sel.id === l.id ? T.accent.text : T.ink }}>{l.name}</span>
                  {l.is_default && <Badge T={T} tone="gray">Default</Badge>}
                </button>
              ))}
              {adding && (
                <div style={{ display: 'flex', gap: 8, padding: 12 }}>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Layout name" autoFocus style={{ flex: 1, padding: '8px 10px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none' }} />
                  <Btn T={T} kind="accent" onClick={add}>Add</Btn>
                </div>
              )}
            </Panel>

            <Panel T={T} title={sel.name}>
              <Field T={T} label="Design" full>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {[['classic', 'Classic'], ['elegant', 'Elegant'], ['slim', 'Slim 80mm']].map(([d, lbl]) => (
                    <button key={d} onClick={() => set('design', d)} style={{ padding: '8px', borderRadius: T.r, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 700, background: sel.design === d ? T.accent.soft : T.paper, border: `1.5px solid ${sel.design === d ? T.accent.base : T.line}`, color: sel.design === d ? T.accent.text : T.inkMid }}>{lbl}</button>
                  ))}
                </div>
              </Field>
              <div style={{ height: 12 }} />
              <Field T={T} label="Header text" full><TextField T={T} value={sel.header_text} onChange={(v: any) => set('header_text', v)} placeholder={BUSINESS.name} /></Field>
              <div style={{ height: 12 }} />
              <Field T={T} label="Footer text" full><TextField T={T} value={sel.footer_text} onChange={(v: any) => set('footer_text', v)} placeholder="Thank you!" /></Field>
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {OPTS.map(([k, lbl]) => (
                  <button key={k} onClick={() => set(k, !sel[k])} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                    <span style={{ width: 38, height: 22, borderRadius: 99, background: sel[k] ? T.accent.base : T.lineMid, position: 'relative', flexShrink: 0, transition: 'background .18s' }}>
                      <span style={{ position: 'absolute', top: 2, left: sel[k] ? 18 : 2, width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: T.inkMid }}>{lbl}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                {!sel.is_default && <Btn T={T} kind="ghost" onClick={makeDefault}>Set default</Btn>}
                {!sel.is_default && <Btn T={T} kind="ghost" onClick={del} style={{ color: T.redText }}>Delete</Btn>}
              </div>
            </Panel>
          </div>

          {/* live preview */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, marginBottom: 10 }}>Live preview</div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px', background: '#e9e4da', borderRadius: T.rLg }}>
              <ReceiptPreview T={T} layout={sel} />
            </div>
          </div>
        </div>
      </div>
      {toastNode}
    </div>
  );
}

function ReceiptPreview({ T, layout: L }: { T: Theme; layout: any }) {
  const slim = L.design === 'slim';
  const width = slim ? 250 : 380;
  const sub = SAMPLE_INV.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const tax = +(sub * 0.05).toFixed(2);
  const disc = 2.0;
  const total = +(sub + tax - disc).toFixed(2);
  const mono = slim ? 'ui-monospace, monospace' : 'inherit';
  const Hr = () => <div style={{ borderTop: `1px dashed #bbb`, margin: '7px 0' }} />;
  const Row = ({ l, r, b, sz = 11 }: any) => <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: sz, fontWeight: b ? 700 : 400, margin: '2px 0' }}><span>{l}</span><span>{r}</span></div>;

  return (
    <div style={{ width, background: '#fff', color: '#1a1a1a', fontFamily: slim ? mono : 'Georgia, serif', padding: slim ? '14px 14px' : '24px 26px', boxShadow: '0 8px 30px rgba(0,0,0,0.18)', borderRadius: slim ? 4 : 8, fontSize: 12, lineHeight: 1.4 }}>
      {L.show_letterhead && <div style={{ height: 36, borderRadius: 4, background: 'linear-gradient(90deg,#1f2d4d,#2a3f6b)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, letterSpacing: 1, fontFamily: 'system-ui' }}>LETTERHEAD</div>}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: slim ? 15 : 20, fontWeight: 800, letterSpacing: slim ? 0 : -0.3 }}>{L.header_text || BUSINESS.name}</div>
        {L.show_address && <div style={{ fontSize: 9.5, color: '#555', marginTop: 2 }}>{BUSINESS.branch} · Mogadishu</div>}
        {!slim && L.design === 'elegant' && <div style={{ width: 40, height: 2, background: '#1a1a1a', margin: '8px auto 0' }} />}
      </div>
      <Hr />
      <Row l={`Invoice: ${SAMPLE_INV.no}`} r="" sz={10} />
      <Row l={`Date: ${SAMPLE_INV.date}`} r="" sz={10} />
      <Row l={`Customer: ${SAMPLE_INV.customer}`} r="" sz={10} />
      <Hr />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.4 }}><span>Item</span>{!L.hide_prices && <span>Amount</span>}</div>
      {SAMPLE_INV.lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, margin: '3px 0' }}>
          <span>{l.name} <span style={{ color: '#888' }}>×{l.qty}</span></span>
          {!L.hide_prices && <span style={{ fontFamily: mono }}>${(l.qty * l.price).toFixed(2)}</span>}
        </div>
      ))}
      <Hr />
      {!L.hide_prices && <>
        <Row l="Subtotal" r={`$${sub.toFixed(2)}`} />
        {L.show_discount && <Row l="Discount" r={`-$${disc.toFixed(2)}`} />}
        <Row l="Tax (5%)" r={`$${tax.toFixed(2)}`} />
        {L.show_tax_summary && <div style={{ fontSize: 9, color: '#777', margin: '3px 0' }}>VAT 5% on ${sub.toFixed(2)} = ${tax.toFixed(2)}</div>}
        <Hr />
        <Row l="TOTAL" r={`$${total.toFixed(2)}`} b sz={14} />
        {L.show_total_in_words && <div style={{ fontSize: 9.5, color: '#555', fontStyle: 'italic', marginTop: 4 }}>{amountInWords(total)}</div>}
      </>}
      {L.hide_prices && <div style={{ textAlign: 'center', fontSize: 11, color: '#777', fontStyle: 'italic', padding: '6px 0' }}>Gift receipt — prices hidden</div>}
      {L.show_qr && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <div style={{ width: 60, height: 60, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridTemplateRows: 'repeat(7,1fr)', gap: 1 }}>
            {Array.from({ length: 49 }).map((_, i) => <span key={i} style={{ background: (((i * 7 + (i % 5)) ^ (i >> 2)) % 3) ? '#111' : '#fff' }} />)}
          </div>
        </div>
      )}
      <div style={{ textAlign: 'center', fontSize: 10, color: '#666', marginTop: 12 }}>{L.footer_text}</div>
    </div>
  );
}
