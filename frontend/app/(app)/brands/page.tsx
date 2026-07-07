'use client';
import { useTheme } from '@/components/shell';
import { Brands } from './components/brands-screen';

export default function BrandsPage() {
  const T = useTheme();
  return <Brands T={T} />;
}
