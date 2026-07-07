'use client';
import { useTheme } from '@/components/shell';
import { Categories } from './components/categories-screen';
export default function CategoriesPage() {
  const T = useTheme();
  return <Categories T={T} />;
}
