'use client';
import { startTransition, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorRecovery } from '@/components/error-recovery';

const KEY = 'p11-soft-retry';
/** 18.11: a failed render is first fetched again in place (once per 20 s); only a second failure shows the connection check. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [soft, setSoft] = useState<boolean | null>(null);
  useEffect(() => {
    if (/ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(`${error?.name} ${error?.message}`)) { setSoft(false); return; }
    let last = 0;
    try { last = Number(sessionStorage.getItem(KEY) ?? 0); } catch { /* storage unavailable */ }
    if (Date.now() - last < 20_000) { setSoft(false); return; }
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
    setSoft(true);
    const t = setTimeout(() => startTransition(() => { router.refresh(); reset(); }), 500);
    return () => clearTimeout(t);
  }, [error, reset, router]);
  if (soft !== false) return <div role="status" className="mx-auto max-w-md py-24 text-center text-sm text-muted">Reîncarc pagina…</div>;
  return <ErrorRecovery error={error} reset={reset} />;
}
