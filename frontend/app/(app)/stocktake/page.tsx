'use client';
import { useTheme } from '@/components/shell';
import { DataScreen } from '@/components/data-screen';
export default function StocktakePage() {
  const T = useTheme();
  return <DataScreen T={T} id="stocktake" />;
}
