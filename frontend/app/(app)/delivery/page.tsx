'use client';
import { useTheme } from '@/components/shell';
import { DeliveryScreen } from './components/delivery-screen';

export default function DeliveryPage() {
  const T = useTheme();
  return <DeliveryScreen T={T} />;
}
