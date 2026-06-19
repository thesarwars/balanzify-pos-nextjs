'use client';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { Dashboard } from './components/dashboard-screen';

export default function DashboardPage() {
  const T = useTheme();
  const router = useRouter();
  return <Dashboard T={T} setScreen={(s: string) => router.push('/' + s)} />;
}
