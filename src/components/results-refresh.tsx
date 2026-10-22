'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useVisibleRefresh } from '@/lib/use-visible-refresh';

/**
 * Refresh server-rendered outcomes while keeping filters, scroll and the current ticket open.
 * The server may be waking from sleep (Render Free): it is pinged first, and the page refreshes only once it answers,
 * so a failed refresh never replaces the page with an error screen.
 */
export function ResultsRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useVisibleRefresh(async () => {
    if (pending) return;
    const ok = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(60_000) }).then((r) => r.ok).catch(() => false);
    if (ok) startTransition(() => router.refresh());
  });
  return null;
}
