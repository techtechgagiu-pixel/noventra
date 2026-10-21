import { many } from './db';
import { config } from './config';
import { AGENTS } from './ai/agents';
import { OPENROUTER_MODELS, OPENROUTER_PRICE } from './ai/openrouter-models';

export type AgentStat = {
  id: string; name: string; title: string; model: string | null;
  ownModel: string | null; ownModelShare: number | null;
  bets: number; won: number; lost: number; voided: number; pending: number; noBet: number; hitRate: number | null; avgOdds: number | null; avgEstimated: number | null;
  recent: Array<{ match: string; label: string; odds: number | null; outcome: string | null; at: string }>;
  usage: { calls: number; failed: number; fallback: number; inTokens: number; outTokens: number; costToday: number; cost7d: number; costMonth: number; costTotal: number; avgLatencyMs: number | null; models: string[] };
};

const usd = (model: string, provider: string, i: number, o: number) => {
  if (provider !== 'openrouter') return 0;
  const p = OPENROUTER_PRICE.get(model) ?? { inPerM: 1, outPerM: 3 };
  return (i * p.inPerM + o * p.outPerM) / 1e6;
};

/** Per-agent record (each agent's final pick per match, settled after the match) and real model consumption. */
/** month = 'YYYY-MM' (Romanian calendar): the record covers only that month; consumption always shows today, 7 days, the month and total. */
export async function agentStats(userId: string, admin = false, month = currentMonth()) {
  const picks = await many<{ agent_id: string; decision: string; outcome: string | null; odds: string | null; estimated_probability: string | null; label: string | null; market_key: string | null; home: string | null; away: string | null; created_at: Date; model_id: string }>(
    `SELECT DISTINCT ON (p.job_id, p.fixture_id, p.agent_id) p.agent_id, p.decision, p.outcome, p.odds, p.estimated_probability, p.payload->>'marketLabel' AS label, p.market_key, p.model_id,
            f.home_team AS home, f.away_team AS away, p.created_at
     FROM agent_predictions p JOIN ticket_generation_jobs j ON j.id=p.job_id LEFT JOIN fixtures f ON f.id=p.fixture_id
     WHERE j.user_id=$1 AND ($2 = 'all' OR to_char(p.created_at AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM') = $2)
     ORDER BY p.job_id, p.fixture_id, p.agent_id, p.round DESC`, [userId, month]);
  const usage = await many<{ agent_id: string | null; provider: string; model_id: string; requested_model_id: string; calls: string; failed: string; i: string | null; o: string | null; lat: string | null; today_i: string | null; today_o: string | null; week_i: string | null; week_o: string | null; month_i: string | null; month_o: string | null }>(
    `SELECT agent_id, provider, model_id, requested_model_id, count(*) AS calls, count(*) FILTER (WHERE NOT ok) AS failed,
            sum(input_tokens) AS i, sum(output_tokens) AS o, avg(latency_ms) FILTER (WHERE ok) AS lat,
            sum(input_tokens) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS today_i,
            sum(output_tokens) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS today_o,
            sum(input_tokens) FILTER (WHERE created_at > now() - interval '7 days') AS week_i,
            sum(output_tokens) FILTER (WHERE created_at > now() - interval '7 days') AS week_o,
            sum(input_tokens) FILTER (WHERE to_char(created_at AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM') = $3) AS month_i,
            sum(output_tokens) FILTER (WHERE to_char(created_at AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM') = $3) AS month_o
     FROM model_usage_logs WHERE $2 OR job_id IN (SELECT id FROM ticket_generation_jobs WHERE user_id=$1)
     GROUP BY 1,2,3,4`, [userId, admin, month === 'all' ? currentMonth() : month]);
  const stats: AgentStat[] = AGENTS.map((a) => {
    const mine = picks.filter((p) => p.agent_id === a.id);
    const bets = mine.filter((p) => p.decision === 'BET_CANDIDATE');
    const won = bets.filter((p) => p.outcome === 'WON').length, lost = bets.filter((p) => p.outcome === 'LOST').length;
    const priced = bets.filter((p) => p.odds !== null), est = bets.filter((p) => p.estimated_probability !== null);
    const u = usage.filter((r) => r.agent_id === a.id);
    const sum = (f: (r: (typeof u)[number]) => number) => u.reduce((s, r) => s + f(r), 0);
    const calls = sum((r) => Number(r.calls));
    const own = OPENROUTER_MODELS[a.id]?.model ?? null;
    const madeWithOwn = own ? mine.filter((p) => p.model_id === own || p.model_id.startsWith(own)).length : 0;
    const latW = u.filter((r) => r.lat !== null);
    return {
      id: a.id, name: a.name, title: a.title, ownModel: own, ownModelShare: own && mine.length ? madeWithOwn / mine.length : null, model: u.sort((x, y) => Number(y.calls) - Number(x.calls))[0]?.requested_model_id ?? null,
      bets: bets.length, won, lost, voided: bets.filter((p) => p.outcome === 'VOID').length, pending: bets.filter((p) => !p.outcome).length, noBet: mine.length - bets.length,
      hitRate: won + lost ? won / (won + lost) : null,
      avgOdds: priced.length ? priced.reduce((s, p) => s + Number(p.odds), 0) / priced.length : null,
      avgEstimated: est.length ? est.reduce((s, p) => s + Number(p.estimated_probability), 0) / est.length : null,
      recent: bets.sort((x, y) => +y.created_at - +x.created_at).slice(0, 12).map((p) => ({ match: p.home ? `${p.home} – ${p.away}` : '—', label: p.label ?? p.market_key ?? '', odds: p.odds === null ? null : Number(p.odds), outcome: p.outcome, at: p.created_at.toISOString() })),
      usage: {
        calls, failed: sum((r) => Number(r.failed)), fallback: sum((r) => (own && r.requested_model_id !== own ? Number(r.calls) : 0)),
        inTokens: sum((r) => Number(r.i ?? 0)), outTokens: sum((r) => Number(r.o ?? 0)),
        costToday: sum((r) => usd(r.model_id, r.provider, Number(r.today_i ?? 0), Number(r.today_o ?? 0))),
        cost7d: sum((r) => usd(r.model_id, r.provider, Number(r.week_i ?? 0), Number(r.week_o ?? 0))),
        costMonth: sum((r) => usd(r.model_id, r.provider, Number(r.month_i ?? 0), Number(r.month_o ?? 0))),
        costTotal: sum((r) => usd(r.model_id, r.provider, Number(r.i ?? 0), Number(r.o ?? 0))),
        avgLatencyMs: latW.length ? latW.reduce((s, r) => s + Number(r.lat) * Number(r.calls), 0) / latW.reduce((s, r) => s + Number(r.calls), 0) : null,
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
