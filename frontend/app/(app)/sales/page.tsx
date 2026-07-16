'use client';
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { SalesList } from './components/sales-list';
import { SaleEditor } from './components/sale-editor';

export default function SalesPage() {
  const T = useTheme();
  const router = useRouter();
  const search = useSearchParams();

  // The view is driven by the URL, so the sidebar (List Sales → /sales, Add Sale
  // → /sales?new=1) actually switches it. useSearchParams re-renders on query
  // change, so navigating between the two works without a remount.
  const adding = search.get('new') === '1';

  // Survives the editor→list swap (this page component does not unmount when the
  // query changes), so a save can flash a confirmation on the list it lands on.
  const flash = React.useRef('');

  if (adding) {
    return (
      <SaleEditor T={T}
        onCancel={() => router.push('/sales')}
        onDone={(msg: string) => { flash.current = msg; router.push('/sales'); }} />
    );
  }
  return <SalesList T={T} flash={flash} onAdd={() => router.push('/sales?new=1')} />;
}
