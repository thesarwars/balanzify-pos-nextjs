'use client';
// ─────────────────────────────────────────────────────────────────
// Invoice Layouts — the manual's Settings ▸ Invoice Layout. Multiple
// layouts, designs (classic / elegant / slim-thermal), header/footer,
// show-hide fields, gift receipt (hide prices), QR, letterhead, total
// in words. Live preview. Wired through API.invoiceLayout.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Btn, Badge, Panel, Field, TextField, SelectField, useToast } from '@/components/kit';
import { Topbar, useSession } from '@/components/shell';
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

export function InvoiceLayouts({ T, embedded }: { T: Theme; embedded?: boolean }) {
  const [rows, setRows] = useStateIv<any[]>([]);
  const [sel, setSel] = useStateIv<any>(null);
  const [adding, setAdding] = useStateIv(false);
  const [name, setName] = useStateIv('');
  const [loading, setLoading] = useStateIv(true);
  const [uploadingLogo, setUploadingLogo] = useStateIv(false);
  const fileRef = React.useRef<any>(null);
  const [toast, toastNode] = useToast();

  const reload = React.useCallback(() => API.invoiceLayout.list().then((ls: any) => {
    const arr = Array.isArray(ls) ? ls : [];
    setRows(arr);
    setSel((s: any) => arr.find((x: any) => x.id === (s && s.id)) || arr[0] || null);
  }).catch(() => setRows([])).finally(() => setLoading(false)), []);
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
  // Logo upload: writes both config.logoUrl + config.logoKey in one update (and
  // flips showLogo on) so a second setCfg doesn't clobber the first.
  async function onLogoFile(e: any) {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    setUploadingLogo(true);
    try {
      const { url, key } = await API.upload.image(f);
      setSel((prev: any) => { const up = { ...prev, config: { ...(prev.config || {}), logoUrl: url, logoKey: key, showLogo: true } }; save(up); return up; });
      setRows((rs: any) => rs.map((r: any) => (r.id === (sel && sel.id) ? { ...r, config: { ...(r.config || {}), logoUrl: url, logoKey: key, showLogo: true } } : r)));
      toast('Logo uploaded');
    } catch (ex: any) { toast(ex.message || 'Could not upload the logo.'); } finally { setUploadingLogo(false); }
  }
  function removeLogo() {
    const key = sel.config && sel.config.logoKey;
    if (key) API.upload.remove(key).catch(() => {});
    setSel((prev: any) => { const up = { ...prev, config: { ...(prev.config || {}), logoUrl: '', logoKey: '' } }; save(up); return up; });
  }

  const addBtn = <Btn T={T} kind="accent" onClick={() => setAdding(true)}>+ Add Layout</Btn>;

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: embedded ? 'transparent' : T.paperAlt, minHeight: 200, fontSize: 13, color: T.inkSub }}>Loading invoice layouts…</div>;
  if (!sel) {
    const emptyBody = (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 240 }}>
        <div style={{ fontSize: 14, color: T.inkSub }}>No invoice layouts yet.</div>
        {adding ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Layout name" autoFocus style={{ padding: '9px 12px', fontSize: 13, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none' }} />
            <Btn T={T} kind="accent" onClick={add}>Add</Btn>
          </div>
        ) : <Btn T={T} kind="accent" onClick={() => setAdding(true)}>+ Add your first layout</Btn>}
      </div>
    );
    return embedded ? <>{emptyBody}{toastNode}</> : (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
        <Topbar T={T} title="Invoice Layouts" subtitle="Receipt & invoice formats" right={addBtn} />
        {emptyBody}
        {toastNode}
      </div>
    );
  }

  // Extended settings live in sel.config; existing show_* toggles are columns.
  // NOTE: these are functions we CALL ({txt(...)}), not inline components, so the
  // inputs keep focus across the debounced auto-save re-renders.
  const cfg = (k: string, d: any = '') => (sel.config && sel.config[k] !== undefined ? sel.config[k] : d);
  const setCfg = (k: string, v: any) => set('config', { ...(sel.config || {}), [k]: v });
  const lbl = (t: string) => <div style={{ fontSize: 11, fontWeight: 600, color: T.inkSub, marginBottom: 4 }}>{t}</div>;
  const txt = (k: string, label: string, ph?: string) => <div key={k} style={{ minWidth: 0 }}>{lbl(label)}<TextField T={T} value={cfg(k, '')} onChange={(v: any) => setCfg(k, v)} placeholder={ph || label} /></div>;
  const colTxt = (ck: string, label: string, ph?: string) => <div key={ck} style={{ minWidth: 0 }}>{lbl(label)}<TextField T={T} value={sel[ck] || ''} onChange={(v: any) => set(ck, v)} placeholder={ph || label} /></div>;
  const toggle = (on: boolean, onClick: () => void, label: string, key: string) => (
    <button key={key} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
      <span style={{ width: 36, height: 21, borderRadius: 99, background: on ? T.accent.base : T.lineMid, position: 'relative', flexShrink: 0, transition: 'background .18s' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 17 : 2, width: 17, height: 17, borderRadius: 99, background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.inkMid }}>{label}</span>
    </button>
  );
  const tog = (k: string, label: string, def = false) => toggle(!!cfg(k, def), () => setCfg(k, !cfg(k, def)), label, k);
  const colTog = (ck: string, label: string) => toggle(!!sel[ck], () => set(ck, !sel[ck]), label, ck);
  const fgrid = (children: any, min = 170) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }}>{children}</div>;
  const tgrid = (children: any) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, rowGap: 13 }}>{children}</div>;
  const gap = (h = 14) => <div style={{ height: h }} />;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: embedded ? 'visible' : 'hidden', background: embedded ? 'transparent' : T.paperAlt, minHeight: 0 }}>
      {embedded
        ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>{addBtn}</div>
        : <Topbar T={T} title="Invoice Layouts" subtitle="Receipt & invoice formats" right={addBtn} />}
      <div style={{ flex: 1, overflowY: 'auto', padding: embedded ? 0 : 28 }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 20, alignItems: 'start' }}>
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

            {/* Design & branding */}
            <Panel T={T} title="Design & branding">
              <Field T={T} label="Design" full>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {[['classic', 'Classic'], ['elegant', 'Elegant'], ['slim', 'Slim 80mm']].map(([d, dl]) => (
                    <button key={d} onClick={() => set('design', d)} style={{ padding: '8px', borderRadius: T.r, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 700, background: sel.design === d ? T.accent.soft : T.paper, border: `1.5px solid ${sel.design === d ? T.accent.base : T.line}`, color: sel.design === d ? T.accent.text : T.inkMid }}>{dl}</button>
                  ))}
                </div>
              </Field>
              {gap()}
              {tgrid(<>{colTog('show_letterhead', 'Show letter head')}{tog('showLogo', 'Show invoice logo')}{colTog('hide_prices', 'Gift receipt (hide prices)')}</>)}
              {gap()}
              <div>
                {lbl('Invoice logo')}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {cfg('logoUrl')
                    ? <img src={cfg('logoUrl')} alt="logo" style={{ height: 46, maxWidth: 130, objectFit: 'contain', borderRadius: 6, border: `1px solid ${T.line}`, background: '#fff', padding: 4 }} />
                    : <div style={{ height: 46, width: 84, borderRadius: 6, border: `1px dashed ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: T.inkSub }}>No logo</div>}
                  <Btn T={T} kind="ghost" onClick={() => fileRef.current && fileRef.current.click()} disabled={uploadingLogo}>{uploadingLogo ? 'Uploading…' : cfg('logoUrl') ? 'Replace' : 'Choose file'}</Btn>
                  {cfg('logoUrl') && <Btn T={T} kind="ghost" onClick={removeLogo} style={{ color: T.redText }}>Remove</Btn>}
                  <input type="file" accept="image/png,image/jpeg,image/webp" ref={fileRef} onChange={onLogoFile} style={{ display: 'none' }} />
                </div>
                <div style={{ fontSize: 10.5, color: T.inkSub, marginTop: 5 }}>PNG, JPG or WebP · up to 5 MB.</div>
              </div>
            </Panel>

            {/* Header */}
            <Panel T={T} title="Header & sub-headings">
              {colTxt('header_text', 'Header text', BUSINESS.name)}
              {gap()}
              {fgrid(<>{txt('subHeading1', 'Sub heading line 1')}{txt('subHeading2', 'Sub heading line 2')}{txt('subHeading3', 'Sub heading line 3')}{txt('subHeading4', 'Sub heading line 4')}{txt('subHeading5', 'Sub heading line 5')}</>)}
            </Panel>

            {/* Invoice headings & labels */}
            <Panel T={T} title="Invoice headings & labels">
              {fgrid(<>
                {txt('invoiceHeading', 'Invoice heading', 'Invoice')}
                {txt('invoiceNoLabel', 'Invoice no. label', 'Invoice No.')}
                {txt('dateLabel', 'Date label', 'Date')}
                {txt('dueDateLabel', 'Due date label')}
                {txt('quotationHeading', 'Quotation heading')}
                {txt('salesOrderHeading', 'Sales order heading')}
                {txt('proformaHeading', 'Proforma heading')}
                {txt('dateTimeFormat', 'Date time format')}
                {txt('headingSuffixPaid', 'Heading suffix (paid)')}
                {txt('headingSuffixUnpaid', 'Heading suffix (not paid)')}
              </>)}
              {gap()}
              {tgrid(<>{tog('showDueDate', 'Show due date')}{tog('showBusinessName', 'Show business name')}{tog('showLocationName', 'Show location name', true)}{tog('showSalesPerson', 'Show sales person')}{tog('showCommissionAgent', 'Show commission agent')}</>)}
            </Panel>

            {/* Customer details */}
            <Panel T={T} title="Customer details">
              {tgrid(<>{tog('showCustomerInfo', 'Show customer information', true)}{tog('showClientId', 'Show client ID')}{tog('showRewardPoint', 'Show reward point')}</>)}
              {gap()}
              {fgrid(<>{txt('customerLabel', 'Customer label', 'Customer')}{txt('clientIdLabel', 'Client ID label')}{txt('clientTaxLabel', 'Client tax number label')}</>)}
            </Panel>

            {/* Address & contact fields */}
            <Panel T={T} title="Address, communication & tax fields">
              {lbl('Location address')}
              {tgrid(<>{tog('addrLandmark', 'Landmark', true)}{tog('addrCity', 'City', true)}{tog('addrState', 'State', true)}{tog('addrCountry', 'Country', true)}{tog('addrZip', 'Zip code', true)}</>)}
              {gap()}
              {lbl('Communication & tax')}
              {tgrid(<>{tog('commMobile', 'Mobile number', true)}{tog('commAlt', 'Alternate number')}{tog('commEmail', 'Email')}{tog('taxDetails1', 'Tax 1 details', true)}{tog('taxDetails2', 'Tax 2 details')}{colTog('show_address', 'Show business address')}{colTog('show_tax_summary', 'Show tax summary')}</>)}
            </Panel>

            {/* Product columns */}
            <Panel T={T} title="Product columns & details">
              {fgrid(<>{txt('productLabel', 'Product label', 'Product')}{txt('quantityLabel', 'Quantity label', 'Quantity')}{txt('unitPriceLabel', 'Unit price label', 'Unit Price')}{txt('subtotalColLabel', 'Subtotal label', 'Subtotal')}{txt('hsnLabel', 'HSN / category label')}{txt('itemDiscountLabel', 'Item discount label')}</>)}
              {gap()}
              {tgrid(<>{tog('showSku', 'Show SKU', true)}{tog('showBrand', 'Show brand')}{tog('showHsn', 'Show category / HSN')}{tog('showProductImage', 'Show product image')}{tog('showProductDesc', 'Show product description')}{tog('showSaleDesc', 'Show sale description')}{tog('showWarranty', 'Show warranty')}{tog('showBaseUnit', 'Show base unit')}</>)}
            </Panel>

            {/* Totals & summary */}
            <Panel T={T} title="Totals & summary">
              {fgrid(<>
                {txt('subtotalLabel', 'Subtotal label', 'Subtotal')}
                {txt('discountLabel', 'Discount label', 'Discount')}
                {txt('taxLabel', 'Tax label', 'Tax')}
                {txt('totalLabel', 'Total label', 'Total')}
                {txt('totalItemsLabel', 'Total items label')}
                {txt('roundOffLabel', 'Round off label')}
                {txt('totalDueLabel', 'Total due label', 'Total Due')}
                {txt('amountPaidLabel', 'Amount paid label', 'Total Paid')}
                {txt('changeReturnLabel', 'Change return label')}
                {txt('taxSummaryLabel', 'Tax summary label')}
              </>)}
              {gap()}
              {tgrid(<>{colTog('show_discount', 'Show discount')}{colTog('show_total_in_words', 'Total in words')}{tog('showPaymentInfo', 'Show payment info', true)}{tog('showBarcode', 'Show barcode')}</>)}
              {gap()}
              <div style={{ width: 220 }}>{lbl('Amount-in-words format')}<SelectField T={T} value={cfg('wordFormat', 'international')} options={['international', 'indian']} onChange={(v: any) => setCfg('wordFormat', v)} render={(v: any) => (v === 'indian' ? 'Indian' : 'International')} /></div>
            </Panel>

            {/* QR code */}
            <Panel T={T} title="QR code">
              {tgrid(<>{colTog('show_qr', 'Show QR code')}{tog('qrShowLabels', 'Show labels')}{tog('qrZatca', 'ZATCA (Fatoora) QR')}</>)}
              {gap(10)}
              {lbl('Fields shown in QR')}
              {tgrid(<>{tog('qrBusinessName', 'Business name', true)}{tog('qrLocationAddr', 'Location address')}{tog('qrTax1', 'Business tax')}{tog('qrInvoiceNo', 'Invoice no.', true)}{tog('qrInvoiceDatetime', 'Invoice datetime')}{tog('qrSubtotal', 'Subtotal')}{tog('qrTotalWithTax', 'Total with tax', true)}{tog('qrTotalTax', 'Total tax')}{tog('qrCustomerName', 'Customer name')}{tog('qrInvoiceUrl', 'Invoice URL')}</>)}
            </Panel>

            {/* Footer & credit note */}
            <Panel T={T} title="Footer & credit note">
              {colTxt('footer_text', 'Footer text', 'Thank you!')}
              {gap()}
              {lbl('Credit note / sell return')}
              {fgrid(<>{txt('creditNoteHeading', 'Heading', 'Credit Note')}{txt('creditNoteRefLabel', 'Reference number label')}{txt('creditNoteTotalLabel', 'Total amount label')}</>)}
            </Panel>

            <div style={{ display: 'flex', gap: 8 }}>
              {!sel.is_default && <Btn T={T} kind="ghost" onClick={makeDefault}>Set default</Btn>}
              {!sel.is_default && <Btn T={T} kind="ghost" onClick={del} style={{ color: T.redText }}>Delete</Btn>}
            </div>
          </div>

          {/* live preview */}
          <div style={{ position: 'sticky', top: 0 }}>
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
  const session = useSession();
  const bizName = (session && session.business_name) || BUSINESS.name;
  const C = L.config || {};
  const subHeadings = [C.subHeading1, C.subHeading2, C.subHeading3, C.subHeading4, C.subHeading5].filter(Boolean);
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
      {C.showLogo && C.logoUrl && <div style={{ textAlign: 'center', marginBottom: 8 }}><img src={C.logoUrl} alt="logo" style={{ maxHeight: 48, maxWidth: '68%', objectFit: 'contain' }} /></div>}
      {L.show_letterhead && <div style={{ height: 36, borderRadius: 4, background: 'linear-gradient(90deg,#1f2d4d,#2a3f6b)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, letterSpacing: 1, fontFamily: 'system-ui' }}>LETTERHEAD</div>}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: slim ? 15 : 20, fontWeight: 800, letterSpacing: slim ? 0 : -0.3 }}>{L.header_text || bizName}</div>
        {L.show_address && <div style={{ fontSize: 9.5, color: '#555', marginTop: 2 }}>{BUSINESS.branch} · Mogadishu</div>}
        {subHeadings.map((s: any, i: number) => <div key={i} style={{ fontSize: 9.5, color: '#555' }}>{s}</div>)}
        {!slim && L.design === 'elegant' && <div style={{ width: 40, height: 2, background: '#1a1a1a', margin: '8px auto 0' }} />}
      </div>
      {(C.invoiceHeading || C.showInvoiceHeading !== false) && <div style={{ textAlign: 'center', fontSize: slim ? 11 : 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', margin: '2px 0 4px' }}>{C.invoiceHeading || 'Invoice'}</div>}
      <Hr />
      <Row l={`${C.invoiceNoLabel || 'Invoice No.'}: ${SAMPLE_INV.no}`} r="" sz={10} />
      <Row l={`${C.dateLabel || 'Date'}: ${SAMPLE_INV.date}`} r="" sz={10} />
      {C.showCustomerInfo !== false && <Row l={`${C.customerLabel || 'Customer'}: ${SAMPLE_INV.customer}`} r="" sz={10} />}
      <Hr />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.4 }}><span>{C.productLabel || 'Item'}</span>{!L.hide_prices && <span>{C.subtotalColLabel || 'Amount'}</span>}</div>
      {SAMPLE_INV.lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, margin: '3px 0' }}>
          <span>{l.name} <span style={{ color: '#888' }}>×{l.qty}</span></span>
          {!L.hide_prices && <span style={{ fontFamily: mono }}>${(l.qty * l.price).toFixed(2)}</span>}
        </div>
      ))}
      <Hr />
      {!L.hide_prices && <>
        <Row l={C.subtotalLabel || 'Subtotal'} r={`$${sub.toFixed(2)}`} />
        {L.show_discount && <Row l={C.discountLabel || 'Discount'} r={`-$${disc.toFixed(2)}`} />}
        <Row l={`${C.taxLabel || 'Tax'} (5%)`} r={`$${tax.toFixed(2)}`} />
        {L.show_tax_summary && <div style={{ fontSize: 9, color: '#777', margin: '3px 0' }}>VAT 5% on ${sub.toFixed(2)} = ${tax.toFixed(2)}</div>}
        <Hr />
        <Row l={(C.totalLabel || 'Total').toUpperCase()} r={`$${total.toFixed(2)}`} b sz={14} />
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
