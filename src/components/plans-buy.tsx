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
