'use client';
// ─────────────────────────────────────────────────────────────────
// Business Settings — UltimatePOS-style tabbed preferences.
// Persists to the Business record: the scalar columns (name, currency,
// tax number) plus a `settings` JSON bag for everything else. The
// Product tab's Default Unit is sourced from the Units section.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Btn, Panel, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState, useEffect } = React;

const CCY: [string, string][] = [
  ['USD', 'US Dollar'], ['EUR', 'Euro'], ['GBP', 'British Pound'], ['KES', 'Kenyan Shilling'],
  ['SOS', 'Somali Shilling'], ['AED', 'UAE Dirham'], ['SAR', 'Saudi Riyal'], ['INR', 'Indian Rupee'],
  ['NGN', 'Nigerian Naira'], ['ETB', 'Ethiopian Birr'], ['TZS', 'Tanzanian Shilling'], ['UGX', 'Ugandan Shilling'],
  ['ZAR', 'South African Rand'], ['GHS', 'Ghanaian Cedi'],
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_FMTS = ['mm/dd/yyyy', 'dd/mm/yyyy', 'yyyy-mm-dd', 'dd-mm-yyyy', 'mm-dd-yyyy'];

const DEFAULTS: any = {
  start_date: '', currency_symbol_placement: 'before', fy_start_month: 1, transaction_edit_days: 30,
  date_format: 'mm/dd/yyyy', time_format: '24', currency_precision: 2, quantity_precision: 2,
  default_profit_percent: 25, stock_accounting_method: 'fifo', timezone: '',
  tax1_name: '', tax2_name: '', tax2_number: '', enable_inline_tax: true,
  sku_prefix: '', enable_product_expiry: false, product_expiry_type: 'add_expiry',
  enable_brands: true, enable_categories: true, enable_sub_categories: true, enable_price_tax: true,
  enable_sub_units: false, enable_racks: false, enable_row: false, enable_position: false,
  enable_warranty: false, product_image_required: false, default_unit_id: null,
};

const TABS = [['business', 'Business'], ['tax', 'Tax'], ['product', 'Product']];

export function BusinessSettings({ T }: { T: any }) {
  const [tab, setTab] = useState('business');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [taxNumber, setTaxNumber] = useState('');
  const [s, setS] = useState<any>(DEFAULTS);
  const [units, setUnits] = useState<any[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<any>(null);
  const [show, node] = useToast();
  const logoRef = React.useRef<any>(null);
  const set = (k: any, v: any) => setS((p: any) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (API.config?.isReal?.()) {
      API.business.get().then((b: any) => {
        if (b) {
          setName(b.name || '');
          if (b.currency) setCurrency(b.currency);
          setTaxNumber(b.tax_number || b.taxNumber || '');
          setLogoUrl(b.logoUrl || '');
          setS((x: any) => ({ ...x, ...(b.settings || {}) }));
        }
      }).catch(() => {}).finally(() => setLoading(false));
    } else { setLoading(false); }
    API.unit.list().then((us: any) => setUnits(Array.isArray(us) ? us : [])).catch(() => {});
  }, []);

  // These bounds mirror BusinessSettingsBag on the backend. A 422 rejects the
  // whole save, so catching it here keeps one bad field from discarding the rest.
  function validate(): string | null {
    if (!name.trim()) return 'Business name is required.';
    if (name.trim().length > 200) return 'Business name must be 200 characters or fewer.';
    const n = (v: any) => Number(v);
    const days = n(s.transaction_edit_days);
    if (s.transaction_edit_days === '' || isNaN(days) || days < 0) return 'Transaction edit days must be 0 or more.';
    if (!Number.isInteger(days) || days > 3650) return 'Transaction edit days must be a whole number between 0 and 3650.';
    const profit = n(s.default_profit_percent);
    if (s.default_profit_percent === '' || isNaN(profit) || profit < 0) return 'Default profit percent must be 0 or more.';
    if (profit > 100000) return 'Default profit percent must be 100000 or less.';
    if (isNaN(n(s.currency_precision)) || n(s.currency_precision) < 0 || n(s.currency_precision) > 4) return 'Currency precision must be between 0 and 4.';
    if (isNaN(n(s.quantity_precision)) || n(s.quantity_precision) < 0 || n(s.quantity_precision) > 4) return 'Quantity precision must be between 0 and 4.';
    if (s.timezone && String(s.timezone).length > 64) return 'Time zone must be 64 characters or fewer.';
    return null;
  }

  // A 422 from the backend carries per-field messages; showing just its title
  // ("Validation failed") tells the user nothing about what to fix.
  function saveError(e: any): string {
    const errs = e && e.body && e.body.errors;
    if (Array.isArray(errs) && errs.length) {
      return errs.map((x: any) => (x.field ? `${x.field}: ${x.message}` : x.message)).filter(Boolean).join('; ');
    }
    return (e && e.message) || 'Could not save settings.';
  }

  async function save() {
    const v = validate();
    if (v) { setErr(v); return; }
    if (!API.config?.isReal?.()) { setErr('Saving business settings needs the live backend.'); return; }
    setBusy(true); setErr(null);
    try {
      // Cleared text fields must be sent as null, not undefined: JSON drops
      // undefined, and both Prisma and the route's shallow settings-merge treat
      // a missing key as "leave it alone" — so the old value would stick.
      await API.business.update({
        name: name.trim(), currency, tax_number: taxNumber.trim() || null,
        settings: {
          start_date: s.start_date || null,
          currency_symbol_placement: s.currency_symbol_placement,
          fy_start_month: Number(s.fy_start_month),
          transaction_edit_days: Number(s.transaction_edit_days),
          date_format: s.date_format, time_format: s.time_format,
          currency_precision: Number(s.currency_precision), quantity_precision: Number(s.quantity_precision),
          default_profit_percent: Number(s.default_profit_percent),
          timezone: s.timezone || null,
          stock_accounting_method: s.stock_accounting_method,
          tax1_name: s.tax1_name || null, tax2_name: s.tax2_name || null, tax2_number: s.tax2_number || null,
          enable_inline_tax: !!s.enable_inline_tax,
          sku_prefix: s.sku_prefix || null,
          enable_product_expiry: !!s.enable_product_expiry, product_expiry_type: s.product_expiry_type,
          enable_brands: !!s.enable_brands, enable_categories: !!s.enable_categories, enable_sub_categories: !!s.enable_sub_categories,
          enable_price_tax: !!s.enable_price_tax, enable_sub_units: !!s.enable_sub_units,
          enable_racks: !!s.enable_racks, enable_row: !!s.enable_row, enable_position: !!s.enable_position,
          enable_warranty: !!s.enable_warranty, product_image_required: !!s.product_image_required,
          default_unit_id: s.default_unit_id || null,
        },
      });
      show('Business settings saved');
    } catch (e: any) { setErr(saveError(e)); } finally { setBusy(false); }
  }

  async function onLogo(e: any) {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    setLogoBusy(true); setErr(null);
    try { const r = await API.upload.logo(f); setLogoUrl(r.url); show('Logo updated'); }
    catch (ex: any) { setErr(ex.message || 'Logo upload failed.'); }
    finally { setLogoBusy(false); }
  }

  const unitName = (u: any) => `${u.actual_name}${u.short_name ? ` (${u.short_name})` : ''}`;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Business Settings" subtitle="Configure your business preferences"
        right={<Btn T={T} kind="accent" onClick={save} disabled={busy || loading}>{busy ? 'Saving…' : 'Save settings'}</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: '190px minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
          {/* Tab rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 0 }}>
            {TABS.map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                style={{ textAlign: 'left', padding: '11px 14px', borderRadius: 9, border: `1px solid ${tab === k ? T.accent.base : T.line}`, background: tab === k ? T.accent.base : T.paper, color: tab === k ? T.accent.on : T.inkMid, fontFamily: T.fBody, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties}>
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div>
            <div style={{ marginBottom: 14, padding: '10px 13px', borderRadius: T.r, background: T.paperAlt, border: `1px solid ${T.line}`, color: T.inkMid, fontSize: 12, lineHeight: 1.55 }}>
              These preferences are saved to your business profile. Several of them are recorded but not yet applied across the app — each is noted on its field.
            </div>
          <Panel T={T} style={{ padding: 22 }}>
            {loading ? <div style={{ padding: 30, textAlign: 'center', color: T.inkSub, fontSize: 13 }}>Loading…</div> : (
              <>
                {tab === 'business' && (
                  <FormGrid cols={3}>
                    <Field T={T} label="Business name *"><TextField T={T} value={name} onChange={setName} placeholder="Business name" /></Field>
                    <Field T={T} label="Start date"><TextField T={T} type="date" value={s.start_date || ''} onChange={(v: any) => set('start_date', v)} /></Field>
                    <Field T={T} label="Default profit percent *"><TextField T={T} type="number" value={String(s.default_profit_percent)} onChange={(v: any) => set('default_profit_percent', v)} placeholder="25" /></Field>

                    <Field T={T} label="Currency"><SelectField T={T} value={currency} options={CCY.map(([c]) => c)} onChange={setCurrency} render={(v: any) => { const c = CCY.find(([x]) => x === v); return c ? `${c[0]} — ${c[1]}` : v; }} /></Field>
                    <Field T={T} label="Currency symbol placement"><SelectField T={T} value={s.currency_symbol_placement} options={['before', 'after']} onChange={(v: any) => set('currency_symbol_placement', v)} render={(v: any) => v === 'before' ? 'Before amount' : 'After amount'} /></Field>
                    <Field T={T} label="Time zone"><TextField T={T} value={s.timezone || ''} onChange={(v: any) => set('timezone', v)} placeholder="e.g. Africa/Nairobi" /></Field>

                    <Field T={T} label="Financial year start month"><SelectField T={T} value={String(s.fy_start_month)} options={MONTHS.map((_, i) => String(i + 1))} onChange={(v: any) => set('fy_start_month', v)} render={(v: any) => MONTHS[Number(v) - 1]} /></Field>
                    <Field T={T} label="Date format"><SelectField T={T} value={s.date_format} options={DATE_FMTS} onChange={(v: any) => set('date_format', v)} render={(v: any) => v} /></Field>
                    <Field T={T} label="Time format"><SelectField T={T} value={s.time_format} options={['12', '24']} onChange={(v: any) => set('time_format', v)} render={(v: any) => v === '12' ? '12 Hour' : '24 Hour'} /></Field>

                    <Field T={T} label="Transaction edit days *"><TextField T={T} type="number" value={String(s.transaction_edit_days)} onChange={(v: any) => set('transaction_edit_days', v)} placeholder="30" /></Field>
                    <Field T={T} label="Currency precision *"><SelectField T={T} value={String(s.currency_precision)} options={['0', '1', '2', '3', '4']} onChange={(v: any) => set('currency_precision', v)} render={(v: any) => v} /></Field>
                    <Field T={T} label="Quantity precision *"><SelectField T={T} value={String(s.quantity_precision)} options={['0', '1', '2', '3', '4']} onChange={(v: any) => set('quantity_precision', v)} render={(v: any) => v} /></Field>

                    <Field T={T} label="Stock accounting method *" hint="Recorded as your stated policy — inventory is currently always valued FIFO/FEFO from cost layers"><SelectField T={T} value={s.stock_accounting_method} options={['fifo', 'lifo']} onChange={(v: any) => set('stock_accounting_method', v)} render={(v: any) => v === 'fifo' ? 'FIFO (First In First Out)' : 'LIFO (Last In First Out)'} /></Field>
                    <Field T={T} label="Logo" full>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {logoUrl && <img src={logoUrl} alt="logo" style={{ height: 40, borderRadius: 6, border: `1px solid ${T.line}` }} />}
                        <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onLogo} />
                        <Btn T={T} kind="ghost" onClick={() => logoRef.current && logoRef.current.click()} disabled={logoBusy}>{logoBusy ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}</Btn>
                        <span style={{ fontSize: 11, color: T.inkMute }}>PNG/JPG, replaces the previous logo</span>
                      </div>
                    </Field>
                  </FormGrid>
                )}

                {tab === 'tax' && (
                  <FormGrid cols={2}>
                    <Field T={T} label="Tax 1 name" hint="e.g. GSTIN, VAT"><TextField T={T} value={s.tax1_name || ''} onChange={(v: any) => set('tax1_name', v)} placeholder="GST / VAT / Other" /></Field>
                    <Field T={T} label="Tax 1 number"><TextField T={T} value={taxNumber} onChange={setTaxNumber} placeholder="Registration number" /></Field>
                    <Field T={T} label="Tax 2 name"><TextField T={T} value={s.tax2_name || ''} onChange={(v: any) => set('tax2_name', v)} placeholder="GST / VAT / Other" /></Field>
                    <Field T={T} label="Tax 2 number"><TextField T={T} value={s.tax2_number || ''} onChange={(v: any) => set('tax2_number', v)} placeholder="Registration number" /></Field>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <Check T={T} label="Enable inline tax in purchase and sell" hint="Saved as a preference — the per-line tax selector is not driven by it yet" checked={s.enable_inline_tax} onChange={(v: any) => set('enable_inline_tax', v)} />
                    </div>
                  </FormGrid>
                )}

                {tab === 'product' && (
                  <div>
                    <FormGrid cols={2}>
                      <Field T={T} label="SKU prefix" hint="Saved for future use — SKUs are not auto-generated yet"><TextField T={T} value={s.sku_prefix || ''} onChange={(v: any) => set('sku_prefix', v)} placeholder="e.g. AS" /></Field>
                      <Field T={T} label="Default unit" hint="From the Units section"><SelectField T={T} value={s.default_unit_id || ''} options={['', ...units.map((u: any) => String(u.id))]} onChange={(v: any) => set('default_unit_id', v || null)} render={(v: any) => { if (!v) return 'Please select…'; const u = units.find((x: any) => String(x.id) === v); return u ? unitName(u) : 'Please select…'; }} /></Field>
                    </FormGrid>
                    <div style={{ height: 14 }} />
                    <FormGrid cols={2}>
                      <Field T={T} label="Product expiry" full>
                        <Check T={T} label="Enable product expiry" checked={s.enable_product_expiry} onChange={(v: any) => set('enable_product_expiry', v)} />
                        {s.enable_product_expiry && (
                          <div style={{ marginTop: 8, maxWidth: 320 }}>
                            <SelectField T={T} value={s.product_expiry_type} options={['add_expiry', 'add_mfg_expiry']} onChange={(v: any) => set('product_expiry_type', v)} render={(v: any) => v === 'add_expiry' ? 'Add item expiry' : 'Add manufacturing date & expiry period'} />
                          </div>
                        )}
                      </Field>
                    </FormGrid>
                    <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '4px 18px' }}>
                      <Check T={T} label="Enable brands" checked={s.enable_brands} onChange={(v: any) => set('enable_brands', v)} />
                      <Check T={T} label="Enable categories" checked={s.enable_categories} onChange={(v: any) => set('enable_categories', v)} />
                      <Check T={T} label="Enable sub-categories" checked={s.enable_sub_categories} onChange={(v: any) => set('enable_sub_categories', v)} />
                      <Check T={T} label="Enable price & tax info" checked={s.enable_price_tax} onChange={(v: any) => set('enable_price_tax', v)} />
                      <Check T={T} label="Enable sub units" hint="Show sub-units for the selected unit" checked={s.enable_sub_units} onChange={(v: any) => set('enable_sub_units', v)} />
                      <Check T={T} label="Is product image required?" checked={s.product_image_required} onChange={(v: any) => set('product_image_required', v)} />
                      <Check T={T} label="Enable racks" hint="Rack details per location" checked={s.enable_racks} onChange={(v: any) => set('enable_racks', v)} />
                      <Check T={T} label="Enable row" checked={s.enable_row} onChange={(v: any) => set('enable_row', v)} />
                      <Check T={T} label="Enable position" checked={s.enable_position} onChange={(v: any) => set('enable_position', v)} />
                      <Check T={T} label="Enable warranty" checked={s.enable_warranty} onChange={(v: any) => set('enable_warranty', v)} />
                    </div>
                  </div>
                )}

                {err && <div style={{ marginTop: 18, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
              </>
            )}
          </Panel>
          </div>
        </div>
      </div>
      {node}
    </div>
  );
}

function Check({ T, label, hint, checked, onChange }: { T: any; label: any; hint?: any; checked: any; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', padding: '7px 0' }}>
      <input type="checkbox" checked={!!checked} onChange={(e: any) => onChange(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: T.accent.base, cursor: 'pointer', flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, color: T.ink, fontWeight: 600 }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 11.5, color: T.inkSub, marginTop: 1 }}>{hint}</span>}
      </span>
    </label>
  );
}
