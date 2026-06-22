import type { MetadataRoute } from 'next';

// Installable PWA so the product runs on whatever device the merchant already
// owns — phone, tablet or PC — with no app store and no special hardware.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Balanzify POS',
    short_name: 'Balanzify',
    description: 'Multi-vertical POS, inventory, accounting, embedded finance — built for African markets.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0E1C33',
    theme_color: '#1B3A6B',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
