'use client';
import { useTheme } from '@/components/shell';
import { LendingScreen } from './components/lending-screen';

export default function LendingPage() {
  const T = useTheme();
  return <LendingScreen T={T} />;
}
