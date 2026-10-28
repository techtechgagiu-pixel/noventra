'use client';
import { useState } from 'react';
import { Upload } from 'lucide-react';

type Status = { matches: number; usable: number; capturedAt: string | null; first: string | null; last: string | null; maxAgeHours: number };
type Result = { capturedAt: string; saved: number; matchedFixtures: number; stats: { matches: number; priced: number; mapped: Record<string, number>; skipped: Record<string, number> } };
const FAMILY: Record<string, string> = { '1X2': '1X2', TOTAL: 'total goluri', BTTS: 'ambele marchează', DC: 'șansă dublă' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Bucharest' }) : '—');

export function OddsImport({ initial }: { initial: Status }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const ageH = status.capturedAt ? (Date.now() - Date.parse(status.capturedAt)) / 3600_000 : null;

  async function upload(file: File) {
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/odds-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await file.text() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? `Import eșuat (${res.status}).`); return; }
      setResult(body as Result);
      const s = await fetch('/api/odds-import').then((r) => r.json()).catch(() => null);
      if (s && !s.error) setStatus(s);
    } catch { setError('Conexiune întreruptă. Încearcă din nou.'); } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <section className="card p-5" aria-label="Starea importului">
      <h2 className="font-display text-lg font-bold">Cotele folosite acum</h2>
      {status.matches ? <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div><dt className="text-xs text-muted">Export din</dt><dd className="font-semibold">{when(status.capturedAt)}</dd></div>
        <div><dt className="text-xs text-muted">Meciuri folosibile</dt><dd className="font-semibold">{status.usable} din {status.matches}</dd></div>
        <div><dt className="text-xs text-muted">Primul meci</dt><dd className="font-semibold">{when(status.first)}</dd></div>
        <div><dt className="text-xs text-muted">Valabile încă</dt><dd className={`font-semibold ${ageH !== null && ageH > status.maxAgeHours ? 'text-rose' : ageH !== null && ageH > status.maxAgeHours - 24 ? 'text-gold' : 'text-emerald'}`}>{ageH === null ? '—' : ageH > status.maxAgeHours ? 'expirate' : `${Math.max(0, Math.floor(status.maxAgeHours - ageH))} ore`}</dd></div>
      </dl> : <p className="mt-2 text-sm text-muted">Nu ai importat încă niciun fișier.</p>}
    </section>
    <section className="card p-5" aria-label="Import nou">
      <h2 className="font-display text-lg font-bold">Import nou</h2>
      <p className="mt-1 text-sm text-muted">Pe laptop, în folderul proiectului: <code className="text-text">python scripts/export_matches.py --group main</code>, apoi încarci <code className="text-text">data/football-full.json</code>. Cu <code>--group main</code> vin și total goluri, ambele marchează și șansă dublă, nu doar 1X2.</p>
      <label className={`btn btn-primary mt-4 inline-flex cursor-pointer px-5 py-3 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        <Upload size={16} aria-hidden /> {busy ? 'Se importă…' : 'Alege fișierul JSON'}
        <input type="file" accept="application/json,.json" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-rose">{error}</p>}
      {result && <div role="status" className="mt-4 space-y-1 text-sm">
        <p className="font-semibold text-emerald">Import reușit: {result.saved} meciuri viitoare cu cote, export din {when(result.capturedAt)}.</p>
        <p className="text-muted">{result.matchedFixtures} {result.matchedFixtures === 1 ? 'meci din site a primit' : 'meciuri din site au primit'} cotele acum; restul se potrivesc când apar în program.</p>
        <p className="text-muted">Piețe preluate: {Object.entries(result.stats.mapped).map(([k, n]) => `${FAMILY[k] ?? k} (${n})`).join(', ') || 'niciuna'}.</p>
        {Object.keys(result.stats.skipped).length > 0 && <p className="text-xs text-muted">Ignorate (nu le putem verifica la rezultat): {Object.entries(result.stats.skipped).slice(0, 8).map(([k, n]) => `${k} (${n})`).join(', ')}.</p>}
      </div>}
    </section>
  </div>;
}
