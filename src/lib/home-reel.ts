import { cleanPayload } from './agent-names';
import { many, one } from './db';
import { slotInfo } from './slots';
import type { NexusEvent } from './nexus-state';

/**
 * The home page "film": a real, finished analysis replayed on the map. We keep the fixture pool, one batch that
 * actually went to debate (or the first batch) and the outcome, so the loop lasts about a minute.
 */
export async function homeReel(userId: string) {
  const job = await one<{ id: string; slot: string; target_odds: string; required_legs: number | null; finished_at: Date }>(
    `SELECT j.id, j.slot, j.target_odds, j.required_legs, j.finished_at FROM ticket_generation_jobs j
     WHERE j.user_id=$1 AND j.status='COMPLETED'
       AND EXISTS (SELECT 1 FROM analysis_events e WHERE e.job_id=j.id AND e.type='OBJECTION_RECORDED')
     ORDER BY j.finished_at DESC NULLS LAST LIMIT 1`, [userId])
    ?? await one<{ id: string; slot: string; target_odds: string; required_legs: number | null; finished_at: Date }>(
      `SELECT id, slot, target_odds, required_legs, finished_at FROM ticket_generation_jobs WHERE user_id=$1 AND status='COMPLETED' ORDER BY finished_at DESC NULLS LAST LIMIT 1`, [userId]);
  if (!job) return null;
  const rows = await many<{ seq: number; type: string; stage: string; fixture_id: string | null; agent_id: string | null; payload: Record<string, unknown>; created_at: Date }>(
    'SELECT seq, type, stage, fixture_id, agent_id, payload, created_at FROM analysis_events WHERE job_id=$1 ORDER BY seq LIMIT 4000', [job.id]);
  const events: NexusEvent[] = rows.map((r) => ({ seq: r.seq, type: r.type, stage: r.stage, fixtureId: r.fixture_id, agentId: r.agent_id, payload: cleanPayload(r.payload) as Record<string, any>, createdAt: r.created_at.toISOString() }));
  const batchStarts = events.filter((e) => e.type === 'BATCH_STARTED');
  const debate = events.find((e) => e.type === 'DEBATE_STARTED');
  const chosen = [...batchStarts].reverse().find((b) => !debate || b.seq < debate.seq) ?? batchStarts[0];
  const next = chosen ? batchStarts.find((b) => b.seq > chosen.seq) : undefined;
  const keep = new Set(['JOB_CREATED', 'TARGET_SELECTED', 'CANDIDATE_SELECTED', 'SELECTION_ACCEPTED', 'LEG_REVIEWED', 'OPTIMIZATION_COMPLETED', 'REVIEW_ADVICE', 'TICKET_FINALIZED']);
  const reel = events.filter((e) => keep.has(e.type) || (chosen && e.seq >= chosen.seq && (!next || e.seq < next.seq)));
  const info = slotInfo(job.slot, Number(job.target_odds), job.required_legs);
  return { jobId: job.id, title: info.title, finishedAt: job.finished_at?.toISOString() ?? null, events: reel };
}

/** Real totals for the home page (never estimated). */
export async function homeStats(userId: string) {
  const t = await one<{ tickets: string; won: string; lost: string; legs_won: string; legs_lost: string }>(
    `SELECT (SELECT count(*) FROM tickets WHERE user_id=$1 AND generation_status='COMPLETED') AS tickets,
            (SELECT count(*) FROM tickets WHERE user_id=$1 AND outcome_status IN ('WON','PARTIAL_VOID')) AS won,
            (SELECT count(*) FROM tickets WHERE user_id=$1 AND outcome_status='LOST') AS lost,
            (SELECT count(*) FROM ticket_selections s JOIN tickets t ON t.id=s.ticket_id WHERE t.user_id=$1 AND s.outcome='WON') AS legs_won,
            (SELECT count(*) FROM ticket_selections s JOIN tickets t ON t.id=s.ticket_id WHERE t.user_id=$1 AND s.outcome='LOST') AS legs_lost`, [userId]);
  return { tickets: Number(t?.tickets ?? 0), won: Number(t?.won ?? 0), lost: Number(t?.lost ?? 0), legsWon: Number(t?.legs_won ?? 0), legsLost: Number(t?.legs_lost ?? 0) };
}

export type ThreadMsg = { seq: number; agentId: string | null; kind: 'pick' | 'nobet' | 'objection' | 'revised' | 'kept' | 'brain' | 'result' | 'news'; text: string; chip?: string; good?: boolean };
export type Thread = { key: string; match: string; at: string; title: string; messages: ThreadMsg[]; score: number };
export type NewsCard = { match: string; at: string; headlines: Array<{ title: string; source: string | null; link?: string }>; take: string | null; pick: string | null };

const clip = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };

/** Real debate fragments from the last days: who proposed what, who objected, who changed his mind, what the brain chose. */
export async function homeThreads(userId: string): Promise<{ threads: Thread[]; news: NewsCard | null }> {
  const rows = await many<{ job_id: string; slot: string; target_odds: string; required_legs: number | null; seq: number; type: string; fixture_id: string | null; agent_id: string | null; payload: Record<string, any>; created_at: Date }>(
    `SELECT e.job_id, j.slot, j.target_odds, j.required_legs, e.seq, e.type, e.fixture_id, e.agent_id, e.payload, e.created_at
     FROM analysis_events e JOIN ticket_generation_jobs j ON j.id=e.job_id
     WHERE j.user_id=$1 AND j.created_at > now() - interval '7 days' AND e.fixture_id IS NOT NULL
       AND e.type IN ('PREDICTION_SAVED','OBJECTION_RECORDED','POSITION_REVISED','BRAIN_DECISION','SELECTION_ACCEPTED','SELECTION_REJECTED','LEG_REVIEWED','NEWS_COLLECTED')
     ORDER BY e.created_at DESC LIMIT 6000`, [userId]);
  for (const r of rows) r.payload = cleanPayload(r.payload);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) { const k = `${r.job_id}|${r.fixture_id}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  const threads: Thread[] = [];
  let news: (NewsCard & { score: number }) | null = null;
  for (const [key, list] of groups) {
    list.sort((a, b) => a.seq - b.seq);
    const match = String(list.find((r) => r.payload?.match)?.payload.match ?? '');
    if (!match) continue;
    const objections = list.filter((r) => r.type === 'OBJECTION_RECORDED' && r.payload.objection);
    const changed = list.filter((r) => r.type === 'POSITION_REVISED' && r.payload.changed && (r.payload.response || r.payload.rationale));
    const kept = list.filter((r) => r.type === 'POSITION_REVISED' && !r.payload.changed && r.payload.response);
    const brain = list.find((r) => r.type === 'BRAIN_DECISION' && r.payload.reason);
    const result = list.find((r) => r.type === 'SELECTION_ACCEPTED' || r.type === 'SELECTION_REJECTED' || r.type === 'LEG_REVIEWED');
    const preds = list.filter((r) => r.type === 'PREDICTION_SAVED' && r.payload.rationale);
    // Hanțu's news card: real headlines plus his own take on the same match.
    const nc = list.find((r) => r.type === 'NEWS_COLLECTED' && (r.payload.headlines?.length ?? 0) >= 2);
    if (nc) {
      const h = preds.find((p) => p.agent_id === 'hantu');
      const cited = !!h && JSON.stringify(h.payload.evidence ?? '').includes('[H');
      const sc = (h ? 2 : 0) + (cited ? 3 : 0) + (h?.payload.decision === 'BET_CANDIDATE' ? 1 : 0);
      if (!news || sc > news.score) news = { score: sc, match, at: nc.created_at.toISOString(), headlines: nc.payload.headlines.slice(0, 3).map((x: { title: string; source: string | null; link?: string }) => ({ title: clip(x.title, 120), source: x.source, link: x.link })), take: h ? clip(h.payload.rationale, 220) : null, pick: h ? (h.payload.decision === 'BET_CANDIDATE' ? `${h.payload.marketLabel ?? h.payload.marketKey}${h.payload.odds ? ` @ ${Number(h.payload.odds).toFixed(2)}` : ''}` : 'NO BET') : null };
    }
    if (!objections.length && !changed.length) continue;
    // Two opening positions that disagree, then the debate, then the decision.
    const bet = preds.find((p) => p.payload.decision === 'BET_CANDIDATE');
    const other = preds.find((p) => p !== bet && (p.payload.decision !== bet?.payload.decision || p.payload.marketKey !== bet?.payload.marketKey));
    const msgs: ThreadMsg[] = [];
    const pickMsg = (p: (typeof rows)[number]): ThreadMsg => ({ seq: p.seq, agentId: p.agent_id, kind: p.payload.decision === 'BET_CANDIDATE' ? 'pick' : 'nobet', text: clip(p.payload.rationale, 190), chip: p.payload.decision === 'BET_CANDIDATE' ? `${p.payload.marketLabel ?? p.payload.marketKey}${p.payload.odds ? ` @ ${Number(p.payload.odds).toFixed(2)}` : ''}` : 'NO BET' });
    if (bet) msgs.push(pickMsg(bet));
    if (other) msgs.push(pickMsg(other));
    for (const o of objections.slice(0, 2)) msgs.push({ seq: o.seq, agentId: o.agent_id, kind: 'objection', text: clip(o.payload.objection, 190) });
    const c = changed[0] ?? kept[0];
    if (c) msgs.push({ seq: c.seq, agentId: c.agent_id, kind: c.payload.changed ? 'revised' : 'kept', text: clip(c.payload.response || c.payload.rationale, 190), chip: c.payload.decision === 'BET_CANDIDATE' ? c.payload.marketLabel ?? c.payload.marketKey : 'NO BET' });
    if (brain) msgs.push({ seq: brain.seq, agentId: 'robert', kind: 'brain', text: clip(brain.payload.reason, 190), chip: brain.payload.choice ? `${brain.payload.label}${brain.payload.odds ? ` @ ${Number(brain.payload.odds).toFixed(2)}` : ''}` : 'respinge lista' });
    if (result) {
      const ok = result.type === 'SELECTION_ACCEPTED' || (result.type === 'LEG_REVIEWED' && result.payload.verdict === 'SOLID');
      msgs.push({ seq: result.seq, agentId: null, kind: 'result', good: ok, text: result.type === 'LEG_REVIEWED' ? `${result.payload.verdict}: ${clip(result.payload.note, 140)}` : ok ? `Intră pe bilet: ${result.payload.marketLabel} @ ${Number(result.payload.odds).toFixed(2)}` : `Rămâne pe dinafară: ${clip(result.payload.reason, 120)}` });
    }
    msgs.sort((a, b) => a.seq - b.seq);
    const score = objections.length * 2 + changed.length * 3 + (brain ? 2 : 0) + (other ? 1 : 0) + (result?.type === 'SELECTION_ACCEPTED' ? 1 : 0);
    const r0 = list[0];
    threads.push({ key, match, at: r0.created_at.toISOString(), title: slotInfo(r0.slot, Number(r0.target_odds), r0.required_legs).title, messages: msgs.slice(0, 7), score });
  }
  threads.sort((a, b) => b.score - a.score || b.at.localeCompare(a.at));
  // At most one fragment per match.
  const seen = new Set<string>(); const top: Thread[] = [];
  for (const t of threads) { if (seen.has(t.match)) continue; seen.add(t.match); top.push(t); if (top.length === 3) break; }
  return { threads: top, news: news ? { match: news.match, at: news.at, headlines: news.headlines, take: news.take, pick: news.pick } : null };
}
