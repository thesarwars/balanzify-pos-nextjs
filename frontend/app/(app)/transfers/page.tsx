'use client';
import { useTheme } from '@/components/shell';
import { Transfers } from './components/transfers-screen';

export default function TransfersPage() {
  const T = useTheme();
  return <Transfers T={T} />;
}
