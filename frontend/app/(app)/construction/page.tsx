'use client';
import { useTheme } from '@/components/shell';
import { Construction } from '@/components/verticals';

export default function ConstructionPage() {
  const T = useTheme();
  return <Construction T={T} />;
}
