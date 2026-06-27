'use client';
// Per-segment error boundary for the authenticated app. A render crash inside
// any screen is caught here and shown inside the shell chrome, so the sidebar
// and nav survive and the user can recover or move on — instead of the whole
// SPA blanking out. `reset()` re-renders the failed segment.
import React, { useEffect } from 'react';
import { makeTheme } from '@/lib/theme';
import { StateView } from '@/components/state-view';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const T = makeTheme({});
  useEffect(() => {
    // Hook point for real telemetry (Sentry etc.) — for now, console for dev.
    if (typeof console !== 'undefined') console.error('[screen error]', error);
  }, [error]);
  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <StateView
        T={T}
        kind="error"
        title="This screen ran into a problem"
        message="It’s not your fault — the screen failed to render. You can retry, or pick another section from the menu."
        onRetry={() => reset()}
        retryLabel="Retry"
      />
    </div>
  );
}
