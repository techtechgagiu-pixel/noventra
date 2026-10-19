'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Home, Network, Settings, Shield, Ticket, Trophy } from 'lucide-react';

const items = [
  { href: '/dashboard', label: 'Acasă', icon: Home },
  { href: '/tickets', label: 'Biletele mele', icon: Ticket },
  { href: '/nexus', label: 'NEXUS', icon: Network },
  { href: '/matches', label: 'Meciuri', icon: Trophy },
  { href: '/performance', label: 'Performanță', icon: BarChart3 },
  { href: '/settings', label: 'Setări', icon: Settings },
];

export function Nav({ admin, name }: { admin: boolean; name: string }) {
  const path = usePathname();
  const all = admin ? [...items, { href: '/admin/models', label: 'Admin', icon: Shield }] : items;
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span>BETMIND <span className="text-cyan">SIX</span></span>
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
        <form action="/auth/logout" method="post" className="hidden md:block">
          <button className="text-sm text-muted hover:text-text" title={name}>Ieșire</button>
        </form>
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
