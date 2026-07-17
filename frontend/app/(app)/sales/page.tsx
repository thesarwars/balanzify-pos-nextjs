'use client';
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { API } from '@/lib/api';
import { SalesList } from './components/sales-list';
import { SaleEditor } from './components/sale-editor';
import { ImportSales } from './components/import-sales';

export default function SalesPage() {
  const T = useTheme();
  const router = useRouter();
  const search = useSearchParams();

  // The view is driven by the URL, so the sidebar and row actions actually
  // switch it: /sales → list, /sales?new=1 → Add Sale, /sales?edit=<id> → Edit.
  // ?status=draft|quotation presets the document kind (Add Draft / List Drafts…),
  // ?type=pos pins the list to till sales (List POS).
  const adding = search.get('new') === '1';
  const editId = search.get('edit');
  const importing = search.get('import') === '1';
  const statusParam = search.get('status') || '';
  const typeParam = search.get('type') || '';
  const returnsParam = search.get('returns') === '1';
  const shipmentsParam = search.get('shipments') === '1';
  const initialStatus = ['draft', 'quotation'].includes(statusParam) ? statusParam : undefined;
  const preset = typeParam === 'pos'
    ? { type: 'pos', title: 'POS' }
    : statusParam === 'draft' ? { status: 'draft', title: 'Drafts' }
    : statusParam === 'quotation' ? { status: 'quotation', title: 'Quotations' }
    : returnsParam ? { has_returns: true, title: 'Sell Returns' }
    : shipmentsParam ? { has_shipping: true, title: 'Shipments' }
    : undefined;

  // Survives the editor→list swap (this page component does not unmount when the
  // query changes), so a save can flash a confirmation on the list it lands on.
  const flash = React.useRef('');

  // Edit needs the full sale before the form can prefill.
  const [editSale, setEditSale] = React.useState<any>(null);
  const [editErr, setEditErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    setEditSale(null); setEditErr(null);
    if (!editId) return;
    let dead = false;
    API.sell.get(editId)
      .then((s: any) => { if (!dead) setEditSale(s); })
      .catch((e: any) => { if (!dead) setEditErr(e.message || 'Could not load that sale.'); });
    return () => { dead = true; };
  }, [editId]);

  // Cancel lands back on the slice you came from; a SAVE lands on the slice
  // where the saved document is actually visible — a draft flipped to Final in
  // the form must not vanish behind a Drafts filter with a "saved" toast.
  const listUrl = initialStatus ? `/sales?status=${initialStatus}`
    : preset?.type ? `/sales?type=${preset.type}`
    : returnsParam ? '/sales?returns=1'
    : shipmentsParam ? '/sales?shipments=1'
    : '/sales';
  const sliceFor = (savedStatus?: string) =>
    savedStatus === 'draft' ? '/sales?status=draft'
    : savedStatus === 'quotation' ? '/sales?status=quotation'
    : savedStatus ? '/sales'
    : listUrl;
  const done = (msg: string, savedStatus?: string) => { flash.current = msg; router.push(sliceFor(savedStatus)); };

  // Import Sales is its own screen under the Sales route (so the sidebar keeps
  // "Sell" highlighted); it manages its own upload → review → import flow.
  if (importing) return <ImportSales T={T} />;

  if (editId) {
    if (editErr) { flash.current = editErr; router.push(listUrl); return null; }
    if (!editSale) return <div style={{ flex: 1, background: T.paperAlt }} />;
    // key: switching straight from one edit to another must start a fresh form.
    return <SaleEditor key={editId} T={T} sale={editSale} onCancel={() => router.push(listUrl)} onDone={done} />;
  }
  if (adding) {
    // key: Add Sale / Add Draft / Add Quotation share this spot in the tree —
    // without a remount, a screen retitled "Add Draft" would keep the previous
    // visit's Final status and post a real sale.
    return <SaleEditor key={initialStatus || 'sale'} T={T} initialStatus={initialStatus}
      onCancel={() => router.push(listUrl)} onDone={done} />;
  }
  // key: each slice is its own list — filters, rows and totals never leak from
  // the previous slice into a page already retitled as the next one.
  return <SalesList key={preset ? preset.title : 'all'} T={T} flash={flash} preset={preset}
    onAdd={() => router.push(preset?.status ? `/sales?new=1&status=${preset.status}` : '/sales?new=1')}
    onEdit={(row: any) => {
      // A till sale edits in the TILL: the POS loads it and the replacement
      // checkout voids the original. Invoices edit in the form.
      if (row._real?.type === 'pos') { router.push(`/pos?edit=${row.id}`); return; }
      // Carry the slice along, so saving/cancelling the edit returns here.
      const carry = preset?.status ? `&status=${preset.status}`
        : preset?.type ? `&type=${preset.type}`
        : returnsParam ? '&returns=1'
        : shipmentsParam ? '&shipments=1'
        : '';
      router.push(`/sales?edit=${row.id}${carry}`);
    }} />;
}
