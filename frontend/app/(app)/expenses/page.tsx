'use client';
import { useTheme } from '@/components/shell';
import { Finance } from '@/components/finance-screen';

export default function ExpensesPage() {
  const T = useTheme();
  return <Finance T={T} tab="expenses" />;
}
