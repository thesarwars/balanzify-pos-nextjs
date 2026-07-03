'use client';
import { useTheme } from '@/components/shell';
import { ContactView } from './components/contact-view-screen';

export default function ContactViewPage() {
  const T = useTheme();
  return <ContactView T={T} />;
}
