'use client';
import { useTheme } from '@/components/shell';
import { Pharmacy } from '@/components/verticals';

export default function PharmacyPage() {
  const T = useTheme();
  return <Pharmacy T={T} />;
}
