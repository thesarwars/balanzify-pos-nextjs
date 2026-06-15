'use client';
import { useTheme } from '@/components/shell';
import { Finance } from '@/components/finance-screen';

export default function FinancePage() {
  return <Finance T={useTheme()} tab="accounts" />;
}
