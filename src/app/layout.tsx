import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import './globals.css';

// Stadium-signage pair: Barlow for reading, Barlow Condensed for scoreboard numbers and headlines.
const body = Barlow({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });
const board = Barlow_Condensed({ subsets: ['latin', 'latin-ext'], weight: ['500', '600', '700', '800'], variable: '--font-board', display: 'swap' });

export const metadata: Metadata = {
  robots: { index: false, follow: false }, // private personal tool
  title: 'PRIMUL 11',
  description: 'Primul 11 votează. Tu câștigi timp. Analiză de fotbal cu 32 de agenți AI și o redacție sportivă, pe date reale.',
  metadataBase: new URL('https://primul11.noventra.ro'),
  applicationName: 'PRIMUL 11',
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
  appleWebApp: { capable: true, title: 'Primul 11', statusBarStyle: 'black-translucent' },
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    url: '/',
    siteName: 'PRIMUL 11',
    title: 'PRIMUL 11 · Agenții dezbat. Tu primești biletul.',
    description: 'Analiză de fotbal cu 32 de agenți AI, pe cote și date reale din ziua meciului.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'PRIMUL 11: agenții dezbat, tu primești biletul. Analiză de fotbal cu 32 de agenți AI.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PRIMUL 11 · Agenții dezbat. Tu primești biletul.',
    description: 'Analiză de fotbal cu 32 de agenți AI, pe cote și date reale din ziua meciului.',
    images: [{ url: '/twitter-image.png', width: 1200, height: 675, alt: 'PRIMUL 11: agenții dezbat, tu primești biletul.' }],
  },
};
export const viewport: Viewport = { themeColor: '#0b1d15', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={`${body.variable} ${board.variable}`}>
      <body>{children}</body>
    </html>
  );
}
