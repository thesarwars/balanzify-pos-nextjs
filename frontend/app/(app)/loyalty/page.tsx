'use client';
import { useTheme } from '@/components/shell';
import { Loyalty } from './components/loyalty-screen';

export default function LoyaltyPage() {
  const T = useTheme();
  return <Loyalty T={T} />;
}
