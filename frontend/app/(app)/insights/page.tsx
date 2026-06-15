'use client';
import { useTheme } from '@/components/shell';
import { Insights } from '@/components/data-screen';
export default function InsightsPage() {
  const T = useTheme();
  return <Insights T={T} />;
}
