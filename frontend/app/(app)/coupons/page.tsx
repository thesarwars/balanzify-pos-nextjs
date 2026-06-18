'use client';
import { useTheme } from '@/components/shell';
import { Coupons } from './components/coupons-screen';
export default function CouponsPage() {
  const T = useTheme();
  return <Coupons T={T} />;
}
