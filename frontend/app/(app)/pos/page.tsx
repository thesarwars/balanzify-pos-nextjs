'use client';
import { useTheme, useTweaks } from '@/components/shell';
import { POS } from './components/pos-screen';

export default function POSPage() {
  const T = useTheme();
  const [tweaks] = useTweaks();
  return <POS T={T} tweaks={tweaks} />;
}
