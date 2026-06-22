'use client';
import { useTheme } from '@/components/shell';
import { ZakatScreen } from './components/zakat-screen';

export default function ZakatPage() {
  const T = useTheme();
  return <ZakatScreen T={T} />;
}
