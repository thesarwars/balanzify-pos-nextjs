'use client';
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/components/shell';
import { AccountsScreen } from './components/accounts-screen';
import { BalanceSheet, TrialBalance, CashFlow, AccountReport } from './components/statements';

export default function PaymentAccountsPage() {
  const T = useTheme();
  const router = useRouter();
  const search = useSearchParams();
  const flash = React.useRef('');

  // URL-driven so the sidebar children (and new-tab links) work:
  // /payment-accounts → accounts, ?balance-sheet=1, ?trial-balance=1,
  // ?cash-flow=1, ?report=1.
  if (search.get('balance-sheet') === '1') return <BalanceSheet T={T} />;
  if (search.get('trial-balance') === '1') return <TrialBalance T={T} />;
  if (search.get('cash-flow') === '1') return <CashFlow T={T} />;
  if (search.get('report') === '1') return <AccountReport T={T} />;
  return <AccountsScreen T={T} flash={flash} onReport={() => router.push('/payment-accounts?report=1')} />;
}
