'use client';
import { useTheme } from '@/components/shell';
import { Modules } from '@/components/data-screen';
export default function ModulesPage() {
  const T = useTheme();
  return <Modules T={T} />;
}
