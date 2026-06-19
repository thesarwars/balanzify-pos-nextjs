'use client';
import { useTheme } from '@/components/shell';
import { Products } from './components/products-screen';

export default function ProductsPage() {
  const T = useTheme();
  return <Products T={T} />;
}
