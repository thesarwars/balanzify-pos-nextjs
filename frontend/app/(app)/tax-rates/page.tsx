'use client';
import { useTheme } from '@/components/shell';
import { TaxRates } from './components/tax-rates-screen';

export default function TaxRatesPage() {
  const T = useTheme();
  return <TaxRates T={T} />;
}
