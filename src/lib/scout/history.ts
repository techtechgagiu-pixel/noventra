import { one, query } from '../db';
import { espnSummary, espnTeamPastEvents, historicalFromSummary } from '../sports/espn';
import type { Fixture, HistoricalMatch } from '../sports/types';

type Obj = Record<string, unknown>;

/** Keeps only what the history analysis needs (compact, shared across users and jobs). */
function compactSummary(summary: Obj): Obj {
  const header = (summary.header ?? {}) as Obj;
  const comps = (header.competitions as Obj[] | undefined) ?? [];
  const comp = comps[0] ?? {};
  return {
    header: {
      league: header.league ? { name: (header.league as Obj).name } : undefined,
      competitions: [{
        date: comp.date,
        status: comp.status,
        competitors: ((comp.competitors as Obj[]) ?? []).map((c) => ({ homeAway: c.homeAway, score: c.score, team: { id: (c.team as Obj)?.id, displayName: (c.team as Obj)?.displayName } })),
        details: ((comp.details as Obj[]) ?? []).map((d) => ({ clock: d.clock, scoringPlay: d.scoringPlay, team: { id: (d.team as Obj)?.id }, redCard: d.redCard, penaltyKick: d.penaltyKick, ownGoal: d.ownGoal, yellowCard: d.yellowCard })),
      }],
    },
    boxscore: { teams: (((summary.boxscore as Obj)?.teams as Obj[]) ?? []).map((t) => ({ team: { id: (t.team as Obj)?.id }, statistics: t.statistics })) },
    keyEvents: ((summary.keyEvents as Obj[]) ?? []).filter((k) => k.scoringPlay === true).map((k) => ({ scoringPlay: true, team: { id: (k.team as Obj)?.id }, text: k.text })),
  };
}

async function cachedPastSummary(leagueKey: string, eventId: string, playedAt: string): Promise<Obj | null> {
  const key = `espn:${eventId}`;
  const hit = await one<{ payload: Obj }>('SELECT payload FROM historical_match_statistics WHERE event_key=$1', [key]);
  if (hit) return hit.payload;
  const summary = await espnSummary(leagueKey, eventId, 24 * 3600_000);
  const compact = compactSummary(summary);
  const state = ((((compact.header as Obj).competitions as Obj[])[0]?.status as Obj)?.type as Obj)?.state;
  if (state === 'post') {
    await query('INSERT INTO historical_match_statistics(event_key, league_key, played_at, payload) VALUES ($1,$2,$3,$4) ON CONFLICT (event_key) DO NOTHING', [key, leagueKey, playedAt, JSON.stringify(compact)]);
  }
  return compact;
}

type HistoryHook = (fixture: Fixture, side: 'home' | 'away') => HistoricalMatch[];
const hg = globalThis as unknown as { __bmHistoryHook?: HistoryHook | null };
/** Tests only: synthetic, clearly-labelled DEMO history for provider 'demo' fixtures. */
export function setHistoryProviderForTests(h: HistoryHook | null) { hg.__bmHistoryHook = h; }

/** Up to `limit` completed official matches (all competitions) before kickoff (no future-data leakage). */
export async function teamHistory(fixture: Fixture, side: 'home' | 'away', limit = 10): Promise<{ matches: HistoricalMatch[]; missing: string[] }> {
  if (fixture.provider === 'demo' && hg.__bmHistoryHook) return { matches: hg.__bmHistoryHook(fixture, side).filter((m) => Date.parse(m.date) < Date.parse(fixture.kickoff)), missing: ['DEMO: istoric sintetic de test'] };
  const teamId = side === 'home' ? fixture.homeTeamId : fixture.awayTeamId;
  if (fixture.provider !== 'espn' || !teamId) return { matches: [], missing: ['Istoricul echipei nu este disponibil la această sursă.'] };
  const events = await espnTeamPastEvents(fixture.leagueKey, teamId, fixture.kickoff, limit);
  const missing: string[] = [];
  const matches: HistoricalMatch[] = [];
  for (const e of events) {
    try {
      const summary = await cachedPastSummary(e.leagueKey, e.eventId, e.date);
      const m = summary ? historicalFromSummary(summary, teamId, `espn:${e.eventId}`) : null;
      if (m && Date.parse(m.date || e.date) < Date.parse(fixture.kickoff)) matches.push({ ...m, date: m.date || e.date });
    } catch (error) {
      missing.push(`Meciul ${e.eventId} nu a putut fi citit (${(error as Error).message}).`);
    }
  }
  if (events.length < limit) missing.push(`Sursa are ${events.length} meciuri oficiale încheiate în sezonul curent (țintă: ${limit}).`);
  return { matches, missing };
}
