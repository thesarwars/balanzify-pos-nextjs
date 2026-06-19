'use client';
import { useTheme } from '@/components/shell';
import { InvoiceLayouts } from './components/invoice-layouts-screen';

export default function InvoiceLayoutsPage() {
  const T = useTheme();
  return <InvoiceLayouts T={T} />;
}
