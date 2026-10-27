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
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { themeColor: '#0b1d15', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={`${body.variable} ${board.variable}`}>
      <body>{children}</body>
    </html>
  );
}
