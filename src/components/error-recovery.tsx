'use client';
import { useEffect, useState } from 'react';

/**
 * Shown instead of a blank error page. The usual cause is the server waking from sleep or a new version being
 * published: it waits until the server answers, then reloads by itself.
 */
export function ErrorRecovery({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const [state, setState] = useState<'waiting' | 'failed'>('waiting');
  useEffect(() => {
    console.error(error);
    let alive = true;
    // A genuine bug would fail again after reloading: allow two automatic reloads per minute, then stop.
    const key = 'p11-error-reloads';
    let recent: number[] = [];
    try { recent = (JSON.parse(sessionStorage.getItem(key) ?? '[]') as number[]).filter((t) => Date.now() - t < 60_000); } catch { /* storage unavailable */ }
    if (recent.length >= 2) { setState('failed'); return; }
    (async () => {
      for (let i = 0; i < 12 && alive; i++) {
        const ok = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(20_000) }).then((r) => r.ok).catch(() => false);
        if (ok) { try { sessionStorage.setItem(key, JSON.stringify([...recent, Date.now()])); } catch { /* ignore */ } window.location.reload(); return; }
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (alive) setState('failed');
    })();
    return () => { alive = false; };
  }, [error]);
  return (
    <main style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#e6ecff', background: '#050914', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420 }}>
        <p style={{ fontSize: 22, fontWeight: 700 }}>{state === 'waiting' ? 'Reconectez PRIMUL 11…' : 'Pagina nu a putut fi încărcată.'}</p>
        <p style={{ marginTop: 8, fontSize: 14, color: '#94a3c4' }}>{state === 'waiting' ? 'Serverul pornește sau se actualizează. Pagina se reîncarcă singură în câteva secunde.' : `Eroare: ${error.message || 'necunoscută'}. Încearcă din nou peste un minut.`}</p>
        <button onClick={() => (reset ? reset() : window.location.reload())} style={{ marginTop: 16, padding: '10px 18px', borderRadius: 12, background: '#22d3ee', color: '#050914', fontWeight: 700, border: 0, cursor: 'pointer' }}>Reîncarcă acum</button>
        {error.digest && <p style={{ marginTop: 12, fontSize: 11, color: '#64748b' }}>Cod: {error.digest}</p>}
      </div>
    </main>
  );
}
