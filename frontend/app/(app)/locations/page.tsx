'use client';
import { useTheme } from '@/components/shell';
import { Locations } from './components/locations-screen';

export default function LocationsPage() {
  const T = useTheme();
  return <Locations T={T} />;
}
