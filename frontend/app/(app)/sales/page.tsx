'use client';
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { API } from '@/lib/api';
import { SalesList } from './components/sales-list';
import { SaleEditor } from './components/sale-editor';

export default function SalesPage() {
  const T = useTheme();
  const router = useRouter();
  const search = useSearchParams();

  // The view is driven by the URL, so the sidebar and row actions actually
  // switch it: /sales → list, /sales?new=1 → Add Sale, /sales?edit=<id> → Edit.
  const adding = search.get('new') === '1';
  const editId = search.get('edit');

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

  const done = (msg: string) => { flash.current = msg; router.push('/sales'); };

  if (editId) {
    if (editErr) { flash.current = editErr; router.push('/sales'); return null; }
    if (!editSale) return <div style={{ flex: 1, background: T.paperAlt }} />;
    return <SaleEditor T={T} sale={editSale} onCancel={() => router.push('/sales')} onDone={done} />;
  }
  if (adding) {
    return <SaleEditor T={T} onCancel={() => router.push('/sales')} onDone={done} />;
  }
  return <SalesList T={T} flash={flash} onAdd={() => router.push('/sales?new=1')}
    onEdit={(row: any) => router.push('/sales?edit=' + row.id)} />;
}
