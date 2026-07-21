'use client';
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { API } from '@/lib/api';
import { TransfersList } from './components/transfers-screen';
import { TransferEditor } from './components/transfer-editor';

export default function TransfersPage() {
  const T = useTheme();
  const router = useRouter();
  const search = useSearchParams();

  // URL-driven like /sales: /transfers → list, ?new=1 → Add Stock Transfer,
  // ?edit=<id> → edit — so the sidebar children and new-tab links all work.
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
    API.transfer.get(editId)
      .then((t: any) => { if (!dead) setEditing(t); })
      .catch((e: any) => { if (!dead) setEditErr(e.message || 'Could not load that transfer.'); });
    return () => { dead = true; };
  }, [editId]);

  const done = (msg: string) => { flash.current = msg; router.push('/transfers'); };

  if (editId) {
    if (editErr) { flash.current = editErr; router.push('/transfers'); return null; }
    if (!editing) return <div style={{ flex: 1, background: T.paperAlt }} />;
    return <TransferEditor key={editId} T={T} transfer={editing} onCancel={() => router.push('/transfers')} onDone={done} />;
  }
  if (adding) return <TransferEditor key="new" T={T} onCancel={() => router.push('/transfers')} onDone={done} />;
  return <TransfersList T={T} flash={flash}
    onAdd={() => router.push('/transfers?new=1')}
    onEdit={(t: any) => router.push(`/transfers?edit=${t.id}`)} />;
}
