'use client';
import React from 'react';
import { useRouter } from 'next/navigation';

// Entry route: send signed-in users to the dashboard, everyone else to /login.
// (Client-side because the session flag lives in localStorage.)
export default function Home() {
  const router = useRouter();
  React.useEffect(() => {
    let ok = false;
    try { ok = localStorage.getItem('bz_authed') === '1'; } catch {}
    router.replace(ok ? '/dashboard' : '/login');
  }, [router]);
  return null;
}
