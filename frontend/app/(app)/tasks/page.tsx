'use client';
import { useTheme } from '@/components/shell';
import { Tasks } from './components/tasks-screen';

export default function TasksPage() {
  const T = useTheme();
  return <Tasks T={T} />;
}
