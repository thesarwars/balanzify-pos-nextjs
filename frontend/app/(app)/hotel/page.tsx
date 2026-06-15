'use client';
import { useTheme } from '@/components/shell';
import { Hotel } from '@/components/verticals';

export default function HotelPage() {
  const T = useTheme();
  return <Hotel T={T} />;
}
