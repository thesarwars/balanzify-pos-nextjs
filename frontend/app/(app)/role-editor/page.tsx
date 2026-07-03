'use client';
import { useTheme } from '@/components/shell';
import { RoleEditorPage } from './components/role-editor-screen';

export default function RoleEditor() {
  const T = useTheme();
  return <RoleEditorPage T={T} />;
}
