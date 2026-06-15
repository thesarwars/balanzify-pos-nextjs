'use client';
import { useTheme } from '@/components/shell';
import { Contacts } from '@/components/contacts-screen';

export default function Page() {
  const T = useTheme();
  return <Contacts T={T} kind="customer" />;
}
