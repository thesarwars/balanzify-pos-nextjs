'use client';
import { useTheme } from '@/components/shell';
import { InteractionsScreen } from './components/interactions-screen';

export default function InteractionsPage() {
  const T = useTheme();
  return <InteractionsScreen T={T} />;
}
