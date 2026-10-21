'use client';
import { useState } from 'react';

export type Account = { id: string; name: string | null; email: string; picture: string | null; created_at: string; last_login_at: string | null; blocked_at: string | null; tickets: number };
const date = (v: string | null) => (v ? new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Bucharest' }).format(new Date(v)) : '—');

/** Google accounts that signed in, with a block switch (blocked accounts are signed out on their next request). */
export function AccountManager({ initial }: { initial: Account[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const set = async (id: string, blocked: boolean) => {
    setBusy(id); setError('');
    try {
      const r = await fetch('/api/admin/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, blocked }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Nu am putut salva.');
      setRows(d.accounts);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  if (!rows.length) return <p className="card p-5 text-sm text-muted">Încă nu s-a conectat nimeni cu Google.</p>;
  return (
    <div className="card divide-y divide-line">
      {error && <p className="p-3 text-sm text-rose" role="alert">{error}</p>}
      {rows.map((a) => (
        <div key={a.id} className={`flex items-center gap-3 p-3 ${a.blocked_at ? 'opacity-60' : ''}`}>
          {a.picture ? <img src={a.picture} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" /> : <span className="h-8 w-8 rounded-full bg-line" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{a.name ?? a.email} {a.blocked_at && <span className="ml-1 text-xs text-rose">blocat</span>}</p>
            <p className="truncate text-xs text-muted">{a.email} · {a.tickets} bilete · ultima intrare {date(a.last_login_at)}</p>
          </div>
          <button disabled={busy === a.id} onClick={() => set(a.id, !a.blocked_at)} className={`btn px-3 py-1.5 text-xs ${a.blocked_at ? 'btn-ghost' : 'btn-ghost text-rose'}`}>{a.blocked_at ? 'Deblochează' : 'Blochează'}</button>
        </div>
      ))}
    </div>
  );
}
