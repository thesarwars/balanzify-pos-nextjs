'use client';
import React from 'react';
import { useOfflineSync } from '@/lib/use-offline-sync';
import { useT } from '@/lib/locale-context';

/**
 * Compact connectivity + queue indicator for the app chrome. Shows offline state
 * and how many sales are waiting to sync; tapping it forces a flush.
 */
export function OfflineIndicator() {
  const { online, pending, syncing, flush } = useOfflineSync();
  const t = useT();

  // Online with an empty queue is the happy path — stay out of the way.
  if (online && pending === 0 && !syncing) return null;

  const bg = !online ? 'rgba(192,80,77,0.16)' : pending > 0 ? 'rgba(217,164,65,0.18)' : 'rgba(255,255,255,0.08)';
  const fg = !online ? '#E29A97' : '#E7C06A';
  const label = !online
    ? t('offline.offline')
    : syncing
      ? t('offline.syncing')
      : `${pending} ${t('offline.queued')}`;

  return (
    <button
      onClick={() => flush()}
      title={t('offline.sync_now')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px',
        borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
        background: bg, color: fg, whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 9 }}>{online ? '⇅' : '⊘'}</span>{label}
    </button>
  );
}
