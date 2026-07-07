'use client';
import React from 'react';
import { useTheme } from '@/components/shell';
import { Products } from './components/products-screen';

export default function ProductsPage() {
  const T = useTheme();
  // Suspense boundary: the screen reads ?tool= via useSearchParams to open the
  // Units / Price Groups / Variations / Labels managers from the sidebar.
  return <React.Suspense fallback={null}><Products T={T} /></React.Suspense>;
}
