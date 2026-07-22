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
import { SearchSelect } from './search-select';

const { useState, useEffect, useMemo } = React;

const CCY: [string, string][] = [
  ['USD', 'US Dollar'], ['EUR', 'Euro'], ['GBP', 'British Pound'], ['KES', 'Kenyan Shilling'],
  ['SOS', 'Somali Shilling'], ['AED', 'UAE Dirham'], ['SAR', 'Saudi Riyal'], ['INR', 'Indian Rupee'],
  ['NGN', 'Nigerian Naira'], ['ETB', 'Ethiopian Birr'], ['TZS', 'Tanzanian Shilling'], ['UGX', 'Ugandan Shilling'],
  ['ZAR', 'South African Rand'], ['GHS', 'Ghanaian Cedi'],
];
const DATE_FMTS = ['mm/dd/yyyy', 'dd/mm/yyyy', 'yyyy-mm-dd', 'dd-mm-yyyy', 'mm-dd-yyyy'];

// Only settings the app actually honours. Anything that could not be wired to a
// real consumer was removed rather than shown as an inert toggle.
const DEFAULTS: any = {
  start_date: '', currency_symbol_placement: 'before', transaction_edit_days: 0,
  date_format: 'yyyy-mm-dd', time_format: '24', currency_precision: 2, quantity_precision: 0,
  default_profit_percent: 25, timezone: '',
  tax1_name: '', tax2_name: '', tax2_number: '',
  sku_prefix: '', enable_brands: true, enable_categories: true, enable_price_tax: true,
  product_image_required: false, default_unit_id: null,
  // Contact
  default_credit_limit: '',
  // Sale
  default_sale_discount: 0, default_sale_tax: '', default_sale_tax_rate: 0,
  sales_item_addition_method: 'increase', amount_rounding_method: 'none',
  sales_price_is_minimum: false, allow_overselling: false, enable_sales_order: false,
  is_pay_term_required: false,
  sales_commission_agent: 'disable', commission_calculation_type: 'invoice_value', is_commission_agent_required: false,
  enable_payment_link: false, razorpay_key_id: '', stripe_public_key: '',
  // POS
  pos_shortcuts: {},
  pos_disable_multiple_pay: false, pos_disable_draft: false, pos_disable_express_checkout: false,
  pos_hide_product_suggestion: false, pos_hide_recent_transactions: false, pos_disable_discount: false,
  pos_disable_order_tax: false, pos_subtotal_editable: false, pos_disable_suspend: false,
  pos_enable_transaction_date: false, pos_service_staff_required: false, pos_enable_service_staff_in_line: false,
  pos_disable_credit_sale: false, pos_enable_weighing_scale: false,
  pos_show_invoice_scheme: false, pos_show_invoice_layout: false, pos_print_on_suspend: false, pos_show_pricing_tooltip: false,
  scale_prefix: '', scale_sku_length: 5, scale_qty_int_length: 4, scale_qty_frac_length: 3,
  // Display Screen / Purchases / Payment / Dashboard / System
  display_enabled: false, display_heading: 'Welcome', display_images: [],
  purchases_edit_price: true, purchases_enable_status: true, purchases_enable_lot: false,
  purchases_enable_po: false, purchases_enable_requisition: false,
  cash_denominations: '', cash_denomination_on: 'pos', cash_denomination_methods: 'cash', cash_denomination_strict: false,
  stock_expiry_alert_days: 30,
  theme_color: '', datatable_entries: 25, show_help_text: true,
  prefix_purchase: 'PO', prefix_purchase_return: '', prefix_stock_transfer: 'TRF', prefix_stock_adjustment: 'ADJ',
  prefix_sell_return: 'CN', prefix_expense: 'EXP', prefix_contact: 'CO', prefix_purchase_payment: 'PP',
  prefix_sell_payment: 'SP', prefix_business_location: 'BL', prefix_draft: '', prefix_sales_order: '',
};

// The POS keyboard map — labels mirror the reference; empty = no shortcut.
// third element: a note for combos this till has no matching control for yet
// (discount/tax are rules- and settings-driven; no scale modal exists).
const SHORTCUTS: [string, string, string?][] = [
  ['express_checkout', 'Express Checkout'], ['pay_checkout', 'Pay & Checkout'],
  ['draft', 'Draft'], ['cancel', 'Cancel'], ['go_qty', 'Go to product quantity'],
  ['weighing_scale', 'Weighing Scale', 'no matching control in this till yet'],
  ['edit_discount', 'Edit Discount', 'discounts are rule/settings-driven here'],
  ['edit_order_tax', 'Edit Order Tax', 'order tax is settings-driven here'],
  ['add_payment_row', 'Add Payment Row'],
  ['finalize_payment', 'Finalize Payment'], ['add_new_product', 'Add new product'],
];

const TABS = [['business', 'Business'], ['tax', 'Tax'], ['product', 'Product'], ['contact', 'Contact'], ['sale', 'Sale'], ['pos', 'POS'], ['display', 'Display Screen'], ['purchases', 'Purchases'], ['payment', 'Payment'], ['dashboard', 'Dashboard'], ['system', 'System'], ['prefixes', 'Prefixes'], ['email', 'Email Settings'], ['sms', 'SMS Settings'], ['reward', 'Reward Points'], ['custom-fields', 'Custom Fields']];

export function BusinessSettings({ T }: { T: any }) {
  const [tab, setTab] = useState('business');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [taxNumber, setTaxNumber] = useState('');
  const [s, setS] = useState<any>(DEFAULTS);
  const [units, setUnits] = useState<any[]>([]);
  const [taxRates, setTaxRates] = useState<any[]>([]);
  const [unitsErr, setUnitsErr] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<any>(null);
  const [show, node] = useToast();
  const logoRef = React.useRef<any>(null);
  const set = (k: any, v: any) => setS((p: any) => ({ ...p, [k]: v }));

  // The full IANA list straight from the runtime; a short fallback for the rare
  // engine without Intl.supportedValuesOf.
  const timezones: string[] = useMemo(() => {
    try {
      const supported = (Intl as any).supportedValuesOf;
      if (typeof supported === 'function') return supported('timeZone');
    } catch { /* fall through */ }
    return ['UTC', 'Africa/Mogadishu', 'Africa/Nairobi', 'Africa/Addis_Ababa', 'Africa/Dar_es_Salaam',
            'Africa/Kampala', 'Africa/Lagos', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Riyadh',
            'Asia/Kolkata', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];
  }, []);

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
    API.unit.list()
      .then((us: any) => setUnits(Array.isArray(us) ? us : []))
      .catch((e: any) => setUnitsErr(e?.message || 'Could not load units.'));
    API.taxRate.list().then((ts: any[]) => setTaxRates(ts.filter((t: any) => t.id !== 0))).catch(() => {});
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
          transaction_edit_days: Number(s.transaction_edit_days),
          date_format: s.date_format, time_format: s.time_format,
          currency_precision: Number(s.currency_precision), quantity_precision: Number(s.quantity_precision),
          default_profit_percent: Number(s.default_profit_percent),
          timezone: s.timezone || null,
          tax1_name: s.tax1_name || null, tax2_name: s.tax2_name || null, tax2_number: s.tax2_number || null,
          sku_prefix: s.sku_prefix || null,
          enable_brands: !!s.enable_brands, enable_categories: !!s.enable_categories,
          enable_price_tax: !!s.enable_price_tax, product_image_required: !!s.product_image_required,
          default_unit_id: s.default_unit_id || null,
          // Contact
          default_credit_limit: s.default_credit_limit === '' || s.default_credit_limit == null ? null : Number(s.default_credit_limit),
          // Sale
          default_sale_discount: Number(s.default_sale_discount) || 0,
          default_sale_tax: s.default_sale_tax || null,
          default_sale_tax_rate: Number(s.default_sale_tax_rate) || 0,
          sales_item_addition_method: s.sales_item_addition_method,
          amount_rounding_method: s.amount_rounding_method,
          sales_price_is_minimum: !!s.sales_price_is_minimum,
          allow_overselling: !!s.allow_overselling,
          enable_sales_order: !!s.enable_sales_order,
          is_pay_term_required: !!s.is_pay_term_required,
          sales_commission_agent: s.sales_commission_agent,
          commission_calculation_type: s.commission_calculation_type,
          is_commission_agent_required: !!s.is_commission_agent_required,
          enable_payment_link: !!s.enable_payment_link,
          razorpay_key_id: s.razorpay_key_id || null,
          stripe_public_key: s.stripe_public_key || null,
          // POS
          pos_shortcuts: s.pos_shortcuts && Object.keys(s.pos_shortcuts).length ? s.pos_shortcuts : null,
          pos_disable_multiple_pay: !!s.pos_disable_multiple_pay, pos_disable_draft: !!s.pos_disable_draft,
          pos_disable_express_checkout: !!s.pos_disable_express_checkout,
          pos_hide_product_suggestion: !!s.pos_hide_product_suggestion,
          pos_hide_recent_transactions: !!s.pos_hide_recent_transactions,
          pos_disable_discount: !!s.pos_disable_discount, pos_disable_order_tax: !!s.pos_disable_order_tax,
          pos_subtotal_editable: !!s.pos_subtotal_editable, pos_disable_suspend: !!s.pos_disable_suspend,
          pos_enable_transaction_date: !!s.pos_enable_transaction_date,
          pos_service_staff_required: !!s.pos_service_staff_required,
          pos_enable_service_staff_in_line: !!s.pos_enable_service_staff_in_line,
          pos_disable_credit_sale: !!s.pos_disable_credit_sale, pos_enable_weighing_scale: !!s.pos_enable_weighing_scale,
          pos_show_invoice_scheme: !!s.pos_show_invoice_scheme, pos_show_invoice_layout: !!s.pos_show_invoice_layout,
          pos_print_on_suspend: !!s.pos_print_on_suspend, pos_show_pricing_tooltip: !!s.pos_show_pricing_tooltip,
          scale_prefix: s.scale_prefix || null,
          scale_sku_length: Number(s.scale_sku_length) || 5,
          scale_qty_int_length: Number(s.scale_qty_int_length) || 4,
          scale_qty_frac_length: Number(s.scale_qty_frac_length) ?? 3,
          display_enabled: !!s.display_enabled,
          display_heading: s.display_heading || null,
          display_images: (s.display_images || []).filter(Boolean),
          purchases_edit_price: !!s.purchases_edit_price,
          purchases_enable_status: !!s.purchases_enable_status,
          purchases_enable_lot: !!s.purchases_enable_lot,
          purchases_enable_po: !!s.purchases_enable_po,
          purchases_enable_requisition: !!s.purchases_enable_requisition,
          cash_denominations: s.cash_denominations || null,
          cash_denomination_on: s.cash_denomination_on || 'pos',
          cash_denomination_methods: s.cash_denomination_methods || null,
          cash_denomination_strict: !!s.cash_denomination_strict,
          stock_expiry_alert_days: Number(s.stock_expiry_alert_days) || 30,
          prefix_purchase: s.prefix_purchase || null, prefix_purchase_return: s.prefix_purchase_return || null,
          prefix_stock_transfer: s.prefix_stock_transfer || null, prefix_stock_adjustment: s.prefix_stock_adjustment || null,
          prefix_sell_return: s.prefix_sell_return || null, prefix_expense: s.prefix_expense || null,
          prefix_contact: s.prefix_contact || null, prefix_purchase_payment: s.prefix_purchase_payment || null,
          prefix_sell_payment: s.prefix_sell_payment || null, prefix_business_location: s.prefix_business_location || null,
          prefix_draft: s.prefix_draft || null, prefix_sales_order: s.prefix_sales_order || null,
          theme_color: s.theme_color || null,
          datatable_entries: Number(s.datatable_entries) || 25,
          show_help_text: !!s.show_help_text,
        },
      });
      // Let AppShell re-read the bag so money/date formatting updates immediately.
      try { window.dispatchEvent(new Event('bz:settings-changed')); } catch { /* ignore */ }
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
                    <Field T={T} label="Time zone" hint="IANA name"><SearchSelect T={T} value={s.timezone || ''} options={timezones} onChange={(v: any) => set('timezone', v)} placeholder="Search time zone…" /></Field>

                    <Field T={T} label="Date format"><SelectField T={T} value={s.date_format} options={DATE_FMTS} onChange={(v: any) => set('date_format', v)} render={(v: any) => v} /></Field>
                    <Field T={T} label="Time format"><SelectField T={T} value={s.time_format} options={['12', '24']} onChange={(v: any) => set('time_format', v)} render={(v: any) => v === '12' ? '12 Hour' : '24 Hour'} /></Field>

                    <Field T={T} label="Transaction edit days *" hint="0 = never lock. Older purchases can no longer be edited or cancelled"><TextField T={T} type="number" value={String(s.transaction_edit_days)} onChange={(v: any) => set('transaction_edit_days', v)} placeholder="30" /></Field>
                    <Field T={T} label="Currency precision *"><SelectField T={T} value={String(s.currency_precision)} options={['0', '1', '2', '3', '4']} onChange={(v: any) => set('currency_precision', v)} render={(v: any) => v} /></Field>
                    <Field T={T} label="Quantity precision *"><SelectField T={T} value={String(s.quantity_precision)} options={['0', '1', '2', '3', '4']} onChange={(v: any) => set('quantity_precision', v)} render={(v: any) => v} /></Field>

                    <Field T={T} label="Stock accounting method" hint="Perishables are consumed soonest-to-expire first, everything else oldest-first. Not configurable.">
                      <div style={{ padding: '10px 13px', fontSize: 14, fontFamily: T.fBody, color: T.inkMid, background: T.paperAlt, border: `1px solid ${T.line}`, borderRadius: T.r } as React.CSSProperties}>FIFO / FEFO</div>
                    </Field>
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
                    <Field T={T} label="Tax 1 name" hint="Labels your tax number on receipts (default: TIN)"><TextField T={T} value={s.tax1_name || ''} onChange={(v: any) => set('tax1_name', v)} placeholder="GST / VAT / Other" /></Field>
                    <Field T={T} label="Tax 1 number"><TextField T={T} value={taxNumber} onChange={setTaxNumber} placeholder="Registration number" /></Field>
                    <Field T={T} label="Tax 2 name" hint="Printed on receipts when a Tax 2 number is set"><TextField T={T} value={s.tax2_name || ''} onChange={(v: any) => set('tax2_name', v)} placeholder="GST / VAT / Other" /></Field>
                    <Field T={T} label="Tax 2 number"><TextField T={T} value={s.tax2_number || ''} onChange={(v: any) => set('tax2_number', v)} placeholder="Registration number" /></Field>
                  </FormGrid>
                )}

                {tab === 'product' && (
                  <div>
                    <FormGrid cols={2}>
                      <Field T={T} label="SKU prefix" hint="Prefills the SKU prefix on a new product"><TextField T={T} value={s.sku_prefix || ''} onChange={(v: any) => set('sku_prefix', v)} placeholder="e.g. AS" /></Field>
                      <Field T={T} label="Default unit" hint={unitsErr ? `Could not load units — ${unitsErr}` : units.length ? 'Preselected on a new product · from the Units section' : 'No units yet — add them in Products → Units'}>
                        <SelectField T={T} value={s.default_unit_id || ''} options={['', ...units.map((u: any) => String(u.id))]} onChange={(v: any) => set('default_unit_id', v || null)} render={(v: any) => { if (!v) return units.length ? 'Please select…' : 'No units available'; const u = units.find((x: any) => String(x.id) === v); return u ? unitName(u) : 'Please select…'; }} />
                      </Field>
                    </FormGrid>
                    <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '4px 18px' }}>
                      <Check T={T} label="Enable brands" hint="Show the Brand field on the product form" checked={s.enable_brands} onChange={(v: any) => set('enable_brands', v)} />
                      <Check T={T} label="Enable categories" hint="Show the Category field on the product form" checked={s.enable_categories} onChange={(v: any) => set('enable_categories', v)} />
                      <Check T={T} label="Enable price & tax info" hint="Show the tax fields on the product form" checked={s.enable_price_tax} onChange={(v: any) => set('enable_price_tax', v)} />
                      <Check T={T} label="Is product image required?" hint="Block saving a product without an image" checked={s.product_image_required} onChange={(v: any) => set('product_image_required', v)} />
                    </div>
                  </div>
                )}

                {tab === 'contact' && (
                  <FormGrid cols={2}>
                    <Field T={T} label="Default credit limit" hint="Applied to new customers that don't set their own. Blank = no limit.">
                      <TextField T={T} type="number" value={String(s.default_credit_limit ?? '')} onChange={(v: any) => set('default_credit_limit', v)} placeholder="Default credit limit" />
                    </Field>
                  </FormGrid>
                )}

                {tab === 'sale' && (
                  <div>
                    <FormGrid cols={3}>
                      <Field T={T} label="Default Sale Discount (%) *" hint="Starting discount on every till sale">
                        <TextField T={T} type="number" value={String(s.default_sale_discount)} onChange={(v: any) => set('default_sale_discount', v)} placeholder="0" />
                      </Field>
                      <Field T={T} label="Default Sale Tax" hint="Order tax the till and Add Sale start with">
                        <SelectField T={T} value={s.default_sale_tax || ''} options={['', ...taxRates.map((t: any) => String(t.id))]}
                          onChange={(v: any) => { const t = taxRates.find((x: any) => String(x.id) === v); set('default_sale_tax', v || ''); set('default_sale_tax_rate', t ? Number(t.amount || 0) / 100 : 0); }}
                          render={(v: any) => v === '' ? 'None' : (taxRates.find((t: any) => String(t.id) === v) || {}).name || v} />
                      </Field>
                      <Field T={T} label="Sales Item Addition Method">
                        <SelectField T={T} value={s.sales_item_addition_method} options={['increase', 'new_line']}
                          onChange={(v: any) => set('sales_item_addition_method', v)}
                          render={(v: any) => v === 'increase' ? 'Increase item quantity if it already exists' : 'Add item in new row'} />
                      </Field>
                      <Field T={T} label="Amount rounding method" hint="Applied to the till total (rounds down, taken as discount)">
                        <SelectField T={T} value={s.amount_rounding_method} options={['none', 'whole', '0.05', '0.1', '0.5']}
                          onChange={(v: any) => set('amount_rounding_method', v)}
                          render={(v: any) => v === 'none' ? 'None' : v === 'whole' ? 'Round to whole number' : `Round to multiple of ${v}`} />
                      </Field>
                    </FormGrid>
                    <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '4px 18px' }}>
                      <Check T={T} label="Sales price is minimum selling price" hint="Overrides may only raise the price, never undercut it" checked={s.sales_price_is_minimum} onChange={(v: any) => set('sales_price_is_minimum', v)} />
                      <Check T={T} label="Allow Overselling" hint="Sell past zero — stock may go negative" checked={s.allow_overselling} onChange={(v: any) => set('allow_overselling', v)} />
                      <Check T={T} label="Enable Sales Order" checked={s.enable_sales_order} onChange={(v: any) => set('enable_sales_order', v)} />
                      <Check T={T} label="Is pay term required?" hint="Credit sales must state when they fall due" checked={s.is_pay_term_required} onChange={(v: any) => set('is_pay_term_required', v)} />
                    </div>
                    <div style={{ margin: '18px 0 8px', fontSize: 13.5, fontWeight: 700, color: T.ink }}>Commission Agent</div>
                    <FormGrid cols={3}>
                      <Field T={T} label="Sales Commission Agent">
                        <SelectField T={T} value={s.sales_commission_agent} options={['disable', 'logged_in', 'select']}
                          onChange={(v: any) => set('sales_commission_agent', v)}
                          render={(v: any) => v === 'disable' ? 'Disable' : v === 'logged_in' ? 'Logged in user' : 'Select from list'} />
                      </Field>
                      <Field T={T} label="Commission Calculation Type">
                        <SelectField T={T} value={s.commission_calculation_type} options={['invoice_value', 'payment_received']}
                          onChange={(v: any) => set('commission_calculation_type', v)}
                          render={(v: any) => v === 'invoice_value' ? 'Invoice value' : 'Payment received'} />
                      </Field>
                    </FormGrid>
                    <Check T={T} label="Is commission agent required?" checked={s.is_commission_agent_required} onChange={(v: any) => set('is_commission_agent_required', v)} />
                    <div style={{ margin: '18px 0 8px', fontSize: 13.5, fontWeight: 700, color: T.ink }}>Payment Link</div>
                    <Check T={T} label="Enable payment link" checked={s.enable_payment_link} onChange={(v: any) => set('enable_payment_link', v)} />
                    <FormGrid cols={2} style={{ marginTop: 10 }}>
                      <Field T={T} label="Razorpay Key ID" hint="Secret keys are configured on the server, never in the browser"><TextField T={T} value={s.razorpay_key_id || ''} onChange={(v: any) => set('razorpay_key_id', v)} /></Field>
                      <Field T={T} label="Stripe public key" hint="Secret keys are configured on the server, never in the browser"><TextField T={T} value={s.stripe_public_key || ''} onChange={(v: any) => set('stripe_public_key', v)} /></Field>
                    </FormGrid>
                  </div>
                )}

                {tab === 'pos' && (
                  <div>
                    <div style={{ marginBottom: 6, fontSize: 13.5, fontWeight: 700, color: T.ink }}>Add keyboard shortcuts</div>
                    <div style={{ fontSize: 12, color: T.inkSub, marginBottom: 12 }}>
                      Click a field and <b>press the key combination</b> (e.g. hold Ctrl+Shift and tap P). Backspace clears it.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 22px' }}>
                      {SHORTCUTS.map(([key, label, note]) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ flex: 1, fontSize: 12.5, color: T.inkMid, fontWeight: 600 }}>
                            {label}:
                            {note && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: T.inkMute }}>{note}</span>}
                          </span>
                          <ShortcutInput T={T} value={(s.pos_shortcuts || {})[key] || ''}
                            onChange={(v: string) => set('pos_shortcuts', { ...(s.pos_shortcuts || {}), [key]: v })} />
                        </div>
                      ))}
                    </div>
                    <div style={{ margin: '20px 0 8px', fontSize: 13.5, fontWeight: 700, color: T.ink }}>POS settings</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '2px 18px' }}>
                      <Check T={T} label="Disable Multiple Pay" hint="Hide the Split / Tender tab" checked={s.pos_disable_multiple_pay} onChange={(v: any) => set('pos_disable_multiple_pay', v)} />
                      <Check T={T} label="Disable Draft" checked={s.pos_disable_draft} onChange={(v: any) => set('pos_disable_draft', v)} />
                      <Check T={T} label="Disable Express Checkout" checked={s.pos_disable_express_checkout} onChange={(v: any) => set('pos_disable_express_checkout', v)} />
                      <Check T={T} label="Don't show product suggestion" checked={s.pos_hide_product_suggestion} onChange={(v: any) => set('pos_hide_product_suggestion', v)} />
                      <Check T={T} label="Don't show recent transactions" checked={s.pos_hide_recent_transactions} onChange={(v: any) => set('pos_hide_recent_transactions', v)} />
                      <Check T={T} label="Disable Discount" hint="No default or rule discounts at the till" checked={s.pos_disable_discount} onChange={(v: any) => set('pos_disable_discount', v)} />
                      <Check T={T} label="Disable order tax" checked={s.pos_disable_order_tax} onChange={(v: any) => set('pos_disable_order_tax', v)} />
                      <Check T={T} label="Subtotal Editable" checked={s.pos_subtotal_editable} onChange={(v: any) => set('pos_subtotal_editable', v)} />
                      <Check T={T} label="Disable Suspend Sale" hint="Hide the hold / park button" checked={s.pos_disable_suspend} onChange={(v: any) => set('pos_disable_suspend', v)} />
                      <Check T={T} label="Enable transaction date on POS screen" checked={s.pos_enable_transaction_date} onChange={(v: any) => set('pos_enable_transaction_date', v)} />
                      <Check T={T} label="Is service staff required" checked={s.pos_service_staff_required} onChange={(v: any) => set('pos_service_staff_required', v)} />
                      <Check T={T} label="Enable service staff in product line" checked={s.pos_enable_service_staff_in_line} onChange={(v: any) => set('pos_enable_service_staff_in_line', v)} />
                      <Check T={T} label="Disable credit sale button" checked={s.pos_disable_credit_sale} onChange={(v: any) => set('pos_disable_credit_sale', v)} />
                      <Check T={T} label="Enable Weighing Scale" checked={s.pos_enable_weighing_scale} onChange={(v: any) => set('pos_enable_weighing_scale', v)} />
                      <Check T={T} label="Show invoice scheme" checked={s.pos_show_invoice_scheme} onChange={(v: any) => set('pos_show_invoice_scheme', v)} />
                      <Check T={T} label="Show invoice layout dropdown" checked={s.pos_show_invoice_layout} onChange={(v: any) => set('pos_show_invoice_layout', v)} />
                      <Check T={T} label="Print invoice on suspend" checked={s.pos_print_on_suspend} onChange={(v: any) => set('pos_print_on_suspend', v)} />
                      <Check T={T} label="Show pricing on product suggestion tooltip" checked={s.pos_show_pricing_tooltip} onChange={(v: any) => set('pos_show_pricing_tooltip', v)} />
                    </div>
                    <div style={{ margin: '20px 0 4px', fontSize: 13.5, fontWeight: 700, color: T.ink }}>Weighing Scale barcode Setting</div>
                    <div style={{ fontSize: 12, color: T.inkSub, marginBottom: 10 }}>Configure the barcode as per your weighing scale.</div>
                    <FormGrid cols={4}>
                      <Field T={T} label="Prefix"><TextField T={T} value={s.scale_prefix || ''} onChange={(v: any) => set('scale_prefix', v)} /></Field>
                      <Field T={T} label="Product sku length"><SelectField T={T} value={String(s.scale_sku_length)} options={['3','4','5','6','7','8']} onChange={(v: any) => set('scale_sku_length', v)} render={(v: any) => v} /></Field>
                      <Field T={T} label="Quantity integer part length"><SelectField T={T} value={String(s.scale_qty_int_length)} options={['1','2','3','4','5']} onChange={(v: any) => set('scale_qty_int_length', v)} render={(v: any) => v} /></Field>
                      <Field T={T} label="Quantity fractional part length"><SelectField T={T} value={String(s.scale_qty_frac_length)} options={['0','1','2','3','4']} onChange={(v: any) => set('scale_qty_frac_length', v)} render={(v: any) => v} /></Field>
                    </FormGrid>
                  </div>
                )}

                {tab === 'display' && (
                  <div>
                    <Check T={T} label="Enable Customer display screen"
                      hint="Open /display in a new tab of the SAME browser as the till and mirror that tab to the customer-facing monitor"
                      checked={s.display_enabled} onChange={(v: any) => set('display_enabled', v)} />
                    <div style={{ marginTop: 14 }}>
                      <Field T={T} label="Display screen heading">
                        <textarea value={s.display_heading || ''} onChange={(e) => set('display_heading', e.target.value)} rows={2}
                          style={{ width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
                      </Field>
                    </div>
                    <div style={{ margin: '16px 0 8px', fontSize: 13.5, fontWeight: 700, color: T.ink }}>Carousel images (up to 10)</div>
                    <div style={{ fontSize: 12, color: T.inkSub, marginBottom: 10 }}>Shown to the customer while no sale is in progress.</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {(s.display_images || []).map((url: string, i: number) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img src={url} alt="" style={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.line}` }} />
                          <button onClick={() => set('display_images', (s.display_images || []).filter((_: any, j: number) => j !== i))}
                            style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 99, border: 'none', background: T.redText, color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                        </div>
                      ))}
                      {(s.display_images || []).length < 10 && (
                        <label style={{ width: 96, height: 64, borderRadius: 8, border: `2px dashed ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: T.inkSub, cursor: 'pointer' }}>
                          {imgBusy ? '…' : '+ Add'}
                          <input type="file" accept="image/*" style={{ display: 'none' }} disabled={imgBusy}
                            onChange={async (e) => {
                              const f = e.target.files && e.target.files[0]; e.target.value = '';
                              if (!f) return;
                              setImgBusy(true);
                              try { const r = await API.upload.image(f); set('display_images', [...(s.display_images || []), r.url]); }
                              catch (ex: any) { setErr(ex.message || 'Upload failed.'); }
                              finally { setImgBusy(false); }
                            }} />
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {tab === 'purchases' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2px 18px' }}>
                    <Check T={T} label="Enable editing product price from purchase screen" hint="Selling price column on purchase lines" checked={s.purchases_edit_price} onChange={(v: any) => set('purchases_edit_price', v)} />
                    <Check T={T} label="Enable Purchase Status" hint="Received / Ordered / Pending on the purchase form" checked={s.purchases_enable_status} onChange={(v: any) => set('purchases_enable_status', v)} />
                    <Check T={T} label="Enable Lot number" hint="Batch / lot field on purchase lines" checked={s.purchases_enable_lot} onChange={(v: any) => set('purchases_enable_lot', v)} />
                    <Check T={T} label="Enable purchase order" checked={s.purchases_enable_po} onChange={(v: any) => set('purchases_enable_po', v)} />
                    <Check T={T} label="Enable Purchase Requisition" checked={s.purchases_enable_requisition} onChange={(v: any) => set('purchases_enable_requisition', v)} />
                  </div>
                )}

                {tab === 'payment' && (
                  <div>
                    <FormGrid cols={2}>
                      <Field T={T} label="Cash Denominations" hint="Comma separated — example: 100,200,500,2000">
                        <TextField T={T} value={s.cash_denominations || ''} onChange={(v: any) => set('cash_denominations', v.replace(/[^0-9.,\s]/g, ''))} placeholder="1,5,10,20,50,100" />
                      </Field>
                      <Field T={T} label="Enable cash denomination on">
                        <SelectField T={T} value={s.cash_denomination_on || 'pos'} options={['pos', 'all']}
                          onChange={(v: any) => set('cash_denomination_on', v)} render={(v: any) => v === 'pos' ? 'POS screen' : 'All screens'} />
                      </Field>
                    </FormGrid>
                    <div style={{ marginTop: 10 }}>
                      <Check T={T} label="Strict check" hint="Payment amount must equal the sum of counted cash denominations" checked={s.cash_denomination_strict} onChange={(v: any) => set('cash_denomination_strict', v)} />
                    </div>
                  </div>
                )}

                {tab === 'dashboard' && (
                  <FormGrid cols={2}>
                    <Field T={T} label="View Stock Expiry Alert For *" hint="Days ahead the expiring-stock widgets look">
                      <TextField T={T} type="number" value={String(s.stock_expiry_alert_days)} onChange={(v: any) => set('stock_expiry_alert_days', v)} />
                    </Field>
                  </FormGrid>
                )}

                {tab === 'system' && (
                  <div>
                    <FormGrid cols={3}>
                      <Field T={T} label="Theme Color" hint="The app's accent colour">
                        <SelectField T={T} value={s.theme_color || ''} options={['', 'brass', 'emerald', 'indigo']}
                          onChange={(v: any) => set('theme_color', v)}
                          render={(v: any) => v === '' ? 'Default (Brass)' : v[0].toUpperCase() + v.slice(1)} />
                      </Field>
                      <Field T={T} label="Default datatable page entries">
                        <SelectField T={T} value={String(s.datatable_entries)} options={['10', '25', '50', '100']}
                          onChange={(v: any) => set('datatable_entries', v)} render={(v: any) => v} />
                      </Field>
                    </FormGrid>
                    <Check T={T} label="Show help text" hint="The small grey hints under form fields" checked={s.show_help_text} onChange={(v: any) => set('show_help_text', v)} />
                  </div>
                )}

                {tab === 'prefixes' && (
                  <div>
                    <div style={{ fontSize: 12, color: T.inkSub, marginBottom: 12 }}>
                      Prefixes for auto-generated reference numbers. Wired today: Purchase, Stock Transfer, Stock Adjustment, Expenses — the rest are stored for their screens.
                    </div>
                    <FormGrid cols={3}>
                      {([['prefix_purchase', 'Purchase'], ['prefix_purchase_return', 'Purchase Return'], ['prefix_stock_transfer', 'Stock Transfer'],
                        ['prefix_stock_adjustment', 'Stock Adjustment'], ['prefix_sell_return', 'Sell Return'], ['prefix_expense', 'Expenses'],
                        ['prefix_contact', 'Contacts'], ['prefix_purchase_payment', 'Purchase Payment'], ['prefix_sell_payment', 'Sell Payment'],
                        ['prefix_business_location', 'Business Location'], ['prefix_draft', 'Draft'], ['prefix_sales_order', 'Sales Order']] as [string, string][]).map(([k, label]) => (
                        <Field key={k} T={T} label={label}><TextField T={T} value={s[k] || ''} onChange={(v: any) => set(k, v.toUpperCase().slice(0, 8))} /></Field>
                      ))}
                    </FormGrid>
                  </div>
                )}
                {tab === 'email' && <EmailTab T={T} toast={show} />}
                {tab === 'reward' && <RewardTab T={T} toast={show} />}
                {tab === 'sms' && <SmsTab T={T} toast={show} />}
                {tab === 'custom-fields' && <CustomFieldsTab T={T} toast={show} />}

                {err && <div style={{ marginTop: 18, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5, fontWeight: 500 }}>⚠ {err}</div>}
              </>
            )}
          </Panel>
        </div>
      </div>
      {node}
    </div>
  );
}

// Email (SMTP) settings — password write-only, with a live test send.
function EmailTab({ T, toast }: { T: any; toast: (m: string) => void }) {
  const [c, setC] = React.useState<any>({});
  const [testTo, setTestTo] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => { API.emailSettings.get().then(setC).catch(() => {}); }, []);
  const set = (k: string, v: any) => setC((p: any) => ({ ...p, [k]: v }));
  async function save(): Promise<boolean> {
    setBusy(true); setErr(null);
    try { const cfg = await API.emailSettings.save(c); setC({ ...cfg, password: '' }); toast('Email settings saved'); return true; }
    catch (e: any) { setErr(e.message); return false; } finally { setBusy(false); }
  }
  async function test() {
    if (!testTo.trim()) { setErr('Enter the address to send the test to.'); return; }
    setBusy(true); setErr(null);
    try { if (await save()) { await API.emailSettings.test(testTo.trim()); toast('Test email sent'); } }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div>
      <FormGrid cols={3}>
        <Field T={T} label="Mail Driver"><SelectField T={T} value="smtp" options={['smtp']} onChange={() => {}} render={() => 'SMTP'} /></Field>
        <Field T={T} label="Host"><TextField T={T} value={c.host || ''} onChange={(v: any) => set('host', v)} placeholder="smtp.example.com" /></Field>
        <Field T={T} label="Port"><TextField T={T} type="number" value={c.port != null ? String(c.port) : ''} onChange={(v: any) => set('port', v)} placeholder="587" /></Field>
        <Field T={T} label="Username"><TextField T={T} value={c.username || ''} onChange={(v: any) => set('username', v)} /></Field>
        <Field T={T} label="Password" hint={c.password_set ? 'Configured — leave blank to keep' : 'Not set yet'}>
          <TextField T={T} type="password" value={c.password || ''} onChange={(v: any) => set('password', v)} />
        </Field>
        <Field T={T} label="Encryption"><SelectField T={T} value={c.encryption || 'tls'} options={['tls', 'ssl', 'none']} onChange={(v: any) => set('encryption', v)} render={(v: any) => v.toUpperCase()} /></Field>
        <Field T={T} label="From Address"><TextField T={T} value={c.from_address || ''} onChange={(v: any) => set('from_address', v)} /></Field>
        <Field T={T} label="From Name"><TextField T={T} value={c.from_name || ''} onChange={(v: any) => set('from_name', v)} /></Field>
      </FormGrid>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
        <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save email settings'}</Btn>
        <div style={{ width: 220 }}><Field T={T} label="Test address"><TextField T={T} value={testTo} onChange={setTestTo} placeholder="you@example.com" /></Field></div>
        <Btn T={T} kind="ghost" onClick={test} disabled={busy}>Send test email</Btn>
      </div>
      {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
    </div>
  );
}

// Reward Point settings — the same rules the Loyalty screen and the till use.
function RewardTab({ T, toast }: { T: any; toast: (m: string) => void }) {
  const [r, setR] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => { API.reward.getSettings().then(setR).catch(() => setR({})); }, []);
  const set = (k: string, v: any) => setR((p: any) => ({ ...p, [k]: v }));
  async function save() {
    setBusy(true); setErr(null);
    try { await API.reward.saveSettings(r); toast('Reward point settings saved'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  if (!r) return <div style={{ padding: 20, color: T.inkSub, fontSize: 13 }}>Loading…</div>;
  const num = (k: string, label: string, hint?: string) => (
    <Field T={T} label={label} hint={hint}><TextField T={T} type="number" value={r[k] != null ? String(r[k]) : ''} onChange={(v: any) => set(k, v === '' ? null : Number(v))} /></Field>
  );
  return (
    <div>
      <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 700, color: T.ink, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!r.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Enable Reward Point
      </label>
      <div style={{ margin: '16px 0 8px', fontSize: 13, fontWeight: 700, color: T.ink }}>Earning Points Settings</div>
      <FormGrid cols={3}>
        {num('amount_per_unit_point', 'Amount spend for unit point *', 'Spend this much = 1 point')}
        {num('min_order_total_earn', 'Minimum order total to earn reward')}
        {num('max_points_per_order', 'Maximum points per order')}
      </FormGrid>
      <div style={{ margin: '16px 0 8px', fontSize: 13, fontWeight: 700, color: T.ink }}>Redeem Points Settings</div>
      <FormGrid cols={3}>
        {num('redeem_amount_per_point', 'Redeem amount per unit point *', '1 point = this much off')}
        {num('min_order_total_redeem', 'Minimum order total to redeem points')}
        {num('min_redeem_point', 'Minimum redeem point')}
        {num('max_redeem_point', 'Maximum redeem point per order')}
      </FormGrid>
      <div style={{ marginTop: 16 }}>
        <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save reward settings'}</Btn>
      </div>
      {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
    </div>
  );
}

// SMS settings — driver presets first (Africa's Talking, Twilio), generic HTTP
// as the escape hatch. Secrets are write-only: the server returns *_set flags.
function SmsTab({ T, toast }: { T: any; toast: (m: string) => void }) {
  const [c, setC] = React.useState<any>({ driver: 'africastalking' });
  const [busy, setBusy] = React.useState(false);
  const [testTo, setTestTo] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => { API.sms.get().then((cfg: any) => setC((p: any) => ({ ...p, ...cfg }))).catch(() => {}); }, []);
  const set = (k: string, v: any) => setC((p: any) => ({ ...p, [k]: v }));
  async function save(): Promise<boolean> {
    setBusy(true); setErr(null);
    try { const cfg = await API.sms.save(c); setC((p: any) => ({ ...p, ...cfg, at_api_key: '', twilio_auth_token: '' })); toast('SMS settings saved'); return true; }
    catch (e: any) { setErr(e.message); return false; }
    finally { setBusy(false); }
  }
  async function test() {
    if (!testTo.trim()) { setErr('Enter the number to send the test to.'); return; }
    setBusy(true); setErr(null);
    try { if (await save()) { await API.sms.test(testTo.trim()); toast('Test SMS sent'); } }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  const secretHint = (flag: string) => c[flag] ? 'Configured — leave blank to keep' : 'Not set yet';
  return (
    <div>
      <FormGrid cols={3}>
        <Field T={T} label="SMS Service">
          <SelectField T={T} value={c.driver || 'africastalking'} options={['africastalking', 'twilio', 'custom']}
            onChange={(v: any) => set('driver', v)}
            render={(v: any) => ({ africastalking: "Africa's Talking", twilio: 'Twilio', custom: 'Other (Custom HTTP)' } as any)[v]} />
        </Field>
        <Field T={T} label="Sender ID / From" hint="Your approved sender name or number"><TextField T={T} value={c.sender_id || ''} onChange={(v: any) => set('sender_id', v)} /></Field>
      </FormGrid>
      {c.driver === 'africastalking' && (
        <FormGrid cols={2} style={{ marginTop: 10 }}>
          <Field T={T} label="Username" hint="'sandbox' while testing"><TextField T={T} value={c.at_username || ''} onChange={(v: any) => set('at_username', v)} /></Field>
          <Field T={T} label="API Key" hint={secretHint('at_api_key_set')}><TextField T={T} type="password" value={c.at_api_key || ''} onChange={(v: any) => set('at_api_key', v)} /></Field>
        </FormGrid>
      )}
      {c.driver === 'twilio' && (
        <FormGrid cols={2} style={{ marginTop: 10 }}>
          <Field T={T} label="Account SID"><TextField T={T} value={c.twilio_sid || ''} onChange={(v: any) => set('twilio_sid', v)} /></Field>
          <Field T={T} label="Auth Token" hint={secretHint('twilio_auth_token_set')}><TextField T={T} type="password" value={c.twilio_auth_token || ''} onChange={(v: any) => set('twilio_auth_token', v)} /></Field>
        </FormGrid>
      )}
      {c.driver === 'custom' && (
        <FormGrid cols={3} style={{ marginTop: 10 }}>
          <Field T={T} label="URL"><TextField T={T} value={c.custom_url || ''} onChange={(v: any) => set('custom_url', v)} placeholder="https://…" /></Field>
          <Field T={T} label="Request Method"><SelectField T={T} value={c.custom_method || 'POST'} options={['POST', 'GET']} onChange={(v: any) => set('custom_method', v)} /></Field>
          <Field T={T} label="Data Parameter Type"><SelectField T={T} value={c.custom_body_type || 'form'} options={['form', 'json']} onChange={(v: any) => set('custom_body_type', v)} render={(v: any) => v === 'form' ? 'Form Data' : 'JSON'} /></Field>
          <Field T={T} label="SEND TO parameter name"><TextField T={T} value={c.custom_to_param || 'to'} onChange={(v: any) => set('custom_to_param', v)} /></Field>
          <Field T={T} label="MESSAGE parameter name"><TextField T={T} value={c.custom_msg_param || 'text'} onChange={(v: any) => set('custom_msg_param', v)} /></Field>
          <Field T={T} label="Extra headers (JSON)" hint='e.g. {"Authorization":"Bearer …"}'><TextField T={T} value={c.custom_headers || ''} onChange={(v: any) => set('custom_headers', v)} /></Field>
        </FormGrid>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
        <Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save SMS settings'}</Btn>
        <div style={{ width: 180 }}><Field T={T} label="Test number"><TextField T={T} value={testTo} onChange={setTestTo} placeholder="+2526…" /></Field></div>
        <Btn T={T} kind="ghost" onClick={test} disabled={busy}>Send test SMS</Btn>
      </div>
      {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>{err}</div>}
    </div>
  );
}

// Custom fields — unlimited, table-driven, per entity.
function CustomFieldsTab({ T, toast }: { T: any; toast: (m: string) => void }) {
  const [entity, setEntity] = React.useState('contact');
  const [fields, setFields] = React.useState<any[]>([]);
  const [edit, setEdit] = React.useState<any>(null); // {} = new
  const [busy, setBusy] = React.useState(false);
  const reload = React.useCallback(() => { API.customField.list(entity).then(setFields).catch(() => setFields([])); }, [entity]);
  React.useEffect(() => { reload(); }, [reload]);
  async function saveField() {
    if (!edit.label?.trim()) return;
    setBusy(true);
    const body = {
      entity, label: edit.label.trim(), field_type: edit.field_type || 'text',
      options: edit.field_type === 'select' ? String(edit.options_text || '').split(',').map((x: string) => x.trim()).filter(Boolean) : undefined,
      required: !!edit.required,
      sort_order: edit.sort_order != null ? Number(edit.sort_order) : fields.length,
    };
    try {
      if (edit.id) await API.customField.update(edit.id, body); else await API.customField.create(body);
      setEdit(null); toast('Field saved'); reload();
    } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }
  async function move(f: any, dir: number) {
    const idx = fields.findIndex((x) => x.id === f.id);
    const other = fields[idx + dir];
    if (!other) return;
    await API.customField.update(f.id, { sort_order: other.sort_order }).catch(() => {});
    await API.customField.update(other.id, { sort_order: f.sort_order }).catch(() => {});
    reload();
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
        <div style={{ width: 190 }}>
          <Field T={T} label="Entity">
            <SelectField T={T} value={entity}
              options={['contact', 'product', 'payment', 'location', 'user', 'purchase', 'purchase_shipping', 'sell', 'sale_shipping', 'service_type']}
              onChange={setEntity}
              render={(v: any) => (({ contact: 'Contacts', product: 'Products', payment: 'Payments', location: 'Locations', user: 'Users', purchase: 'Purchases', purchase_shipping: 'Purchase Shipping', sell: 'Sell', sale_shipping: 'Sale Shipping', service_type: 'Types of Service' } as any)[v] || v)} />
          </Field>
        </div>
        <Btn T={T} kind="accent" onClick={() => setEdit({ field_type: 'text' })}>+ Add field</Btn>
        {!['contact', 'product'].includes(entity) && (
          <span style={{ fontSize: 11.5, color: T.inkMute, alignSelf: 'center' }}>Definitions saved — this entity's form renders them as its screen gets wired.</span>
        )}
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: 'hidden' }}>
        {fields.map((f, i) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderBottom: `1px solid ${T.line}`, opacity: f.is_active ? 1 : 0.5 }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>{f.label}{f.required && <span style={{ color: T.redText }}> *</span>}</span>
            <span style={{ fontSize: 11.5, color: T.inkSub, fontFamily: T.fMono }}>{f.field_type}{f.field_type === 'select' ? ` (${(f.options || []).length})` : ''}</span>
            <button onClick={() => move(f, -1)} disabled={i === 0} style={cfMini(T)}>↑</button>
            <button onClick={() => move(f, 1)} disabled={i === fields.length - 1} style={cfMini(T)}>↓</button>
            <button onClick={() => setEdit({ ...f, options_text: (f.options || []).join(', ') })} style={cfMini(T)}>Edit</button>
            <button onClick={async () => { await API.customField.update(f.id, { is_active: !f.is_active }).catch(() => {}); reload(); }} style={cfMini(T)}>{f.is_active ? 'Disable' : 'Enable'}</button>
            <button onClick={async () => { await API.customField.remove(f.id).catch((e: any) => toast(e.message)); reload(); }} style={{ ...cfMini(T), color: T.redText }}>Delete</button>
          </div>
        ))}
        {fields.length === 0 && <div style={{ padding: 26, textAlign: 'center', fontSize: 12.5, color: T.inkMute }}>No custom fields for {entity}s yet — add as many as you need.</div>}
      </div>
      {edit && (
        <div style={{ marginTop: 14, padding: 14, border: `1px solid ${T.line}`, borderRadius: 10, background: T.paperAlt }}>
          <FormGrid cols={3}>
            <Field T={T} label="Label *"><TextField T={T} value={edit.label || ''} onChange={(v: any) => setEdit({ ...edit, label: v })} /></Field>
            <Field T={T} label="Field type">
              <SelectField T={T} value={edit.field_type || 'text'} options={['text', 'number', 'date', 'select']}
                onChange={(v: any) => setEdit({ ...edit, field_type: v })} render={(v: any) => v[0].toUpperCase() + v.slice(1)} />
            </Field>
            {edit.field_type === 'select' && (
              <Field T={T} label="Options" hint="Comma separated"><TextField T={T} value={edit.options_text || ''} onChange={(v: any) => setEdit({ ...edit, options_text: v })} /></Field>
            )}
          </FormGrid>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 12.5, color: T.inkMid, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!edit.required} onChange={(e) => setEdit({ ...edit, required: e.target.checked })} /> Required
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Btn T={T} kind="accent" onClick={saveField} disabled={busy}>{busy ? 'Saving…' : edit.id ? 'Update field' : 'Add field'}</Btn>
            <Btn T={T} kind="ghost" onClick={() => setEdit(null)}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
function cfMini(T: any): React.CSSProperties {
  return { padding: '4px 9px', borderRadius: 6, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid, cursor: 'pointer', fontFamily: T.fBody, fontSize: 11.5, fontWeight: 600 };
}

// A hotkey recorder: focus it and PRESS the combination — typing strings is
// error-prone and half the combos (ctrl+shift+p) are browser shortcuts that
// never reach a text input as characters. Backspace/Delete clears.
function ShortcutInput({ T, value, onChange }: { T: any; value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = React.useState(false);
  const capture = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const k = e.key.toLowerCase();
    if (k === 'backspace' || k === 'delete') { onChange(''); return; }
    if (['shift', 'control', 'alt', 'meta'].includes(k)) return; // modifiers alone: wait for the key
    if (k === 'tab') return; // keep keyboard navigation working
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    parts.push(k === ' ' ? 'space' : k === 'escape' ? 'esc' : k);
    onChange(parts.join('+'));
  };
  return (
    <div style={{ position: 'relative', width: 170 }}>
      <input readOnly value={value} onKeyDown={capture}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={focused ? 'Press keys…' : 'Click to set'}
        style={{ width: '100%', padding: '9px 30px 9px 12px', fontSize: 13, fontFamily: T.fMono, color: T.ink, background: focused ? T.accent.soft : T.paper, border: `1.5px solid ${focused ? T.accent.base : T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', cursor: 'pointer', caretColor: 'transparent' }} />
      {value && (
        <button onClick={() => onChange('')} title="Clear" tabIndex={-1}
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, border: 'none', borderRadius: 5, background: 'transparent', color: T.inkSub, cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>✕</button>
      )}
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
