'use client';
import { useTheme } from '@/components/shell';
import { Discounts } from './components/discounts-screen';

export default function DiscountsPage() {
  const T = useTheme();
  return <Discounts T={T} />;
}
