'use client';
import Link, { useLinkStatus } from 'next/link';
import { useState, type ReactNode } from 'react';

function PendingHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden data-pending={pending} className={pending ? 'absolute inset-0 rounded-lg border border-cyan/60 bg-cyan/10 animate-pulse' : 'hidden'} />;
}

/** Warm only a tab the user points to or focuses, rather than querying all seven. */
export function TabLink({ href, label, active, children }: { href: string; label: string; active: boolean; children: ReactNode }) {
  const [intent, setIntent] = useState(false);
  return <Link href={href} title={label} aria-label={label} aria-current={active ? 'page' : undefined}
    prefetch={intent} onMouseEnter={() => setIntent(true)} onFocus={() => setIntent(true)}
    className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition md:px-3 xl:px-2.5 ${active ? 'bg-cyan/15 text-cyan' : 'text-muted hover:text-text'}`}>
    {children}<PendingHint />
  </Link>;
}
