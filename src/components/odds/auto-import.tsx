'use client';
import { useState } from 'react';
import { KeyRound } from 'lucide-react';

type Status = { active: boolean; createdAt: string | null; lastUsedAt: string | null };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Bucharest' }) : '—');
const INSTALL = 'cd ~/Documents/ChatGPT/trading/stake-sports-api && python3 scripts/install_auto_import.py';

/** Owner: private key for the laptop's automatic import (02.11). Shown once; a new one revokes the old one. */
export function AutoImport({ initial }: { initial: Status }) {
  const [status, setStatus] = useState(initial);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const call = async (method: 'POST' | 'DELETE') => {
    setError(null);
    const res = await fetch('/api/import-token', { method }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) { setError(body?.error ?? 'Nu s-a putut salva.'); return; }
    setStatus(body); setToken(method === 'POST' ? body.token : null);
  };
  const copy = (v: string, what: string) => { void navigator.clipboard?.writeText(v).then(() => setCopied(what)).catch(() => {}); };
  return <section className="card p-5" aria-labelledby="auto-import-title">
    <h2 id="auto-import-title" className="font-display text-lg font-bold">Import automat de pe laptop</h2>
    <p className="mt-1 text-sm text-muted">Laptopul face singur exportul Stake (oferta de 3 ori pe zi, scorurile meciurilor doar-Stake la 30 de minute) și îl trimite aici cu o cheie privată. Merge cât timp laptopul e pornit și conectat.</p>
    <p className="mt-3 text-sm">{status.active ? <>Cheie activă din {when(status.createdAt)} · ultimul import automat: <strong>{when(status.lastUsedAt)}</strong></> : 'Nicio cheie activă.'}</p>
    {token ? <div role="status" className="mt-3 space-y-2 rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm">
      <p className="font-semibold text-gold">Cheia apare o singură dată. Copiaz-o acum.</p>
      <code className="block break-all rounded bg-ink px-2 py-1.5 text-xs">{token}</code>
      <button type="button" className="chip text-cyan" onClick={() => copy(token, 'cheia')}>Copiază cheia</button>
      <p className="text-muted">Apoi, în Terminal pe laptop, rulează comanda de mai jos și lipește cheia când ți-o cere:</p>
      <code className="block break-all rounded bg-ink px-2 py-1.5 text-xs">{INSTALL}</code>
      <button type="button" className="chip text-cyan" onClick={() => copy(INSTALL, 'comanda')}>Copiază comanda</button>
      {copied && <p className="text-xs text-emerald">Am copiat {copied}.</p>}
    </div> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={() => void call('POST')} className="btn btn-primary inline-flex px-4 py-2.5"><KeyRound size={15} aria-hidden /> {status.active ? 'Cheie nouă (o revocă pe cea veche)' : 'Generează cheia'}</button>
      {status.active && <button type="button" onClick={() => void call('DELETE')} className="chip text-muted">Oprește importul automat</button>}
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-rose">{error}</p>}
  </section>;
}
