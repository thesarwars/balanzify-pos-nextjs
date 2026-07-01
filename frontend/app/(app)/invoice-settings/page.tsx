'use client';
import { useTheme } from '@/components/shell';
import { InvoiceSettings } from './components/invoice-settings-screen';

export default function InvoiceSettingsPage() {
  const T = useTheme();
  return <InvoiceSettings T={T} />;
}
