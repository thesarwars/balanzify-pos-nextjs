'use client';
import { useTheme } from '@/components/shell';
import { UsersRoles } from './components/users-screen';

export default function UsersPage() {
  const T = useTheme();
  return <UsersRoles T={T} />;
}
