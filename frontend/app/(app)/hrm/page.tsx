'use client';
import { useTheme } from '@/components/shell';
import { HRM } from './components/hrm-screen';

export default function HRMPage() {
  const T = useTheme();
  return <HRM T={T} />;
}
