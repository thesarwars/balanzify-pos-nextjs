'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { Reports } from '@/components/data-screen';

// URL-driven tabs (/reports?tab=profit-loss) so the sidebar's Reports children
// can deep-link and stay highlighted; plain tab clicks push the same URLs.
export default function ReportsPage() {
  const T = useTheme();
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get('tab') || 'overview';
  return <Reports T={T} tab={tab} onTab={(t: string) => router.push(t === 'overview' ? '/reports' : `/reports?tab=${t}`)} />;
}
