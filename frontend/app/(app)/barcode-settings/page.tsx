'use client';
import { useTheme } from '@/components/shell';
import { BarcodeSettings } from './components/barcode-settings-screen';

export default function BarcodeSettingsPage() {
  const T = useTheme();
  return <BarcodeSettings T={T} />;
}
