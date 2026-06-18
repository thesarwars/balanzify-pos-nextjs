'use client';
import { useTheme } from '@/components/shell';
import { Wholesale } from './components/wholesale-screen';

export default function WholesalePage() {
  const T = useTheme();
  return <Wholesale T={T} />;
}
