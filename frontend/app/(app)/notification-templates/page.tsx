'use client';
// Notification Templates — per-event subject/CC/BCC/email/SMS/WhatsApp bodies
// with {tags} substituted at send time. Stored in the settings bag; the sale
// notification modal prefills from here.
import React from 'react';
import { useTheme, Topbar } from '@/components/shell';
import { Btn, Panel, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { API } from '@/lib/api';
import { getSetting } from '@/lib/business-settings';

const GROUPS: [string, [string, string, string][]][] = [
  ['Customer Notifications', [
    ['new_sale', 'New Sale', '{business_name} {invoice_number} {invoice_url} {total_amount} {paid_amount} {due_amount} {contact_name} {location_name}'],
    ['payment_received', 'Payment Received', '{business_name} {invoice_number} {received_amount} {contact_name}'],
    ['payment_reminder', 'Payment Reminder', '{business_name} {invoice_number} {due_amount} {contact_name}'],
    ['new_quotation', 'New Quotation', '{business_name} {invoice_number} {total_amount} {contact_name}'],
  ]],
  ['Supplier Notifications', [
    ['new_order', 'New Order', '{business_name} {order_ref_number} {total_amount} {contact_name}'],
    ['payment_paid', 'Payment Paid', '{business_name} {order_ref_number} {received_amount} {contact_name}'],
    ['items_received', 'Items Received', '{business_name} {order_ref_number} {contact_name}'],
    ['items_pending', 'Items Pending', '{business_name} {order_ref_number} {contact_name}'],
  ]],
  ['Ledger', [['send_ledger', 'Send Ledger', '{business_name} {contact_name} {balance_due}']]],
];
const ALL = GROUPS.flatMap(([, ts]) => ts);

export default function NotificationTemplatesPage() {
  const T = useTheme();
  const [key, setKey] = React.useState('new_sale');
  const [all, setAll] = React.useState<any>({});
  const [busy, setBusy] = React.useState(false);
  const [show, node] = useToast();
  React.useEffect(() => { setAll(getSetting('notification_templates', {}) || {}); }, []);
  const t = all[key] || {};
  const set = (k: string, v: any) => setAll((p: any) => ({ ...p, [key]: { ...(p[key] || {}), [k]: v } }));
  const meta = ALL.find(([k]) => k === key)!;
  async function save() {
    setBusy(true);
    try {
      const b = await API.business.get();
      await API.business.update({ name: b.name, currency: b.currency || 'USD', tax_number: b.tax_number || null, settings: { notification_templates: all } });
      try { window.dispatchEvent(new Event('bz:settings-changed')); } catch {}
      show('Templates saved');
    } catch (e: any) { show(e.message); } finally { setBusy(false); }
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Notification Templates" subtitle="Email, SMS and WhatsApp wording with {tags} filled at send time"
        right={<Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Panel T={T}>
            <FormGrid cols={2}>
              <Field T={T} label="Template">
                <SelectField T={T} value={key} options={ALL.map(([k]) => k)} onChange={setKey}
                  render={(v: any) => { const g = GROUPS.find(([, ts]) => ts.some(([k]) => k === v)); const m = ALL.find(([k]) => k === v); return `${g ? g[0].replace(' Notifications', '') : ''} — ${m ? m[1] : v}`; }} />
              </Field>
            </FormGrid>
            <div style={{ marginTop: 10, fontSize: 12, color: T.inkSub }}><b>Available tags:</b> {meta[2]}</div>
          </Panel>
          <Panel T={T}>
            <FormGrid cols={1}>
              <Field T={T} label="Email Subject"><TextField T={T} value={t.subject || ''} onChange={(v: any) => set('subject', v)} /></Field>
            </FormGrid>
            <FormGrid cols={2} style={{ marginTop: 8 }}>
              <Field T={T} label="CC"><TextField T={T} value={t.cc || ''} onChange={(v: any) => set('cc', v)} /></Field>
              <Field T={T} label="BCC"><TextField T={T} value={t.bcc || ''} onChange={(v: any) => set('bcc', v)} /></Field>
            </FormGrid>
            {([['email_body', 'Email Body', 7], ['sms_body', 'SMS Body', 3], ['whatsapp', 'WhatsApp Text', 3]] as [string, string, number][]).map(([k, label, rows]) => (
              <div key={k} style={{ marginTop: 10 }}>
                <Field T={T} label={label}>
                  <textarea value={t[k] || ''} onChange={(e) => set(k, e.target.value)} rows={rows}
                    style={{ width: '100%', padding: '10px 13px', fontSize: 13.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
                </Field>
              </div>
            ))}
            <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, background: '#F59E0B22', color: T.inkMid, fontSize: 12 }}>
              The business logo and HTML only apply to email — SMS and WhatsApp send plain text.
            </div>
          </Panel>
        </div>
      </div>
      {node}
    </div>
  );
}
