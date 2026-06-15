'use client';
import { useTheme } from '@/components/shell';
import { DataScreen } from '@/components/data-screen';
export default function StockPage() {
  const T = useTheme();
  return <DataScreen T={T} id="stock" />;
}
