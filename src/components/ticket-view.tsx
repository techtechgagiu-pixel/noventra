'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, Check, ClipboardCopy, Download, History, ListChecks, PlayCircle, Sparkles } from 'lucide-react';
import { AGENT_META, OUTCOME_RO, fmtDateTime, odds } from '@/lib/format';
import { superbetPick } from '@/lib/superbet-format';

type Sel = { position: number; fixture_id: string; market_key: string; market_label: string; odds: number; bookmaker: string; quote_observed_at: string; votes_for: number; model_probability: number | null; risk: string; snapshot: { match: string; home: string; away: string; league: string; kickoff: string; source: string }; outcome: string; home_score: number | null; away_score: number | null };
export type TicketData = {
  id: string; title: string; subtitle: string; target: number; actualOdds: number | null; legCount: number; generationStatus: string; outcomeStatus: string; mixedBookmakers: boolean; createdAt: string;
  summary: { digest?: { lines: string[]; source: 'ai' | 'data'; model: string | null; createdAt: string }; agents?: number; threshold?: number; analyzed?: number; qualified?: number; eligible?: number; reason?: string; closest?: { totalOdds: number; legs: Array<{ match?: string; label?: string; odds: number }> } | null };
  selections: Sel[];
  decisions: Array<{ fixture_id: string; outcome: string; market_key: string | null; votes_for: number; votes: Array<{ agentId: string; decision: string; marketKey: string | null; model: string; provider: string }>; reason: string }>;
  fixtures: Array<{ fixtureId: string; fixture: { home: string; away: string; league: string; kickoff: string } }>;
  dossiers: Array<{ fixture_id: string; dossier: { home: { team: string; resultsVsPerformance: string; record: { w: number; d: number; l: number }; sample: number }; away: { team: string; resultsVsPerformance: string; record: { w: number; d: number; l: number }; sample: number }; modeMessage: string; missing: string[] }; narrative: { summary: string; keyObservations: string[] } | null; model: string | null }>;
};
const RISK_RO: Record<string, string> = { LOW: 'Risc scăzut', MEDIUM: 'Risc mediu', HIGH: 'Risc ridicat' };

export function ticketText(t: TicketData) {
  const lines = [`PRIMUL 11 — ${t.title}`, `Creat: ${fmtDateTime(t.createdAt)} (ora României)`, `Țintă: ${t.target} · Cotă reală: ${odds(t.actualOdds)} · ${t.legCount} meciuri`, ''];
  t.selections.forEach((s) => lines.push(`${s.position}. ${s.snapshot.match} (${s.snapshot.league}) — ${fmtDateTime(s.snapshot.kickoff)}`, `   ${s.market_label} @ ${odds(s.odds)} · ${s.bookmaker} · cotă observată ${fmtDateTime(s.quote_observed_at)} · ${s.votes_for}/${t.summary.agents ?? 6} voturi`));
  if (t.mixedBookmakers) lines.push('', 'Atenție: cotele provin de la bookmakeri diferiți; cota combinată poate să nu fie reproductibilă la un singur operator.');
  lines.push('', 'Cotele sunt cele observate la creare și se pot schimba. Analiza nu garantează rezultatul. 18+');
  return lines.join('\n');
}

/** Plain text to rebuild the ticket by hand in the Superbet app (search team → market → pick). */
export function superbetText(t: TicketData) {
  const lines = [`PRIMUL 11 — ${t.title} — pentru Superbet`, `${t.legCount} meciuri · cota la noi ${odds(t.actualOdds)}`, ''];
  t.selections.forEach((s) => {
    const p = superbetPick(s.market_key, s.snapshot.home, s.snapshot.away);
    lines.push(`${s.position}. ${s.snapshot.home} – ${s.snapshot.away} · ${fmtDateTime(s.snapshot.kickoff)}`,
      `   Caută: ${s.snapshot.home} → ${p.market} → ${p.pick}${p.note ? ` (${p.note})` : ''} · cota la noi ${odds(s.odds)}`);
  });
  lines.push('', 'Cotele Superbet pot fi diferite; verifică totalul înainte. Codul biletului îl generezi din Superbet. 18+');
  return lines.join('\n');
}

export function TicketView({ t, fresh }: { t: TicketData; fresh: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copiedSb, setCopiedSb] = useState(false);
  const [digest, setDigest] = useState(t.summary.digest ?? null);
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);
  const makeDigest = async () => {
    setDigestBusy(true); setDigestError(null);
    try {
      const r = await fetch(`/api/tickets/${t.id}/digest`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Rezumatul nu a putut fi generat.');
      setDigest(j.digest);
    } catch (e) { setDigestError((e as Error).message); } finally { setDigestBusy(false); }
  };
  const copySb = async () => { await navigator.clipboard.writeText(superbetText(t)); setCopiedSb(true); setTimeout(() => setCopiedSb(false), 2000); };
  const completed = t.generationStatus === 'COMPLETED';
  const copy = async () => { await navigator.clipboard.writeText(ticketText(t)); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const download = () => { const url = URL.createObjectURL(new Blob([ticketText(t)], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `primul11-${t.title.replace(/\W+/g, '-').toLowerCase()}-${t.createdAt.slice(0, 10)}.txt`; a.click(); URL.revokeObjectURL(url); };
  const names = Object.fromEntries(t.fixtures.map((f) => [f.fixtureId, `${f.fixture.home} – ${f.fixture.away}`]));
  return (
    <div className="space-y-6">
      {fresh && <p className="chip text-emerald"><Check size={13} aria-hidden /> Analiza s-a încheiat și a fost salvată automat.</p>}
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-line p-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan">{t.subtitle}</p>
            <h1 className="font-display text-3xl font-bold">{t.title}</h1>
            <p className="text-sm text-muted">Creat {fmtDateTime(t.createdAt)} · {t.summary.analyzed ?? 0} meciuri analizate</p>
          </div>
          <div className="flex gap-6 text-right">
            <div><p className="text-xs text-muted">Țintă</p><p className="font-display text-2xl font-bold tabular">{t.target}</p></div>
            <div><p className="text-xs text-muted">Cotă reală</p><p className="font-display text-4xl font-bold text-emerald tabular">{completed ? odds(t.actualOdds) : '—'}</p></div>
          </div>
        </div>
        {completed ? (
          <ol className="divide-y divide-line">
            {t.selections.map((s) => (
              <li key={s.position} className="grid gap-2 p-5 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p className="text-xs text-muted">{s.snapshot.league} · {fmtDateTime(s.snapshot.kickoff)}</p>
                  <p className="text-lg font-semibold">{s.snapshot.home} <span className="text-muted">vs</span> {s.snapshot.away}{s.home_score != null && s.outcome !== 'PENDING' && <span className="ml-2 text-sm text-muted">({s.home_score}–{s.away_score})</span>}</p>
                  <p className="mt-1 text-sm"><span className="font-semibold text-cyan">{s.market_label}</span> <span className="text-muted">· {s.market_key}</span></p>
                  {(() => { const p = superbetPick(s.market_key, s.snapshot.home, s.snapshot.away); return <p className="text-xs text-muted">Pe Superbet: <span className="text-text">{p.market} → {p.pick}</span>{p.note ? ` (${p.note})` : ''}</p>; })()}
                  <p className="mt-1 flex flex-wrap gap-2 text-xs text-muted"><span className="chip">{s.votes_for}/{t.summary.agents ?? 6} voturi</span><span className="chip">{RISK_RO[s.risk]}</span><span className="chip">{s.bookmaker} · observat {fmtDateTime(s.quote_observed_at)}</span>{s.model_probability != null && <span className="chip">p estimat {Math.round(s.model_probability * 100)}%</span>}</p>
                </div>
                <div className="text-right"><p className="font-display text-3xl font-bold tabular">{odds(s.odds)}</p>{s.outcome !== 'PENDING' && <p className={`text-xs font-bold ${s.outcome === 'WON' ? 'text-emerald' : s.outcome === 'LOST' ? 'text-rose' : 'text-muted'}`}>{s.outcome === 'WON' ? 'Câștigat' : s.outcome === 'LOST' ? 'Pierdut' : 'Anulat'}</p>}</div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="p-6">
            <p className="flex items-start gap-2 text-lg"><AlertTriangle className="mt-1 shrink-0 text-gold" size={20} aria-hidden />{t.generationStatus === 'NO_BET' ? 'NO BET — agenții nu au găsit selecții suficient de bine fundamentate.' : 'Biletul nu a putut fi completat cu selecții suficient de bine fundamentate.'}</p>
            <p className="mt-2 text-muted">{t.summary.reason}</p>
            <p className="mt-2 text-sm text-muted">Meciuri eligibile: {t.summary.eligible ?? '—'} · analizate: {t.summary.analyzed ?? 0} · candidați calificați: {t.summary.qualified ?? 0}</p>
            {t.summary.closest && t.summary.closest.legs.length > 0 && (
              <div className="card-soft mt-4 p-4 text-sm">
                <p className="font-semibold">Cea mai apropiată combinație (NU este un bilet finalizat): cota {odds(t.summary.closest.totalOdds)}</p>
                <ul className="mt-2 space-y-1 text-muted">{t.summary.closest.legs.map((l, i) => <li key={i}>{l.match} — {l.label} @ {odds(l.odds)}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        {completed && t.mixedBookmakers && <p className="border-t border-line p-4 text-xs text-gold">Cotele provin de la bookmakeri diferiți; cota combinată poate să nu fie reproductibilă la un singur operator.</p>}
        {completed && <p className="border-t border-line p-4 text-xs text-muted">Stare rezultat: <strong className="text-text">{OUTCOME_RO[t.outcomeStatus]}</strong>. Cotele sunt cele observate la creare (sursa ESPN, furnizor {t.selections[0]?.bookmaker}); pot fi diferite acum.</p>}
      </div>

      {completed && (
        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold"><Sparkles size={18} className="text-cyan" aria-hidden /> Rezumat de la Primul 11</h2>
          {digest ? (
            <>
              <ul className="space-y-1.5 text-sm leading-relaxed">{digest.lines.map((l, i) => <li key={i} className={i === 0 ? 'font-semibold' : ''}>{l}</li>)}</ul>
              <p className="mt-3 text-xs text-muted">{digest.source === 'ai' ? `Scris din motivările agenților (${digest.model})` : 'Compus automat din voturi și riscurile semnalate'} · {fmtDateTime(digest.createdAt)}</p>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>Biletul a fost creat înainte de rezumate.</span>
              <button onClick={makeDigest} disabled={digestBusy} className="btn btn-ghost px-4 py-2">{digestBusy ? 'Se scrie…' : 'GENEREAZĂ REZUMATUL'}</button>
              {digestError && <span className="text-rose">{digestError}</span>}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {completed && <button onClick={copy} className="btn btn-primary px-5 py-3">{copied ? <Check size={16} /> : <ClipboardCopy size={16} />} {copied ? 'COPIAT' : 'COPIAZĂ BILETUL'}</button>}
        {completed && <button onClick={copySb} className="btn btn-ghost px-5 py-3">{copiedSb ? <Check size={16} /> : <ClipboardCopy size={16} />} {copiedSb ? 'COPIAT' : 'COPIAZĂ PENTRU SUPERBET'}</button>}
        {completed && <button onClick={download} className="btn btn-ghost px-5 py-3"><Download size={16} /> DESCARCĂ TXT</button>}
        <a href="#analiza" className="btn btn-ghost px-5 py-3"><ListChecks size={16} /> VEZI ANALIZA</a>
        <Link href={`/?tab=analiza&replay=${t.id}`} className="btn btn-gold px-5 py-3"><PlayCircle size={16} /> VEZI CUM A FOST CREAT</Link>
        <Link href="/?tab=istoric" className="btn btn-ghost px-5 py-3"><History size={16} /> BILETELE MELE</Link>
      </div>

      <section id="analiza" className="space-y-3">
        <h2 className="font-display text-2xl font-bold">Analiza meciurilor</h2>
        {t.decisions.length === 0 && <p className="text-muted">Niciun meci nu a ajuns la vot.</p>}
        {t.decisions.map((d) => {
          const dossier = t.dossiers.find((x) => x.fixture_id === d.fixture_id);
          return (
            <details key={d.fixture_id} className="card p-4">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{names[d.fixture_id] ?? d.fixture_id}</span>
                <span className={`chip ${d.outcome === 'QUALIFIED' ? 'text-emerald' : 'text-muted'}`}>{d.outcome === 'QUALIFIED' ? `Calificat ${d.votes_for}/${t.summary.agents ?? 6}` : d.outcome === 'NO_BET' ? 'NO BET' : d.outcome === 'REJECTED' ? 'Respins la validare' : 'Fără consens'}</span>
              </summary>
              <p className="mt-3 text-sm">{d.reason}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {d.votes.map((v) => <div key={v.agentId} className="card-soft p-2 text-xs"><p className="font-bold" style={{ color: AGENT_META[v.agentId]?.accent }}>{AGENT_META[v.agentId]?.name}</p><p>{v.decision === 'BET_CANDIDATE' ? v.marketKey : 'NO BET'}</p><p className="truncate text-muted" title={v.model}>{v.model}</p></div>)}
              </div>
              {dossier && (
                <div className="mt-3 text-sm">
                  <p className="font-semibold text-cyan">SCOUT</p>
                  <p className="text-xs text-muted">{dossier.dossier.modeMessage}</p>
                  {dossier.narrative?.summary && <p className="mt-1">{dossier.narrative.summary}</p>}
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted"><li>{dossier.dossier.home.team}: {dossier.dossier.home.record.w}V-{dossier.dossier.home.record.d}E-{dossier.dossier.home.record.l}Î în {dossier.dossier.home.sample} meciuri. {dossier.dossier.home.resultsVsPerformance}</li><li>{dossier.dossier.away.team}: {dossier.dossier.away.record.w}V-{dossier.dossier.away.record.d}E-{dossier.dossier.away.record.l}Î în {dossier.dossier.away.sample} meciuri. {dossier.dossier.away.resultsVsPerformance}</li></ul>
                </div>
              )}
            </details>
          );
        })}
      </section>
    </div>
  );
}
