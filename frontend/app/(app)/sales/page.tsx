'use client';
import { useTheme } from '@/components/shell';
import { Sales } from './components/sales-screen';

export default function SalesPage() {
  const T = useTheme();
  return <Sales T={T} />;
}
