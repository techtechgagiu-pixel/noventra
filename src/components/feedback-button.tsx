'use client';
import { useEffect, useRef, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';

const KINDS = [
  { id: 'idee', label: '💡 Idee nouă' },
  { id: 'problemă', label: '🐞 Ceva nu merge' },
  { id: 'altceva', label: '💬 Altceva' },
] as const;

/** "Ajută-ne să îmbunătățim": floating button + small form; the message reaches the admins. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('idee');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) box.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const send = async () => {
    setState('sending'); setError('');
    const res = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, message, page: `${location.pathname}${location.search}` }) }).catch(() => null);
    if (res?.ok) { setState('sent'); setMessage(''); return; }
    const body = await res?.json().catch(() => null) as { error?: string } | null;
    setError(body?.error ?? 'Nu s-a putut trimite acum. Încearcă din nou.'); setState('error');
  };

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setState('idle'); }}
        aria-label="Ajută-ne să îmbunătățim" className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-gold/60 bg-ink/90 p-2.5 sm:px-4 text-sm font-semibold text-gold shadow-lg shadow-black/40 backdrop-blur transition hover:-translate-y-0.5 hover:bg-gold/15">
        <Lightbulb size={16} aria-hidden /> <span className="hidden sm:inline">Ajută-ne să îmbunătățim</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Ajută-ne să îmbunătățim" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="card w-full max-w-md space-y-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="font-display text-lg font-bold">Ajută-ne să îmbunătățim</h2><p className="text-xs text-muted">Ce ți-ar plăcea să apară nou în PRIMUL 11 sau ce nu merge cum trebuie? Citim tot.</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Închide" className="text-muted hover:text-text"><X size={18} /></button>
            </div>
            {state === 'sent' ? (
              <div className="space-y-3"><p className="rounded-lg border border-emerald/50 bg-emerald/10 p-3 text-sm text-emerald">Mulțumim! Mesajul a ajuns la noi.</p>
                <div className="flex gap-2"><button type="button" className="chip" onClick={() => setState('idle')}>Mai trimit una</button><button type="button" className="chip text-muted" onClick={() => setOpen(false)}>Închide</button></div></div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">{KINDS.map((k) => <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={`chip ${kind === k.id ? 'border-gold text-gold' : 'text-muted'}`}>{k.label}</button>)}</div>
                <textarea ref={box} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={5}
                  placeholder={kind === 'problemă' ? 'Ce s-a întâmplat și unde? (ex: în Meciuri nu se deschide…)' : 'Descrie ideea ta…'}
                  className="w-full rounded-lg border border-line bg-panel-2 p-3 text-sm outline-none focus:border-gold/70" />
                <div className="flex items-center justify-between gap-2 text-xs text-muted"><span>{message.length}/2000</span>
                  <button type="button" disabled={message.trim().length < 5 || state === 'sending'} onClick={() => void send()} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40">{state === 'sending' ? 'Se trimite…' : 'Trimite'}</button></div>
                {state === 'error' && <p className="text-xs text-rose">{error}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
