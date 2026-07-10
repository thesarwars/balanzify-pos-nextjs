'use client';
import { useTheme } from '@/components/shell';
import { ReceiptPrinters } from './components/receipt-printers-screen';

export default function ReceiptPrintersPage() {
  const T = useTheme();
  return <ReceiptPrinters T={T} />;
}
