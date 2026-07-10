'use client';
import { useTheme } from '@/components/shell';
import { PurchaseReturns } from './components/purchase-returns-screen';

export default function PurchaseReturnsPage() {
  const T = useTheme();
  return <PurchaseReturns T={T} />;
}
