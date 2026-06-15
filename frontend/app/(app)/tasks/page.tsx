'use client';
import { useTheme } from '@/components/shell';
import { DataScreen } from '@/components/data-screen';
export default function TasksPage() {
  const T = useTheme();
  return <DataScreen T={T} id="tasks" />;
}
