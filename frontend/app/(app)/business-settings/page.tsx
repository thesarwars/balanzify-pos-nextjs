'use client';
import { useTheme } from '@/components/shell';
import { BusinessSettings } from './components/business-settings-screen';

export default function BusinessSettingsPage() {
  const T = useTheme();
  return <BusinessSettings T={T} />;
}
