'use client';
import { useTheme } from '@/components/shell';
import { Reports } from '@/components/data-screen';
export default function ReportsPage() {
  const T = useTheme();
  return <Reports T={T} />;
}
