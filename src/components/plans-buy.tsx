'use client';

import { useState } from 'react';

export function BuyButton({ plan, label, signedIn, featured }: { plan: string; label: string; signedIn: boolean; featured?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function buy() {
    if (!signedIn) { window.location.href = '/login?next=custom'; return; }
    setBusy(true); setError('');
    const res = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) }).catch(() => null);
    const data = await res?.json().catch(() => ({})) as { url?: string; error?: string } | undefined;
    if (data?.url) { window.location.href = data.url; return; }
    setError(data?.error ?? 'Nu am putut porni plata.'); setBusy(false);
  }
  return <div><button type="button" onClick={buy} disabled={busy} className={`btn w-full px-5 py-3 disabled:opacity-60 ${featured ? 'btn-primary' : 'btn-ghost'}`}>{busy ? 'Te duc la plată…' : label}</button>{error && <p role="alert" className="mt-2 text-sm text-gold">{error}</p>}</div>;
}

const EUR = (cents: number) => `€${(cents / 100).toFixed(2).replace('.', ',')}`;

/** Extra credits at the single-credit price, for someone who ran out between plans. */
export function ExtraCredits({ signedIn, packs, minCredits, maxCredits, centsPerCredit }: { signedIn: boolean; packs: number[]; minCredits: number; maxCredits: number; centsPerCredit: number }) {
  const [n, setN] = useState(packs[1] ?? packs[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = Number.isInteger(n) && n >= minCredits && n <= maxCredits;
  async function buy() {
    if (!signedIn) { window.location.href = '/login?next=custom'; return; }
    if (!valid) return;
    setBusy(true); setError('');
    const res = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extra: n }) }).catch(() => null);
    const data = await res?.json().catch(() => ({})) as { url?: string; error?: string } | undefined;
    if (data?.url) { window.location.href = data.url; return; }
    setError(data?.error ?? 'Nu am putut porni plata.'); setBusy(false);
  }
  return <div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Număr de credite extra">
      {packs.map((p) => <button key={p} type="button" aria-pressed={n === p} onClick={() => setN(p)} className={`btn px-4 py-2 ${n === p ? 'btn-primary' : 'btn-ghost'}`}>{p}</button>)}
      <label className="flex items-center gap-2 text-sm text-muted">sau
        <input type="number" inputMode="numeric" min={minCredits} max={maxCredits} step={1} value={Number.isNaN(n) ? '' : n} onChange={(e) => setN(e.target.value === '' ? NaN : Number(e.target.value))} className="w-20 rounded-xl border border-line bg-ink px-3 py-2 tabular outline-none focus:border-cyan" aria-label="Alt număr de credite" />
      </label>
    </div>
    <button type="button" onClick={buy} disabled={busy || !valid} className="btn btn-primary mt-4 px-5 py-3 disabled:opacity-60">{busy ? 'Te duc la plată…' : valid ? `Încarcă ${n} ${n === 1 ? 'credit' : 'credite'} · ${EUR(n * centsPerCredit)}` : `Alege între ${minCredits} și ${maxCredits} credite`}</button>
    {error && <p role="alert" className="mt-2 text-sm text-gold">{error}</p>}
  </div>;
}
