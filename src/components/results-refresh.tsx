'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useVisibleRefresh } from '@/lib/use-visible-refresh';

/** Refresh server-rendered outcomes while keeping filters, scroll and the current ticket open. */
export function ResultsRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useVisibleRefresh(() => { if (!pending) startTransition(() => router.refresh()); });
  return null;
}
