'use client';
import { useTheme } from '@/components/shell';
import { FiscalScreen } from './components/fiscal-screen';

export default function FiscalPage() {
  const T = useTheme();
  return <FiscalScreen T={T} />;
}
