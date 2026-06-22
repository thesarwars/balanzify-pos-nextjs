'use client';
import { useEffect } from 'react';

// Registers the service worker so the app is installable and offline-resilient.
// No-op where service workers aren't available (older browsers, SSR).
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* best-effort */ });
    }
  }, []);
  return null;
}
