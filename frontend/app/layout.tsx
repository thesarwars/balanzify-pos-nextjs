import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LocaleProvider } from '@/lib/locale-context';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: 'Balanzify POS',
  description: 'Multi-vertical POS + Inventory + Accounting + embedded finance — built for African markets.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Balanzify',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Balanzify' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#1B3A6B',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover', // respect notches/safe-areas on phones
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body>
        <LocaleProvider>{children}</LocaleProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
