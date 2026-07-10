'use client';
import React from 'react';
import { useTheme } from '@/components/shell';
import { SalesList } from './components/sales-list';
import { SaleEditor } from './components/sale-editor';

export default function SalesPage() {
  const T = useTheme();
  // ?new=1 opens Add Sale directly, so the sidebar can link straight to it.
  const [adding, setAdding] = React.useState(false);
  const [flash, setFlash] = React.useState(0);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('new')) setAdding(true);
  }, []);

  if (adding) {
    return <SaleEditor T={T} onCancel={() => setAdding(false)}
      onDone={() => { setAdding(false); setFlash((n) => n + 1); }} />;
  }
  // Remounting on `flash` refetches the list after a sale is saved.
  return <SalesList key={flash} T={T} onAdd={() => setAdding(true)} />;
}
