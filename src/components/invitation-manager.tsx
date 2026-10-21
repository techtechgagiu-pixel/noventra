'use client';
import { useState } from 'react';
export type Invitation = { id: string; label: string; created_at: string; expires_at: string; revoked_at: string | null; last_used_at: string | null; use_count: number };
type Fresh = { id: string; code: string; label: string; expiresAt: string };
const date = (value: string) => new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Bucharest' }).format(new Date(value));
export function InvitationManager({ initial }: { initial: Invitation[] }) {
  const [rows, setRows] = useState(initial), [fresh, setFresh] = useState<Fresh[]>([]);
  const [count, setCount] = useState(5), [label, setLabel] = useState('Vizitator');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const refresh = async () => {
    const r = await fetch('/api/admin/invitations', { cache: 'no-store' });
    if (!r.ok) throw new Error('Lista nu a putut fi încărcată.');
    setRows((await r.json()).invitations);
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setFresh([]);
    try {
      const r = await fetch('/api/admin/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count, label }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Invitațiile nu au putut fi create.');
      setFresh(data.invitations); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/admin/invitations/${id}/revoke`, { method: 'POST' });
      if (!r.ok) throw new Error('Invitația nu a putut fi revocată.');
      setFresh((v) => v.filter((f) => f.id !== id)); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="space-y-6">
    <form onSubmit={create} className="card flex flex-wrap items-end gap-4 p-5">
      <label className="flex min-w-40 flex-1 flex-col gap-2 text-sm">Etichetă<input className="rounded-lg border border-line bg-ink p-2" value={label} maxLength={80} required onChange={(e) => setLabel(e.target.value)} /></label>
      <label className="flex flex-col gap-2 text-sm">Număr de coduri<input type="number" min={1} max={20} value={count} className="w-24 rounded-lg border border-line bg-ink p-2" onChange={(e) => setCount(Number(e.target.value))} /></label>
      <button disabled={busy} className="rounded-lg bg-cyan px-4 py-2 font-bold text-ink disabled:opacity-50">{busy ? 'Se procesează…' : 'GENEREAZĂ CODURI'}</button>
    </form>
    {error && <p role="alert" className="text-sm text-gold">{error}</p>}
    {fresh.length > 0 && <section aria-label="Coduri noi" className="card space-y-4 border-cyan/40 p-5"><h2 className="font-bold text-cyan">Salvează codurile acum</h2><p className="text-sm text-muted">Sunt afișate o singură dată. În baza de date se păstrează doar amprentele lor.</p>{fresh.map((f) => <div key={f.id} className="space-y-1"><p className="text-sm">{f.label} · până la {date(f.expiresAt)}</p><code className="block break-all rounded-lg bg-ink p-3 text-sm text-cyan">{f.code}</code></div>)}</section>}
    <section aria-label="Invitații emise" className="space-y-3"><h2 className="font-bold">Invitații emise</h2>{!rows.length && <p className="text-sm text-muted">Nu ai emis invitații încă.</p>}{rows.map((r) => {
      const active = !r.revoked_at && Date.parse(r.expires_at) > Date.now();
      return <article key={r.id} className="card flex items-center justify-between gap-4 p-4"><div><h3 className="font-semibold">{r.label}</h3><p className="text-xs text-muted">{r.revoked_at ? 'Revocat' : active ? 'Activ' : 'Expirat'} · expiră {date(r.expires_at)} · {r.use_count} intrări</p></div>{active && <button disabled={busy} onClick={() => revoke(r.id)} className="rounded-lg border border-line px-3 py-2 text-sm text-gold">Revocă</button>}</article>;
    })}</section>
  </div>;
}
