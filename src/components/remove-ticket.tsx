'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

/** Two-step "Șterge din listă" for the creator of a ticket. */
export function RemoveTicket({ ticketId, compact = false }: { ticketId: string; compact?: boolean }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true); setError(null);
    const res = await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) { router.refresh(); return; }
    const body = await res?.json().catch(() => null) as { error?: string } | null;
    setError(body?.error ?? 'Nu s-a putut șterge acum.'); setBusy(false); setAsk(false);
  };
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${compact ? 'mt-2' : ''}`}>
      {!ask ? (
        <button type="button" onClick={() => setAsk(true)} className="inline-flex items-center gap-1.5 text-muted hover:text-rose"><Trash2 size={13} aria-hidden /> Șterge din listă</button>
      ) : (
        <>
          <span className="text-muted">Ștergi biletul din Bilete create? Statisticile agenților rămân neschimbate.</span>
          <button type="button" disabled={busy} onClick={() => void remove()} className="chip border-rose/60 text-rose disabled:opacity-50">{busy ? 'Se șterge…' : 'Da, șterge'}</button>
          <button type="button" onClick={() => setAsk(false)} className="chip text-muted">Renunță</button>
        </>
      )}
      {error && <span role="alert" className="text-rose">{error}</span>}
    </div>
  );
}
