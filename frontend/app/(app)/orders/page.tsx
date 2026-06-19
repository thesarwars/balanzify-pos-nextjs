'use client';
import { useTheme } from '@/components/shell';
import { Orders } from './components/orders-screen';

export default function OrdersPage() {
  const T = useTheme();
  return <Orders T={T} />;
}
