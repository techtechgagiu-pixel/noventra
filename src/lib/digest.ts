import { z } from 'zod';
import { many, one, query } from './db';
import { agentById } from './ai/agents';
import { activeAssignments } from './ai/assignments';
import { structuredCall } from './ai/router';
import { selectionImplies } from './stats/engine';

/**
 * "Rezumat de la Primul 11": ≤ 10 lines written once, from the agents' own recorded rationales.
 * Generated at ticket finalisation (part of the authorised job) or on an explicit click for older tickets.
 * Viewing a ticket never calls AI.
 */
export type Digest = { lines: string[]; source: 'ai' | 'data'; model: string | null; createdAt: string };

const DigestSchema = z.preprocess((v) => (Array.isArray(v) ? { lines: v } : v), z.object({ lines: z.array(z.string().min(3).max(220)).min(1).max(10) }));

const SYSTEM = `Ești redactorul aplicației PRIMUL 11. Scrii un rezumat de MAXIMUM 10 rânduri, în română, al unui bilet de pariuri, folosind EXCLUSIV motivările agenților primite în mesaj.
Format: un rând = o propoziție scurtă (max. 160 de caractere), fără liniuțe sau numerotare.
Rândul 1: concluzia generală (câte meciuri, cota totală, cât de prudent e biletul).
Apoi, pentru fiecare meci, 1–2 rânduri: de ce a fost ales (numește 1–2 agenți și argumentul lor) și ce risc a semnalat cineva.
Ultimul rând: principalul risc al biletului.
Nu inventa date, accidentări, știri sau cifre care nu apar în mesaj. Numele agenților sunt doar personaje; nu le atribui declarații reale. Nu promite câștig.
Răspunzi DOAR cu JSON: {"lines":["...", "..."]}.`;

type Row = { fixture_id: string; agent_id: string; decision: string; market_key: string | null; estimated_probability: string | null; payload: { rationale?: string; evidence?: string[]; failureReasons?: string[] } };

async function material(ticketId: string) {
  const t = await one<{ id: string; job_id: string; actual_odds: string | null; leg_count: number; target_odds: string; generation_status: string; summary: Record<string, unknown> }>(
    'SELECT id, job_id, actual_odds, leg_count, target_odds, generation_status, summary FROM tickets WHERE id=$1', [ticketId]);
  if (!t) return null;
  const legs = await many<{ fixture_id: string; market_key: string; market_label: string; odds: string; votes_for: number; model_probability: string | null; snapshot: { home: string; away: string } }>(
    'SELECT fixture_id, market_key, market_label, odds, votes_for, model_probability, snapshot FROM ticket_selections WHERE ticket_id=$1 ORDER BY position', [ticketId]);
  const rows = await many<Row>(
    `SELECT DISTINCT ON (fixture_id, agent_id) fixture_id, agent_id, decision, market_key, estimated_probability, payload
     FROM agent_predictions WHERE job_id=$1 AND fixture_id = ANY($2) ORDER BY fixture_id, agent_id, round DESC`, [t.job_id, legs.map((l) => l.fixture_id)]);
  const agents = Number((t.summary as { agents?: number }).agents ?? 11);
  const cut = (s: string | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  return {
    ticket: { totalOdds: t.actual_odds ? Number(t.actual_odds) : null, legs: t.leg_count, target: Number(t.target_odds), status: t.generation_status },
    fixtures: legs.map((l) => {
      const mine = rows.filter((r) => r.fixture_id === l.fixture_id);
      const backers = mine.filter((r) => r.decision === 'BET_CANDIDATE' && r.market_key && selectionImplies(r.market_key, l.market_key));
      const against = mine.filter((r) => !backers.includes(r));
      return {
        match: `${l.snapshot.home} – ${l.snapshot.away}`, pick: l.market_label, odds: Number(l.odds), votes: `${l.votes_for}/${agents}`,
        estimatedProbability: l.model_probability ? Number(l.model_probability) : null,
        backers: backers.slice(0, 4).map((r) => `${agentById(r.agent_id)?.name ?? r.agent_id}: ${cut(r.payload.rationale, 200)}${r.agent_id === 'hantu' && r.payload.evidence?.[0] ? ` (știre: ${cut(r.payload.evidence[0], 120)})` : ''}`),
        risks: [...backers, ...against].map((r) => (r.payload.failureReasons?.[0] ? `${agentById(r.agent_id)?.name ?? r.agent_id}: ${cut(r.payload.failureReasons[0], 140)}` : null)).filter(Boolean).slice(0, 2),
        refusedBy: against.length,
      };
    }),
  };
}

/** Deterministic fallback when no model is available: built only from the recorded data. */
function fromData(m: NonNullable<Awaited<ReturnType<typeof material>>>): string[] {
  const lines = [`${m.ticket.legs} meciuri, cotă totală ${m.ticket.totalOdds?.toFixed(2) ?? '—'} (țintă ${m.ticket.target}).`];
  for (const f of m.fixtures) {
    lines.push(`${f.match}: ${f.pick} @ ${f.odds.toFixed(2)}, susținut de ${f.votes} agenți${f.estimatedProbability ? ` (șansă estimată ${Math.round(f.estimatedProbability * 100)}%)` : ''}.`);
    if (f.risks[0]) lines.push(`Risc semnalat — ${f.risks[0]}`);
  }
  return lines.slice(0, 10);
}

export async function buildDigest(ticketId: string, jobId: string | null): Promise<Digest | null> {
  const m = await material(ticketId);
  if (!m || !m.fixtures.length) return null;
  const assignment = (await activeAssignments()).get('scout');
  let digest: Digest = { lines: fromData(m), source: 'data', model: null, createdAt: new Date().toISOString() };
  if (assignment) {
    try {
      const res = await structuredCall({
        primary: assignment.primary, fallback: assignment.fallback, schema: DigestSchema,
        input: { system: SYSTEM, user: JSON.stringify(m), temperature: 0.3, maxOutputTokens: 900 },
        log: { jobId, agentId: null, stage: 'DIGEST' },
      });
      digest = { lines: res.data.lines.map((l) => l.replace(/^[-•\d.\s]+/, '').trim()).filter(Boolean).slice(0, 10), source: 'ai', model: `${res.provider}/${res.model}`, createdAt: new Date().toISOString() };
    } catch { /* keep the data-only digest; never block the ticket */ }
  }
  await query(`UPDATE tickets SET summary = summary || jsonb_build_object('digest', $2::jsonb) WHERE id=$1`, [ticketId, JSON.stringify(digest)]);
  return digest;
}
