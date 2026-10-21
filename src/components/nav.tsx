'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, KeyRound, Network, Shield, Ticket } from 'lucide-react';

// Used only around the admin pages; the app itself is the single page at "/".
const items = [
  { href: '/?tab=bilete', label: 'Bilete', icon: Ticket },
  { href: '/?tab=analiza', label: 'Analiză', icon: Network },
  { href: '/?tab=istoric', label: 'Istoric', icon: BarChart3 },
];

export function Nav({ admin, name }: { admin: boolean; name: string }) {
  const path = usePathname();
  const all = admin ? [...items, { href: '/admin/models', label: 'Admin', icon: Shield }, { href: '/admin/invitations', label: 'Invitații', icon: KeyRound }] : items;
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span>PRIMUL <span className="text-cyan">11</span></span>
        </Link>
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Navigare principală">
          {all.map(({ href, label, icon: Icon }) => {
            const active = path === href || (href !== '/dashboard' && path.startsWith(href.split('/').slice(0, 2).join('/')));
            return (
              <Link key={href} href={href} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'}`}>
                <Icon size={16} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line/50 px-2 py-2 md:hidden" aria-label="Navigare mobil">
        {all.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${path.startsWith(href) ? 'bg-panel-2 text-text' : 'text-muted'}`}>
            <Icon size={14} aria-hidden /> {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
