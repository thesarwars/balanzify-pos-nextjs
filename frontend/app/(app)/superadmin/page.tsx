'use client';
import { useTheme } from '@/components/shell';
import { Superadmin } from './components/superadmin-screen';

export default function SuperadminPage() {
  const T = useTheme();
  return <Superadmin T={T} />;
}
