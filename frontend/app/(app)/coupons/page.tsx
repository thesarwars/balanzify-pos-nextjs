'use client';
import { useTheme } from '@/components/shell';
import { DataScreen } from '@/components/data-screen';
export default function CouponsPage() {
  const T = useTheme();
  return <DataScreen T={T} id="coupons" />;
}
