'use client';
import { useTheme } from '@/components/shell';
import { Adjustments } from './components/adjustments-screen';

export default function AdjustmentsPage() {
  const T = useTheme();
  return <Adjustments T={T} />;
}
