'use client';
import { useTheme } from '@/components/shell';
import { Restaurant } from './components/restaurant-screen';

export default function RestaurantPage() {
  const T = useTheme();
  return <Restaurant T={T} />;
}
