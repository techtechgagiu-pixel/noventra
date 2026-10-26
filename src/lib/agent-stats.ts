import { describeModel } from '@/lib/model-identities';
import { many, timeCompare, dialect } from './db';
import { config } from './config';
import { AGENTS } from './ai/agents';
import { OPENROUTER_MODELS, OPENROUTER_PRICE } from './ai/openrouter-models';
import { finalAgentPicksCte } from './final-agent-picks';
import { activeAssignments } from './ai/assignments';
import { romanianMonthWindow } from './time';
import { sameModel } from './calibration';

export type AgentStat = {
  id: string; name: string; title: string; model: string | null;
  ownModel: string | null; ownModelShare: number | null;
  bets: number; won: number; lost: number; voided: number; pending: number; noBet: number; hitRate: number | null; avgOdds: number | null; avgEstimated: number | null;
  recent: Array<{ predictionId: string; decision: string; round: number; model: string; fixtureId: string; jobId: string; match: string; league: string; label: string; odds: number | null; outcome: string | null; at: string; kickoff: string; status: string; score: string | null }>;
  upcoming: number; live: number; awaiting: number; editorial: boolean;
  career: { won: number; lost: number };
  /** Settled picks made by other models for this role (fallbacks, earlier assignments) or saved after kickoff — shown, never counted. */
  excluded: { won: number; lost: number; otherModel: number; afterKickoff: number };
  character: { role: string; specialty: string; risk: number; maxOdds: number; minProbability: number };
  usage: { calls: number; failed: number; fallback: number; inTokens: number; outTokens: number; costToday: number; cost7d: number; costMonth: number; costTotal: number; avgLatencyMs: number | null; models: string[] };
};

const usd = (model: string, provider: string, i: number, o: number) => {
  if (provider !== 'openrouter') return 0;
  const p = OPENROUTER_PRICE.get(model) ?? { inPerM: 1, outPerM: 3 };
  return (i * p.inPerM + o * p.outPerM) / 1e6;
};

function loadAgentPicks(userId: string, month: string, scope: 'all' | 'mine', agentId?: string) {
  const window = romanianMonthWindow(month === 'all' ? currentMonth() : month);
  return many<{ id: string; round: number; agent_id: string; decision: string; outcome: string | null; odds: string | null; estimated_probability: string | null; label: string | null; market_key: string | null; home: string; away: string; created_at: Date; model_id: string; fixture_id: string; job_id: string; kickoff_utc: Date; status: string; home_score: number | null; away_score: number | null; league: string }>(
    `${finalAgentPicksCte(true)}
     SELECT p.id,p.round,p.agent_id,p.decision,p.outcome,p.odds,p.estimated_probability,p.market_key,p.created_at,p.model_id,p.fixture_id,p.job_id,
            p.payload->>'marketLabel' AS label, f.home_team AS home, f.away_team AS away,
            f.kickoff_utc, f.status, f.home_score, f.away_score, l.name AS league
     FROM final_picks p JOIN fixtures f ON f.id=p.fixture_id JOIN leagues l ON l.id=f.league_id
     WHERE ($2 = 'all' OR (${timeCompare('f.kickoff_utc','>=','$3')} AND ${timeCompare('f.kickoff_utc','<','$4')}))
     AND (${dialect('$5::text','$5')} IS NULL OR p.agent_id=$5)
     ORDER BY p.created_at DESC,p.id DESC`, [scope === 'mine' ? userId : null, month, ...window, agentId ?? null]);
}

const historyOf = (rows: Awaited<ReturnType<typeof loadAgentPicks>>): AgentStat['recent'] => rows.map((p) => ({ predictionId: String(p.id), decision: p.decision, round: p.round, model: p.model_id, fixtureId: p.fixture_id, jobId: p.job_id, match: `${p.home} – ${p.away}`, league: p.league, label: p.label ?? p.market_key ?? '', odds: p.odds === null ? null : Number(p.odds), outcome: p.outcome, at: p.created_at.toISOString(), kickoff: p.kickoff_utc.toISOString(), status: p.status, score: p.home_score !== null && p.away_score !== null ? `${p.home_score}–${p.away_score}` : null }));

export async function agentHistory(userId: string, agentId: string, month: string, scope: 'all' | 'mine') {
  const [rows, assignments] = await Promise.all([loadAgentPicks(userId, month, scope, agentId), activeAssignments()]);
  const own = assignments.get(agentId)?.primary.model ?? OPENROUTER_MODELS[agentId]?.model ?? null;
  // Same rule as the cards: the role's current model, picks saved before kickoff.
  return historyOf(rows.filter((p) => sameModel(p.model_id, own) && p.created_at.getTime() < p.kickoff_utc.getTime()));
}

/** Per-agent record (each agent's final pick per match, settled after the match) and real model consumption. */
/** month = 'YYYY-MM' (Romanian calendar): the record covers only that month; consumption always shows today, 7 days, the month and total. */
export async function agentStats(userId: string, admin = false, month = currentMonth(), scope: 'all' | 'mine' = 'all') {
  void admin;
  const window = romanianMonthWindow(month === 'all' ? currentMonth() : month);
  const picksPromise = loadAgentPicks(userId, month, scope);
  const usagePromise = many<{ agent_id: string | null; provider: string; model_id: string; requested_model_id: string; calls: string; successful: string; failed: string; i: string | null; o: string | null; lat: string | null; today_i: string | null; today_o: string | null; week_i: string | null; week_o: string | null; month_i: string | null; month_o: string | null }>(
    `SELECT agent_id, provider, model_id, requested_model_id, count(*) AS calls, count(*) FILTER (WHERE ok) AS successful, count(*) FILTER (WHERE NOT ok) AS failed,
            sum(input_tokens) AS i, sum(output_tokens) AS o, avg(latency_ms) FILTER (WHERE ok) AS lat,
            sum(input_tokens) FILTER (WHERE ${timeCompare('created_at','>=','$3')}) AS today_i,
            sum(output_tokens) FILTER (WHERE ${timeCompare('created_at','>=','$3')}) AS today_o,
            sum(input_tokens) FILTER (WHERE ${timeCompare('created_at','>','$4')}) AS week_i,
            sum(output_tokens) FILTER (WHERE ${timeCompare('created_at','>','$4')}) AS week_o,
            sum(input_tokens) FILTER (WHERE ${timeCompare('created_at','>=','$5')} AND ${timeCompare('created_at','<','$6')}) AS month_i,
            sum(output_tokens) FILTER (WHERE ${timeCompare('created_at','>=','$5')} AND ${timeCompare('created_at','<','$6')}) AS month_o
     FROM model_usage_logs WHERE $2 OR job_id IN (SELECT id FROM ticket_generation_jobs WHERE user_id=$1)
     GROUP BY 1,2,3,4`, [userId, scope === 'all', new Date(new Date().toISOString().slice(0,10) + 'T00:00:00Z'), new Date(Date.now() - 7 * 86400_000), ...window]);
  const [picks, usage, assignments, careerRows] = await Promise.all([
    picksPromise, usagePromise, activeAssignments(),
    many<{ agent_id: string; model_id: string; won: number; lost: number }>(`${finalAgentPicksCte(true)}
      SELECT p.agent_id,p.model_id,CAST(count(*) FILTER(WHERE p.outcome='WON') AS INTEGER) AS won,CAST(count(*) FILTER(WHERE p.outcome='LOST') AS INTEGER) AS lost
      FROM final_picks p JOIN fixtures f ON f.id=p.fixture_id WHERE p.decision='BET_CANDIDATE' AND ${timeCompare('p.created_at','<','f.kickoff_utc')} GROUP BY p.agent_id,p.model_id`, [scope === 'mine' ? userId : null]),
  ]);
  // A role is judged only by its CURRENT model, on picks saved before kickoff: the same agent keeps the same pattern.
  const ownOf = (agentId: string) => assignments.get(agentId)?.primary.model ?? OPENROUTER_MODELS[agentId]?.model ?? null;
  const career = new Map<string, { won: number; lost: number }>();
  for (const r of careerRows) {
    if (!sameModel(r.model_id, ownOf(r.agent_id))) continue;
    const c = career.get(r.agent_id) ?? { won: 0, lost: 0 };
    career.set(r.agent_id, { won: c.won + r.won, lost: c.lost + r.lost });
  }
  const stats: AgentStat[] = AGENTS.map((a) => {
    const all = picks.filter((p) => p.agent_id === a.id);
    const ownModel = ownOf(a.id);
    const counts = (p: (typeof all)[number]) => sameModel(p.model_id, ownModel) && p.created_at.getTime() < p.kickoff_utc.getTime();
    const mine = all.filter(counts);
    const left = all.filter((p) => !counts(p) && p.decision === 'BET_CANDIDATE' && (p.outcome === 'WON' || p.outcome === 'LOST'));
    const bets = mine.filter((p) => p.decision === 'BET_CANDIDATE');
    const won = bets.filter((p) => p.outcome === 'WON').length, lost = bets.filter((p) => p.outcome === 'LOST').length;
    const decided = bets.filter((p) => p.outcome === 'WON' || p.outcome === 'LOST');
    const priced = decided.filter((p) => p.odds !== null), est = decided.filter((p) => p.estimated_probability !== null);
    const u = usage.filter((r) => r.agent_id === a.id);
    const sum = (f: (r: (typeof u)[number]) => number) => u.reduce((s, r) => s + f(r), 0);
    const calls = sum((r) => Number(r.calls));
    const own = assignments.get(a.id)?.primary.model ?? OPENROUTER_MODELS[a.id]?.model ?? null;
    const madeWithOwn = all.filter((p) => sameModel(p.model_id, ownModel)).length;
    const latW = u.filter((r) => r.lat !== null);
    return {
      id: a.id, name: describeModel(own).modelName, title: a.title, ownModel: own, ownModelShare: own && all.length ? madeWithOwn / all.length : null, model: u.sort((x, y) => Number(y.calls) - Number(x.calls))[0]?.requested_model_id ?? null,
      bets: bets.length, won, lost, voided: bets.filter((p) => p.outcome === 'VOID').length, pending: bets.filter((p) => !p.outcome).length, noBet: mine.length - bets.length,
      upcoming: bets.filter((p) => !p.outcome && p.status === 'pre' && p.kickoff_utc.getTime() > Date.now()).length,
      live: bets.filter((p) => !p.outcome && p.status === 'in').length,
      awaiting: bets.filter((p) => !p.outcome && p.status !== 'in' && !(p.status === 'pre' && p.kickoff_utc.getTime() > Date.now())).length,
      editorial: a.id === 'scout' || a.id === 'corina',
      career: career.get(a.id) ?? { won: 0, lost: 0 },
      excluded: { won: left.filter((p) => p.outcome === 'WON').length, lost: left.filter((p) => p.outcome === 'LOST').length, otherModel: left.filter((p) => !sameModel(p.model_id, ownModel)).length, afterKickoff: left.filter((p) => sameModel(p.model_id, ownModel)).length },
      character: { role: a.title.split(' · ')[0], specialty: a.specialty, risk: a.risk, maxOdds: a.maxOdds, minProbability: a.minProbability },
      hitRate: won + lost ? won / (won + lost) : null,
      avgOdds: priced.length ? priced.reduce((s, p) => s + Number(p.odds), 0) / priced.length : null,
      avgEstimated: est.length ? est.reduce((s, p) => s + Number(p.estimated_probability), 0) / est.length : null,
      recent: historyOf(mine),
      usage: {
        calls, failed: sum((r) => Number(r.failed)), fallback: sum((r) => (own && r.requested_model_id !== own ? Number(r.calls) : 0)),
        inTokens: sum((r) => Number(r.i ?? 0)), outTokens: sum((r) => Number(r.o ?? 0)),
        costToday: sum((r) => usd(r.model_id, r.provider, Number(r.today_i ?? 0), Number(r.today_o ?? 0))),
        cost7d: sum((r) => usd(r.model_id, r.provider, Number(r.week_i ?? 0), Number(r.week_o ?? 0))),
        costMonth: sum((r) => usd(r.model_id, r.provider, Number(r.month_i ?? 0), Number(r.month_o ?? 0))),
        costTotal: sum((r) => usd(r.model_id, r.provider, Number(r.i ?? 0), Number(r.o ?? 0))),
        avgLatencyMs: latW.length ? latW.reduce((s, r) => s + Number(r.lat) * Number(r.successful), 0) / latW.reduce((s, r) => s + Number(r.successful), 0) : null,
        models: [...new Set(u.map((r) => `${r.provider}/${r.model_id}`))].slice(0, 4),
      },
    };
  });
  const other = usage.filter((r) => !r.agent_id || !AGENTS.some((a) => a.id === r.agent_id));
  const totals = {
    today: stats.reduce((s, a) => s + a.usage.costToday, 0) + other.reduce((s, r) => s + usd(r.model_id, r.provider, Number(r.today_i ?? 0), Number(r.today_o ?? 0)), 0),
    week: stats.reduce((s, a) => s + a.usage.cost7d, 0) + other.reduce((s, r) => s + usd(r.model_id, r.provider, Number(r.week_i ?? 0), Number(r.week_o ?? 0)), 0),
    total: stats.reduce((s, a) => s + a.usage.costTotal, 0) + other.reduce((s, r) => s + usd(r.model_id, r.provider, Number(r.i ?? 0), Number(r.o ?? 0)), 0),
    calls: usage.reduce((s, r) => s + Number(r.calls), 0),
    cap: config.openRouterDailyUsd,
  };
  return { agents: stats, totals, month };
}

export function currentMonth(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' }).format(at).slice(0, 7);
}

/** Custom only needs the exact community ranking, not usage logs or every history row. */
export async function agentRanking(month = currentMonth()) {
  const [rows, assignments] = await Promise.all([many<{ agent_id: string; model_id: string; won: number; lost: number; bets: number }>(`${finalAgentPicksCte()}
    SELECT p.agent_id,p.model_id,CAST(count(*) FILTER(WHERE p.outcome='WON') AS INTEGER) AS won,
      CAST(count(*) FILTER(WHERE p.outcome='LOST') AS INTEGER) AS lost,CAST(count(*) AS INTEGER) AS bets
    FROM final_picks p JOIN fixtures f ON f.id=p.fixture_id WHERE p.decision='BET_CANDIDATE' AND ${timeCompare('p.created_at','<','f.kickoff_utc')}
      AND ($1='all' OR (${timeCompare('f.kickoff_utc','>=','$2')} AND ${timeCompare('f.kickoff_utc','<','$3')})) GROUP BY p.agent_id,p.model_id`, [month, ...romanianMonthWindow(month === 'all' ? currentMonth() : month)]), activeAssignments()]);
  const byId = new Map<string, { won: number; lost: number; bets: number }>();
  for (const r of rows) {
    if (!sameModel(r.model_id, assignments.get(r.agent_id)?.primary.model ?? OPENROUTER_MODELS[r.agent_id]?.model)) continue;
    const c = byId.get(r.agent_id) ?? { won: 0, lost: 0, bets: 0 };
    byId.set(r.agent_id, { won: c.won + r.won, lost: c.lost + r.lost, bets: c.bets + r.bets });
  }
  return AGENTS.map(a => { const r=byId.get(a.id),won=r?.won??0,lost=r?.lost??0; return {id:a.id,won,lost,bets:r?.bets??0,hitRate:won+lost?won/(won+lost):null,editorial:a.id==='scout'||a.id==='corina'}; });
}
