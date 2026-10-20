import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter', display: 'swap' });
const grotesk = Space_Grotesk({ subsets: ['latin', 'latin-ext'], variable: '--font-grotesk', display: 'swap' });

export const metadata: Metadata = {
  title: 'BETMIND SIX · NEXUS',
  description: 'Six Minds. One Decision. Analiză de fotbal cu zece agenți AI, pe date reale.',
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { themeColor: '#060b18', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={`${inter.variable} ${grotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
