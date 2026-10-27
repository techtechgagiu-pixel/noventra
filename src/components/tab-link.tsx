'use client';
import Link, { useLinkStatus } from 'next/link';
import { useState, type ReactNode } from 'react';

function PendingHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden data-pending={pending} className={pending ? 'absolute inset-x-2 bottom-0 h-[3px] rounded bg-cyan/60 animate-pulse' : 'hidden'} />;
}

/** Warm only a tab the user points to or focuses, rather than querying all seven. */
export function TabLink({ href, label, active, children }: { href: string; label: string; active: boolean; children: ReactNode }) {
  const [intent, setIntent] = useState(false);
  return <Link href={href} title={label} aria-label={label} aria-current={active ? 'page' : undefined}
    prefetch={intent} onMouseEnter={() => setIntent(true)} onFocus={() => setIntent(true)}
    className="app-tab">
    {children}<PendingHint />
  </Link>;
}
