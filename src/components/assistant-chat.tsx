'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion, Send, X } from 'lucide-react';

/**
 * "Întreabă PRIMUL 11" (owner request 03.11): a chat with the site assistant, which reads the app's own data
 * (tickets, agents, matches, Stake odds, statistics). The conversation lives in this tab only.
 */
type Msg = { role: 'user' | 'assistant'; content: string };
const SUGGESTIONS = ['Care agent nimerește cel mai des luna asta?', 'Ce bilete am câștigat?', 'Ce meciuri din Liga Campionilor au cote azi?', 'La ce cote ies biletele cel mai des?'];

/** Minimal, safe formatting of the answer: bold, bullet lists, line breaks. No HTML from the model. */
function Rich({ text }: { text: string }) {
  const lines = text.split('\n');
  return <div className="space-y-1.5">{lines.map((line, i) => {
    const bullet = /^\s*[-*•]\s+/.test(line);
    const body = line.replace(/^\s*[-*•]\s+/, '').split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>);
    if (!line.trim()) return <div key={i} className="h-1" />;
    return bullet ? <p key={i} className="flex gap-2"><span aria-hidden className="text-cyan">•</span><span>{body}</span></p> : <p key={i}>{body}</p>;
  })}</div>;
}

export function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const ask = async (q: string) => {
    const question = q.trim(); if (!question || busy) return;
    const next = [...msgs, { role: 'user' as const, content: question }];
    setMsgs(next); setText(''); setBusy(true); setError(null);
    const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }) }).catch(() => null);
    const body = await res?.json().catch(() => null) as { answer?: string; error?: string } | null;
    if (res?.ok && body?.answer) setMsgs([...next, { role: 'assistant', content: body.answer }]);
    else setError(body?.error ?? 'Asistentul nu a putut răspunde acum.');
    setBusy(false);
  };

  return <>
    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="assistant-panel" className="assistant-fab">
      <MessageCircleQuestion size={18} aria-hidden /><span>Întreabă PRIMUL 11</span>
    </button>
    {open && <section id="assistant-panel" className="assistant-panel" role="dialog" aria-label="Asistentul PRIMUL 11">
      <header className="assistant-head">
        <div><h2>Asistentul PRIMUL 11</h2><p>Răspunde din datele site-ului: bilete, agenți, meciuri, cote.</p></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Închide asistentul" className="assistant-x"><X size={16} aria-hidden /></button>
      </header>
      <div className="assistant-body">
        {!msgs.length && <div className="space-y-2"><p className="text-sm text-muted">Exemple:</p>{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => void ask(s)} className="assistant-suggest">{s}</button>)}</div>}
        {msgs.map((m, i) => <div key={i} className={m.role === 'user' ? 'assistant-msg assistant-msg-user' : 'assistant-msg'}>{m.role === 'user' ? m.content : <Rich text={m.content} />}</div>)}
        {busy && <div className="assistant-msg assistant-typing" aria-live="polite"><span /><span /><span /><em className="sr-only">Caut în date…</em></div>}
        {error && <p role="alert" className="text-sm text-rose">{error}</p>}
        <div ref={end} />
      </div>
      <form className="assistant-form" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <label htmlFor="assistant-input" className="sr-only">Întrebarea ta</label>
        <textarea id="assistant-input" ref={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text); } }} rows={1} maxLength={1500} placeholder="Întreabă orice despre bilete, agenți, meciuri…" />
        <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary px-3 py-2" aria-label="Trimite"><Send size={16} aria-hidden /></button>
      </form>
      <p className="assistant-note">Analizele nu garantează rezultate. 18+.</p>
    </section>}
  </>;
}
