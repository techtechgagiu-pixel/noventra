'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, Check, ClipboardCopy, Download, History, ListChecks, PlayCircle, Sparkles } from 'lucide-react';
import { AGENT_META, OUTCOME_RO, fmtDateTime, odds } from '@/lib/format';
import { superbetPick } from '@/lib/superbet-format';
import { FinishIncompleteTicket } from './finish-incomplete-ticket';
import { CreatorBadge } from '@/components/ticket-archive';
import type { IncompletePick } from '@/lib/incomplete-ticket-picks';
import type { Creator } from '@/lib/views';

type Sel = { position: number; fixture_id: string; market_key: string; market_label: string; odds: number; bookmaker: string; quote_observed_at: string; votes_for: number; model_probability: number | null; risk: string; snapshot: { match: string; home: string; away: string; league: string; kickoff: string; source: string }; outcome: string; home_score: number | null; away_score: number | null };
export type TicketData = {
  id: string; title: string; subtitle: string; target: number; actualOdds: number | null; legCount: number; generationStatus: string; outcomeStatus: string; mixedBookmakers: boolean; createdAt: string; creator?: Creator; mine?: boolean;
  summary: { completion?: { requestedAt: string; attempt: number }; review?: { legs: Array<{ fixtureId: string; match: string; label: string; odds: number; verdict: 'SOLID' | 'RISCANT' | 'SLAB' | 'NEANALIZAT'; supporters: string[]; responded: number; engineProbability: number | null; suggestion: { label: string; odds: number; supporters: number } | null; note: string }>; overall: string; advice: string[]; chance: number | null; model: string | null; userAdvice: string | null; solid: number; risky: number; weak: number }; digest?: { lines: string[]; source: 'ai' | 'data'; model: string | null; createdAt: string }; agents?: number; threshold?: number; analyzed?: number; qualified?: number; eligible?: number; reason?: string; closest?: { totalOdds: number; legs: Array<{ match?: string; label?: string; odds: number }> } | null };
  selections: Sel[]; partialSelections?: IncompletePick[];
  predictions?: Array<{ id: string; fixture_id: string; agent_id: string; round: number; model_id: string; decision: string; market_key: string | null; outcome: string | null; current_in_stats: boolean; payload: { marketLabel?: string | null } }>;
  decisions: Array<{ fixture_id: string; outcome: string; market_key: string | null; votes_for: number; votes: Array<{ agentId: string; decision: string; marketKey: string | null; model: string; provider: string }>; reason: string }>;
  fixtures: Array<{ fixtureId: string; fixture: { home: string; away: string; league: string; kickoff: string } }>;
  dossiers: Array<{ fixture_id: string; created_at?: string; dossier: { home: { team: string; resultsVsPerformance: string; record: { w: number; d: number; l: number }; sample: number }; away: { team: string; resultsVsPerformance: string; record: { w: number; d: number; l: number }; sample: number }; modeMessage: string; missing: string[] }; narrative: { summary: string; keyObservations: string[] } | null; model: string | null }>;
};
const VERDICT: Record<string, { t: string; c: string }> = { SOLID: { t: '✓ SOLID', c: 'text-emerald' }, RISCANT: { t: '⚠ RISCANT', c: 'text-gold' }, SLAB: { t: '✗ SLAB', c: 'text-rose' }, NEANALIZAT: { t: '— NEANALIZAT', c: 'text-muted' } };
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
  const partial = t.generationStatus === 'INCOMPLETE' ? t.partialSelections ?? [] : [];
  const shown = completed ? t.selections : partial;
  const copy = async () => { await navigator.clipboard.writeText(ticketText(t)); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const download = () => { const url = URL.createObjectURL(new Blob([ticketText(t)], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `primul11-${t.title.replace(/\W+/g, '-').toLowerCase()}-${t.createdAt.slice(0, 10)}.txt`; a.click(); URL.revokeObjectURL(url); };
  const names = Object.fromEntries(t.fixtures.map((f) => [f.fixtureId, `${f.fixture.home} – ${f.fixture.away}`]));
  return (
    <div className="space-y-6">
      {t.generationStatus === 'INCOMPLETE' && t.mine !== false && !t.summary.review && <FinishIncompleteTicket ticketId={t.id} />}
      {fresh && <p className="chip text-emerald"><Check size={13} aria-hidden /> Analiza s-a încheiat și a fost salvată automat.</p>}
      <div className={`card overflow-hidden ${t.outcomeStatus === 'WON' || t.outcomeStatus === 'PARTIAL_VOID' ? 'border-emerald ring-2 ring-emerald/40' : t.outcomeStatus === 'LOST' ? 'border-rose ring-2 ring-rose/40' : ''}`}>
        {completed && (t.outcomeStatus === 'WON' || t.outcomeStatus === 'LOST' || t.outcomeStatus === 'PARTIAL_VOID') && (
          <p className={`px-6 py-3 font-display text-lg font-bold ${t.outcomeStatus === 'LOST' ? 'bg-rose/20 text-rose' : 'bg-emerald/20 text-emerald'}`}>{t.outcomeStatus === 'LOST' ? '✗ BILET PIERDUT' : '✓ BILET CÂȘTIGAT'} · {t.selections.filter((x) => x.outcome === 'WON').length}/{t.selections.length} meciuri au intrat</p>
        )}
        <div className="flex flex-col gap-4 border-b border-line p-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan">{t.subtitle}</p>
            <h1 className="font-display text-3xl font-bold">{t.title}</h1>
            <p className="text-sm text-muted">Creat {fmtDateTime(t.createdAt)} · {t.summary.analyzed ?? 0} meciuri analizate</p>
            <div className="mt-1"><CreatorBadge c={t.creator} /></div>
            {t.summary.completion && <p className="mt-1 text-xs text-muted">Finalizare cerută {fmtDateTime(t.summary.completion.requestedAt)} · încercarea {t.summary.completion.attempt}</p>}
          </div>
          <div className="flex gap-6 text-right">
            {!t.summary.review && <div><p className="text-xs text-muted">Țintă</p><p className="font-display text-2xl font-bold tabular">{t.target}</p></div>}
            <div><p className="text-xs text-muted">{t.summary.review ? 'Cota biletului tău' : 'Cotă reală'}</p><p className="font-display text-4xl font-bold text-emerald tabular">{completed ? odds(t.actualOdds) : '—'}</p></div>
          </div>
        </div>
        {completed || partial.length > 0 ? (
          <>
          {!completed && <div className="border-b border-line p-5"><p className="flex items-center gap-2 font-semibold text-gold"><AlertTriangle size={18} aria-hidden />Bilet incomplet</p><p className="mt-2 text-sm text-muted">{t.summary.reason || 'Ținta biletului nu a fost atinsă.'}</p>{t.summary.closest && t.summary.closest.legs.length > 0 && <details className="mt-3 text-sm text-muted"><summary className="cursor-pointer">Cea mai apropiată combinație: cotă {odds(t.summary.closest.totalOdds)} din {t.summary.closest.legs.length} meciuri</summary><ul className="mt-2 space-y-1">{t.summary.closest.legs.map((l,i) => <li key={i}>{l.match} — {l.label} @ {odds(l.odds)}</li>)}</ul></details>}<h2 className="mt-4 font-display text-lg font-bold">Meciuri acceptate de agenți ({partial.length})</h2><p className="mt-1 text-xs text-muted">Selecțiile de mai jos au trecut validarea, dar nu formează un bilet finalizat. Rezultatele se actualizează după confirmarea scorurilor.</p></div>}
          <ol aria-label={completed ? 'Selecțiile biletului' : 'Selecții acceptate ale biletului incomplet'} className="divide-y divide-line">
            {shown.map((s) => (
              <li key={s.position} className={`grid gap-2 border-l-4 p-5 md:grid-cols-[1fr_auto] md:items-center ${s.outcome === 'WON' ? 'border-l-emerald bg-emerald/10' : s.outcome === 'LOST' ? 'border-l-rose bg-rose/10' : 'border-l-transparent'}`}>
                <div>
                  <p className="text-xs text-muted">{s.snapshot.league} · {fmtDateTime(s.snapshot.kickoff)}</p>
                  <p className="text-lg font-semibold">{s.snapshot.home} <span className="text-muted">vs</span> {s.snapshot.away}{s.home_score != null && s.outcome !== 'PENDING' && <span className="ml-2 text-sm text-muted">({s.home_score}–{s.away_score})</span>}</p>
                  <p className="mt-1 text-sm"><span className="font-semibold text-cyan">{s.market_label}</span> <span className="text-muted">· {s.market_key}</span></p>
                  {(() => { const p = superbetPick(s.market_key, s.snapshot.home, s.snapshot.away); return <p className="text-xs text-muted">Pe Superbet: <span className="text-text">{p.market} → {p.pick}</span>{p.note ? ` (${p.note})` : ''}</p>; })()}
                  {(() => { const rv = t.summary.review?.legs.find((l) => l.fixtureId === s.fixture_id); return rv ? <p className="mt-1 text-xs"><span className={`chip mr-2 font-bold ${VERDICT[rv.verdict].c}`}>{VERDICT[rv.verdict].t}</span><span className="text-muted">{rv.note}</span></p> : null; })()}
                  <p className="mt-1 flex flex-wrap gap-2 text-xs text-muted"><span className="chip">{s.votes_for}/{t.summary.agents ?? 6} {t.summary.review ? 'agenți susțin' : 'voturi'}</span>{RISK_RO[s.risk] && <span className="chip">{RISK_RO[s.risk]}</span>}<span className="chip">{s.bookmaker} · observat {fmtDateTime(s.quote_observed_at)}</span>{s.model_probability != null && <span className="chip">p estimat {Math.round(s.model_probability * 100)}%</span>}</p>
                </div>
                <div className="text-right"><p className="font-display text-3xl font-bold tabular">{odds(s.odds)}</p><p className={`text-xs font-bold ${s.outcome === 'WON' ? 'text-emerald' : s.outcome === 'LOST' ? 'text-rose' : 'text-muted'}`}>{s.outcome === 'WON' ? '✓ A intrat' : s.outcome === 'LOST' ? '✗ Nu a intrat' : s.outcome === 'VOID' ? 'Anulat' : 'În așteptare'}</p></div>
              </li>
            ))}
          </ol>
          </>
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

      {t.summary.review && (
        <div className="card border-gold/40 p-5">
          <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold"><Sparkles size={18} className="text-gold" aria-hidden /> Verdictul echipei · sfaturile creierului</h2>
          <p className="mb-3 text-xs text-muted">{t.summary.review.solid} solide · {t.summary.review.risky} riscante · {t.summary.review.weak} slabe{t.summary.review.chance !== null ? ` · șansă estimată ca toate să iasă ≈ ${Math.round(t.summary.review.chance * 100)}%` : ''}</p>
          <p className="text-sm leading-relaxed">{t.summary.review.overall}</p>
          {t.summary.review.advice.length > 0 && <ul className="mt-3 space-y-1.5 text-sm">{t.summary.review.advice.map((a, i) => <li key={i} className="flex gap-2"><span className="text-gold">→</span><span>{a}</span></li>)}</ul>}
          {t.summary.review.userAdvice && <p className="mt-4 rounded-xl border border-line bg-ink/40 p-3 text-xs text-muted">Sfaturile tale pentru tacticieni: <span className="text-text">„{t.summary.review.userAdvice}”</span></p>}
          <p className="mt-3 text-xs text-muted">GPT-6 Luna Pro (creierul){t.summary.review.model ? ` · ${t.summary.review.model}` : ' · compus din voturile echipei'}. Analiza nu garantează rezultatul.</p>
        </div>
      )}
      {completed && !t.summary.review && (
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
              <button onClick={makeDigest} disabled={digestBusy || t.mine === false} title={t.mine === false ? 'Doar cel care a creat biletul poate genera rezumatul' : undefined} className="btn btn-ghost px-4 py-2">{digestBusy ? 'Se scrie…' : 'GENEREAZĂ REZUMATUL'}</button>
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
        <h2 className="font-display text-2xl font-bold">Analiza meciurilor</h2><p className="text-xs text-muted">Pozițiile finale din această analiză, cu rezultatul propriu al agentului. Statisticile comunității folosesc ultima analiză a fiecărui meci; o analiză mai veche rămâne păstrată aici.</p>
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
              {(() => {
                const latest = new Map<string, NonNullable<TicketData['predictions']>[number]>();
                for (const p of t.predictions ?? []) if (p.fixture_id === d.fixture_id && (!latest.has(p.agent_id) || latest.get(p.agent_id)!.round < p.round)) latest.set(p.agent_id,p);
                const cards = latest.size ? [...latest.values()].map((p) => ({ agent: p.agent_id, pick: p.decision === 'NO_BET' ? 'NO BET' : p.payload.marketLabel ?? p.market_key, model: p.model_id, outcome: p.decision === 'BET_CANDIDATE' ? p.outcome ?? 'PENDING' : null, current: p.current_in_stats, counted: d.votes.some((v) => v.agentId === p.agent_id), round: p.round })) : d.votes.map((v) => ({ agent: v.agentId, pick: v.decision === 'BET_CANDIDATE' ? v.marketKey : 'NO BET', model: v.model, outcome: null, current: null, counted: true, round: null }));
                return <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{cards.map((v) => <div key={v.agent} className="card-soft space-y-1 p-2 text-xs"><p className="font-bold" style={{ color: AGENT_META[v.agent]?.accent }}>{AGENT_META[v.agent]?.name ?? v.agent}</p><p>{v.pick}</p>{v.outcome && <p className={v.outcome === 'WON' ? 'text-emerald' : v.outcome === 'LOST' ? 'text-rose' : 'text-muted'}>{v.outcome === 'WON' ? '✓ Verde' : v.outcome === 'LOST' ? '✗ Roșu' : v.outcome === 'VOID' ? 'Anulat' : 'În așteptare'}</p>}{!v.counted && <p className="text-muted">Nenumărat la votul echipei</p>}{v.current === false && <p className="text-muted">Există o poziție mai nouă în statistici</p>}{v.round !== null && <p className="text-muted">Runda {v.round + 1}</p>}<p className="truncate text-muted" title={v.model}>{v.model}</p></div>)}</div>;
              })()}

              {dossier && (
                <div className="mt-3 text-sm">
                  <p className="font-semibold text-cyan">SCOUT — context salvat la analiză</p>
                  <p className="text-xs text-muted">Date și sinteză AI salvate la {fmtDateTime(dossier.created_at ?? t.createdAt)}. Textul descrie contextul disponibil atunci; rezultatele sunt calculate separat din scorurile confirmate.</p>
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
