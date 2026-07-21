'use client';
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { API } from '@/lib/api';
import { AdjustmentsList } from './components/adjustments-screen';
import { AdjustmentEditor } from './components/adjustment-editor';

export default function AdjustmentsPage() {
  const T = useTheme();
  const router = useRouter();
  const search = useSearchParams();

  // URL-driven like /transfers: /adjustments → list, ?new=1 → Add Stock
  // Adjustment, ?edit=<id> → edit — sidebar children and new-tab links work.
  const adding = search.get('new') === '1';
  const editId = search.get('edit');

  // Survives the editor→list swap so a save can flash its confirmation.
  const flash = React.useRef('');

  const [editing, setEditing] = React.useState<any>(null);
  const [editErr, setEditErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    setEditing(null); setEditErr(null);
    if (!editId) return;
    let dead = false;
    API.stockAdjustment.get(editId)
      .then((a: any) => { if (!dead) setEditing(a); })
      .catch((e: any) => { if (!dead) setEditErr(e.message || 'Could not load that adjustment.'); });
    return () => { dead = true; };
  }, [editId]);

  const done = (msg: string) => { flash.current = msg; router.push('/adjustments'); };

  if (editId) {
    if (editErr) { flash.current = editErr; router.push('/adjustments'); return null; }
    if (!editing) return <div style={{ flex: 1, background: T.paperAlt }} />;
    return <AdjustmentEditor key={editId} T={T} adjustment={editing} onCancel={() => router.push('/adjustments')} onDone={done} />;
  }
  if (adding) return <AdjustmentEditor key="new" T={T} onCancel={() => router.push('/adjustments')} onDone={done} />;
  return <AdjustmentsList T={T} flash={flash}
    onAdd={() => router.push('/adjustments?new=1')}
    onEdit={(a: any) => router.push(`/adjustments?edit=${a.id}`)} />;
}
