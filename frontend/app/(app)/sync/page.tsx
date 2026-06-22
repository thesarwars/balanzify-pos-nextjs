'use client';
import { useTheme } from '@/components/shell';
import { SyncScreen } from './components/sync-screen';

export default function SyncPage() {
  const T = useTheme();
  return <SyncScreen T={T} />;
}
