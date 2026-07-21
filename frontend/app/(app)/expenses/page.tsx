'use client';
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { API } from '@/lib/api';
import { ExpensesList } from './components/expenses-list';
import { ExpenseEditor } from './components/expense-editor';
import { ExpenseCategories } from './components/expense-categories';
import { ExpenseImport } from './components/expense-import';

export default function ExpensesPage() {
  const T = useTheme();
  const router = useRouter();
  const search = useSearchParams();

  // URL-driven: /expenses → list, ?new=1 → Add Expense, ?edit=<id> → edit,
  // ?categories=1 → Expense Categories, ?import=1 → Import expense.
  const adding = search.get('new') === '1';
  const editId = search.get('edit');
  const categories = search.get('categories') === '1';
  const importing = search.get('import') === '1';

  const flash = React.useRef('');

  const [editing, setEditing] = React.useState<any>(null);
  const [editErr, setEditErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    setEditing(null); setEditErr(null);
    if (!editId) return;
    let dead = false;
    API.expense.get(editId)
      .then((e: any) => { if (!dead) setEditing(e); })
      .catch((e: any) => { if (!dead) setEditErr(e.message || 'Could not load that expense.'); });
    return () => { dead = true; };
  }, [editId]);

  const done = (msg: string) => { flash.current = msg; router.push('/expenses'); };

  // Navigation belongs in an effect — pushing during render trips React.
  React.useEffect(() => {
    if (editErr) { flash.current = editErr; router.push('/expenses'); }
  }, [editErr, router]);

  if (categories) return <ExpenseCategories T={T} onBack={() => router.push('/expenses')} />;
  if (importing) return <ExpenseImport T={T} onBack={() => router.push('/expenses')} />;
  if (editId) {
    if (editErr) return null;
    if (!editing) return <div style={{ flex: 1, background: T.paperAlt }} />;
    return <ExpenseEditor key={editId} T={T} expense={editing} onCancel={() => router.push('/expenses')} onDone={done} />;
  }
  if (adding) return <ExpenseEditor key="new" T={T} onCancel={() => router.push('/expenses')} onDone={done} />;
  return <ExpensesList T={T} flash={flash}
    onAdd={() => router.push('/expenses?new=1')}
    onEdit={(e: any) => router.push(`/expenses?edit=${e.id}`)}
    onImport={() => router.push('/expenses?import=1')}
    onCategories={() => router.push('/expenses?categories=1')} />;
}
