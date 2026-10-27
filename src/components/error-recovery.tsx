'use client';
import { useEffect, useState } from 'react';

/**
 * Recover transient failures, but stop retries when the database reports an exhausted quota.
 */
export function ErrorRecovery({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const [state, setState] = useState<'waiting' | 'failed' | 'quota'>('waiting');
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
        const health = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(20_000) }).then(async (r) => ({ok:r.ok, data:await r.json().catch(()=>null)})).catch(() => null);
        if (!alive) return;
        if (health?.data?.databaseIssue === 'quota') { setState('quota'); return; }
        if (health?.ok) { try { sessionStorage.setItem(key, JSON.stringify([...recent, Date.now()])); } catch { /* ignore */ } window.location.reload(); return; }
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (alive) setState('failed');
    })();
    return () => { alive = false; };
  }, [error]);
  return (
    <main style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#e6ecff', background: '#0b1d15', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420 }}>
        <p style={{ fontSize: 22, fontWeight: 700 }}>{state === 'quota' ? 'Datele sunt temporar indisponibile.' : state === 'waiting' ? 'Verific conexiunea PRIMUL 11…' : 'Pagina nu a putut fi încărcată.'}</p>
        <p style={{ marginTop: 8, fontSize: 14, color: '#a3bcad' }}>{state === 'quota' ? 'Serviciul bazei de date a atins limita de utilizare. Reîncărcarea paginii nu elimină această limită.' : state === 'waiting' ? 'Verific disponibilitatea serviciului. Pagina se reîncarcă automat dacă revine conexiunea.' : 'Conexiunea nu a revenit. Poți reîncerca manual sau reveni la prezentarea aplicației.'}</p>
        <button onClick={() => (reset ? reset() : window.location.reload())} style={{ marginTop: 16, padding: '10px 18px', borderRadius: 12, background: '#22d3ee', color: '#0b1d15', fontWeight: 700, border: 0, cursor: 'pointer' }}>Reîncarcă acum</button>
        <p style={{marginTop:16,fontSize:14}}><a href="/" style={{color:'#a3bcad',textDecoration:'underline'}}>Prezentarea aplicației</a></p>
        {error.digest && <p style={{ marginTop: 12, fontSize: 11, color: '#64748b' }}>Cod: {error.digest}</p>}
      </div>
    </main>
  );
}
