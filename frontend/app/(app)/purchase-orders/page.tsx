'use client';
import { useTheme } from '@/components/shell';
import { Purchases } from './components/purchase-orders-screen';

export default function PurchasesPage() {
  const T = useTheme();
  return <Purchases T={T} />;
}
