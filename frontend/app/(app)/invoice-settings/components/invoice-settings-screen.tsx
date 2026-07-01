'use client';
// ─────────────────────────────────────────────────────────────────
// Invoice Settings — Settings ▸ Invoice Settings. Two tabs:
// Invoice Schemes (numbering) and Invoice Layouts (receipt formats).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { Panel, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';
import { SchemeManagerBody } from '@/components/invoice-schemes';
import { InvoiceLayouts } from '../../invoice-layouts/components/invoice-layouts-screen';

export function InvoiceSettings({ T }: { T: Theme }) {
  const [tab, setTab] = React.useState<'schemes' | 'layouts'>('schemes');
  const [schemes, setSchemes] = React.useState<any[]>([]);
  const [toast, toastNode] = useToast();

  const loadSchemes = React.useCallback(() => {
    API.invoiceScheme.list()
      .then((s: any) => setSchemes(Array.isArray(s) ? s : ((s && (s.items || s.data)) || [])))
      .catch(() => {});
  }, []);
  React.useEffect(() => { loadSchemes(); }, [loadSchemes]);

  const TabBtn = ({ id, label }: { id: 'schemes' | 'layouts'; label: string }) => (
    <button onClick={() => setTab(id)} style={{ padding: '11px 4px', marginRight: 24, background: 'none', border: 'none', borderBottom: `2.5px solid ${tab === id ? T.accent.base : 'transparent'}`, color: tab === id ? T.ink : T.inkSub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.fBody }}>{label}</button>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Invoice Settings" subtitle="Manage your invoice schemes & layouts" />
      <div style={{ padding: '0 28px', borderBottom: `1px solid ${T.line}`, background: T.paper }}>
        <TabBtn id="schemes" label="Invoice Schemes" />
        <TabBtn id="layouts" label="Invoice Layouts" />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {tab === 'schemes' ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
            <div style={{ maxWidth: 640, margin: '0 auto' }}>
              <Panel T={T} title="All your invoice schemes">
                <SchemeManagerBody T={T} schemes={schemes} onChange={loadSchemes} toast={toast} />
              </Panel>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '16px 28px 0' }}>
            <InvoiceLayouts T={T} embedded />
          </div>
        )}
      </div>
      {toastNode}
    </div>
  );
}
