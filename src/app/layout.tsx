import type { Metadata, Viewport } from 'next';
import { Barlow, Big_Shoulders } from 'next/font/google';
import './globals.css';

// Barlow for reading; Big Shoulders Display (stadium signage, 18.11; Big Shoulders family) for board numbers and headlines.
const body = Barlow({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });
const board = Big_Shoulders({ subsets: ['latin', 'latin-ext'], weight: ['600', '700', '800', '900'], variable: '--font-board', display: 'swap' });

export const metadata: Metadata = {
  robots: { index: false, follow: false }, // private personal tool
  title: 'TREI PUNCTE',
  description: 'Trei modele AI de top — Analistul, Reporterul și Decidentul — dezbat fiecare meci pe cote, date și știri reale.',
  metadataBase: new URL('https://primul11.noventra.ro'),
  applicationName: 'TREI PUNCTE',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'Trei Puncte', statusBarStyle: 'black-translucent' },
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    url: '/',
    siteName: 'TREI PUNCTE',
    title: 'TREI PUNCTE · Agenții AI dezbat. Tu primești biletul.',
    description: 'Analiză de fotbal cu 3 agenți AI de top, pe cote și date reale din ziua meciului.',
    // WhatsApp builds the preview on the sender's phone and is picky: a small JPEG with explicit type and size works best.
    images: [{ url: 'https://primul11.noventra.ro/og-image.jpg', secureUrl: 'https://primul11.noventra.ro/og-image.jpg', type: 'image/jpeg', width: 1200, height: 630, alt: 'TREI PUNCTE: agenții dezbat, tu primești biletul. Analiză de fotbal cu 3 agenți AI de top.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TREI PUNCTE · Agenții AI dezbat. Tu primești biletul.',
    description: 'Analiză de fotbal cu 3 agenți AI de top, pe cote și date reale din ziua meciului.',
    images: [{ url: '/twitter-image.png', width: 1200, height: 675, alt: 'TREI PUNCTE: agenții dezbat, tu primești biletul.' }],
  },
};
export const viewport: Viewport = { themeColor: '#10161d', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={`${body.variable} ${board.variable}`}>
      <body>{children}</body>
    </html>
  );
}
