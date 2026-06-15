'use client';
import { useTheme } from '@/components/shell';
import { Settings } from '@/components/data-screen';
export default function SettingsPage() {
  const T = useTheme();
  return <Settings T={T} />;
}
