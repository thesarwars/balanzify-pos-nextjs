'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { Outbox, makeStore, type FlushSummary, type PushResult } from '@/lib/offline';

// One shared outbox for the whole app. The push function is the typed sync client.
let _outbox: Outbox | null = null;
export function outbox(): Outbox {
  if (!_outbox) {
    _outbox = new Outbox(makeStore(), (body) => API.sync.push(body) as Promise<PushResult>);
  }
  return _outbox;
}

/**
 * Tracks connectivity and the offline queue, and flushes the outbox when the
 * device comes back online (and on a slow interval as a safety net).
 */
export function useOfflineSync() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    try { setPending(await outbox().pendingCount()); } catch { /* ignore */ }
  }, []);

  const flush = useCallback(async (): Promise<FlushSummary | null> => {
    if (busy.current) return null;
    busy.current = true; setSyncing(true);
    try {
      const summary = await outbox().flush();
      await refresh();
      return summary;
    } catch {
      return null; // offline or backend unreachable — try again next time
    } finally {
      busy.current = false; setSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (typeof navigator !== 'undefined') setOnline(navigator.onLine);
    refresh();

    const goOnline = () => { setOnline(true); flush(); };
    const goOffline = () => setOnline(false);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', goOnline);
      window.addEventListener('offline', goOffline);
    }
    const iv = setInterval(() => { if (typeof navigator === 'undefined' || navigator.onLine) flush(); }, 60000);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', goOnline);
        window.removeEventListener('offline', goOffline);
      }
      clearInterval(iv);
    };
  }, [flush, refresh]);

  return { online, pending, syncing, flush, refresh };
}
