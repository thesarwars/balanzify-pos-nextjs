'use client';
import { useSearchParams } from 'next/navigation';
import { useTheme, useTweaks } from '@/components/shell';
import { POS } from './components/pos-screen';

export default function POSPage() {
  const T = useTheme();
  const [tweaks] = useTweaks();
  // /pos?edit=<saleId> loads that sale into the till; completing the new
  // checkout voids and replaces the original.
  const editSaleId = useSearchParams().get('edit');
  return <POS T={T} tweaks={tweaks} editSaleId={editSaleId} />;
}
