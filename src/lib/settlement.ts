import { many, query } from './db';
import { espnLeagueDay, espnSummary } from './sports/espn';
import { getLeagues, persistFixtures } from './sports/fixtures';
import { localDate, yyyymmdd } from './time';
import { runAutomation } from './automation';

export type MatchFacts = { ht?: [number, number] | null; corners?: [number, number] | null };

/** Which extra match facts a market needs to be settled (beyond the final score). */
export function needsFacts(key: string): Array<'ht' | 'corners'> {
  const t = key.split(':')[0];
  return t === 'HT1X2' || t === 'H21X2' || t === 'HTTOT' || t === 'WBH' ? ['ht'] : t === 'CORN' || t === 'TCORN' ? ['corners'] : [];
}

/** Canonical settlement for the market keys this app produces. Returns null when not decidable (yet). */
export function settleMarket(key: string, home: number, away: number, facts: MatchFacts = {}): 'WON' | 'LOST' | null {
  const [type, side, lineRaw] = key.split(':');
  const line = Number(lineRaw);
  const r = (b: boolean) => (b ? 'WON' : 'LOST');
  const ht = facts.ht ?? null, corners = facts.corners ?? null;
  switch (type) {
    case '1X2': return r(side === 'HOME' ? home > away : side === 'AWAY' ? away > home : home === away);
    case 'DC': return r(side === '1X' ? home >= away : side === 'X2' ? away >= home : home !== away);
    case 'TOTAL': return r(side === 'OVER' ? home + away > line : home + away < line);
    case 'AH': return r(side === 'HOME' ? home + line > away : away + line > home);
    case 'TT': { const goals = side === 'HOME' ? home : away; const l = Number(key.split(':')[3]); return r(key.split(':')[2] === 'OVER' ? goals > l : goals < l); }
    case 'BTTS': return r(side === 'YES' ? home > 0 && away > 0 : !(home > 0 && away > 0));
    case 'CS': { const conceded = side === 'HOME' ? away : home; return r(key.split(':')[2] === 'YES' ? conceded === 0 : conceded > 0); }
    case 'WIN2': return r(side === 'HOME' ? home - away >= 2 : away - home >= 2);
    case 'HT1X2': return ht ? r(side === 'HOME' ? ht[0] > ht[1] : side === 'AWAY' ? ht[1] > ht[0] : ht[0] === ht[1]) : null;
    case 'H21X2': { if (!ht) return null; const h = home - ht[0], a = away - ht[1]; return r(side === 'HOME' ? h > a : side === 'AWAY' ? a > h : h === a); }
    case 'HTTOT': return ht ? r(side === 'OVER' ? ht[0] + ht[1] > line : ht[0] + ht[1] < line) : null;
    case 'WBH': { if (!ht) return null; const h2 = [home - ht[0], away - ht[1]]; return r(side === 'HOME' ? ht[0] > ht[1] && h2[0] > h2[1] : ht[1] > ht[0] && h2[1] > h2[0]); }
    case 'CORN': return corners ? r(side === 'OVER' ? corners[0] + corners[1] > line : corners[0] + corners[1] < line) : null;
    case 'TCORN': { if (!corners) return null; const c = side === 'HOME' ? corners[0] : corners[1]; const l = Number(key.split(':')[3]); return r(key.split(':')[2] === 'OVER' ? c > l : c < l); }
    default: return null;
  }
}

export function ticketOutcome(outcomes: string[]): 'PENDING' | 'WON' | 'LOST' | 'VOID' | 'PARTIAL_VOID' {
  if (outcomes.includes('LOST')) return 'LOST';
  if (outcomes.includes('PENDING')) return 'PENDING';
  if (outcomes.every((o) => o === 'VOID')) return 'VOID';
  return outcomes.includes('VOID') ? 'PARTIAL_VOID' : 'WON';
}

type FactRow = { status: string; home_score: number | null; away_score: number | null; kickoff_utc: Date; ht_home: number | null; ht_away: number | null; corners_home: number | null; corners_away: number | null };
const factsOf = (r: FactRow): MatchFacts => ({
  ht: r.ht_home !== null && r.ht_away !== null ? [r.ht_home, r.ht_away] : null,
  corners: r.corners_home !== null && r.corners_away !== null ? [r.corners_home, r.corners_away] : null,
});

/** Reads half-time score and corners from the finished match's summary, once, for fixtures whose markets need them. */
async function loadMatchFacts() {
  let failures = 0;
  const rows = await many<{ id: string; provider_id: string; provider_key: string }>(
    `SELECT DISTINCT f.id, f.provider_id, l.provider_key, f.facts_checked_at FROM fixtures f JOIN leagues l ON l.id=f.league_id
     WHERE f.status='post' AND f.provider='espn' AND (f.ht_home IS NULL OR f.corners_home IS NULL)
       AND (f.facts_checked_at IS NULL OR f.facts_checked_at < now() - interval '15 minutes')
       AND (EXISTS (SELECT 1 FROM ticket_selections s WHERE s.fixture_id=f.id AND s.outcome='PENDING' AND s.market_key ~ '^(HT1X2|H21X2|HTTOT|WBH|CORN|TCORN):')
         OR EXISTS (SELECT 1 FROM agent_predictions p WHERE p.fixture_id=f.id AND p.outcome IS NULL AND p.market_key ~ '^(HT1X2|H21X2|HTTOT|WBH|CORN|TCORN):'))
     ORDER BY f.facts_checked_at NULLS FIRST, f.id LIMIT 40`);
  for (const r of rows) {
    try {
      const sm = await espnSummary(r.provider_key, r.provider_id, 30 * 60_000) as Record<string, any>;
      const comps = (sm.header?.competitions?.[0]?.competitors ?? []) as Array<{ homeAway: string; linescores?: Array<{ displayValue?: string; value?: number }> }>;
      const half = (side: string) => { const c = comps.find((x) => x.homeAway === side); const v = c?.linescores?.[0]; const n = Number(v?.value ?? v?.displayValue); return Number.isFinite(n) ? n : null; };
      const teams = (sm.boxscore?.teams ?? []) as Array<{ homeAway?: string; team?: { id?: string }; statistics?: Array<{ name: string; displayValue?: string }> }>;
      const homeId = (sm.header?.competitions?.[0]?.competitors ?? []).find((x: { homeAway: string }) => x.homeAway === 'home')?.team?.id;
      const cornersOf = (home: boolean) => { const t = teams.find((x) => (x.homeAway ? x.homeAway === (home ? 'home' : 'away') : (x.team?.id === homeId) === home)); const v = Number(t?.statistics?.find((st) => st.name === 'wonCorners')?.displayValue); return Number.isFinite(v) ? v : null; };
      await query('UPDATE fixtures SET ht_home=COALESCE($2,ht_home), ht_away=COALESCE($3,ht_away), corners_home=COALESCE($4,corners_home), corners_away=COALESCE($5,corners_away), facts_checked_at=now() WHERE id=$1',
        [r.id, half('home'), half('away'), cornersOf(true), cornersOf(false)]);
    } catch { failures++; await query('UPDATE fixtures SET facts_checked_at=now() WHERE id=$1', [r.id]); }
  }
  return failures;
}

/** A finished leg whose extra facts never arrive (≥ 3 days) is voided rather than guessed. */
const factsMissingTooLong = (r: FactRow) => Date.now() - new Date(r.kickoff_utc).getTime() > 72 * 3600_000;

/** Settles every agent pick (not only ticket legs) so each agent builds a verified track record. */
export async function settleAgentPredictions() {
  const rows = await many<FactRow & { id: string; market_key: string }>(
    `SELECT p.id, p.market_key, f.status, f.home_score, f.away_score, f.kickoff_utc, f.ht_home, f.ht_away, f.corners_home, f.corners_away FROM agent_predictions p JOIN fixtures f ON f.id=p.fixture_id
     WHERE p.decision='BET_CANDIDATE' AND p.market_key IS NOT NULL AND (p.outcome IS NULL OR p.settled_at < GREATEST(f.updated_at,COALESCE(f.facts_checked_at,f.updated_at))) AND f.status IN ('post','cancelled','postponed') ORDER BY p.settled_at NULLS FIRST,p.id LIMIT 2000`,
  );
  for (const r of rows) {
    let outcome: string | null = null;
    if (r.status === 'post' && r.home_score !== null && r.away_score !== null) outcome = settleMarket(r.market_key, r.home_score, r.away_score, factsOf(r)) ?? (factsMissingTooLong(r) ? 'VOID' : null);
    else if (r.status === 'cancelled' || (r.status === 'postponed' && Date.now() - new Date(r.kickoff_utc).getTime() > 48 * 3600_000)) outcome = 'VOID';
    if (outcome) await query('UPDATE agent_predictions SET outcome=$2, settled_at=now() WHERE id=$1', [r.id, outcome]);
  }
}

// Next bundles may load this module more than once; scheduling and the guard belong to the process.
const g = globalThis as unknown as { __bmSettlement?: { running: boolean; timer?: ReturnType<typeof setInterval> } };
const state = (g.__bmSettlement ??= { running: false });
export const SETTLEMENT_INTERVAL_MS = 5 * 60_000;

/** Check immediately on boot/wake, then periodically while the server is running. */
export function startSettlement() {
  if (process.env.BETMIND_DISABLE_WORKER === '1' || state.timer) return;
  void settlePending();
  state.timer = setInterval(() => void settlePending(), SETTLEMENT_INTERVAL_MS);
  state.timer.unref?.();
}

/** Deterministic, non-AI settlement of finished fixtures. Original prices and predictions are never changed. */
export async function settlePending() {
  if (state.running) return { status: 'busy' as const };
  state.running = true;
  try {
    return await runAutomation('settlement', async () => {
    let sourceErrors = 0;
    const due = await many<{ fixture_id: string; kickoff_utc: Date; league_id: string; status: string }>(
      `SELECT DISTINCT f.id AS fixture_id, f.kickoff_utc, f.league_id, f.status, f.results_checked_at FROM fixtures f
       WHERE f.kickoff_utc < now() - interval '2 hours' AND f.provider='espn'
       AND (f.status NOT IN ('post','cancelled') OR (f.status='post' AND f.kickoff_utc>now()-interval '48 hours' AND (f.results_checked_at IS NULL OR f.results_checked_at<now()-interval '30 minutes'))) AND (
         EXISTS (SELECT 1 FROM ticket_selections s WHERE s.fixture_id=f.id AND s.outcome='PENDING') OR
         EXISTS (SELECT 1 FROM agent_predictions p WHERE p.fixture_id=f.id AND p.decision='BET_CANDIDATE' AND p.outcome IS NULL) OR
         (f.status='post' AND (EXISTS(SELECT 1 FROM ticket_selections s WHERE s.fixture_id=f.id) OR EXISTS(SELECT 1 FROM agent_predictions p WHERE p.fixture_id=f.id AND p.decision='BET_CANDIDATE'))))
       ORDER BY f.results_checked_at NULLS FIRST, f.kickoff_utc, f.id LIMIT 60`,
    );
    if (due.length) {
    const leagues = await getLeagues({ top10Only: false, includeDisabled: true });
    const days = new Set<string>();
    for (const d of due) {
      const date = localDate(new Date(d.kickoff_utc));
      const previous = new Date(`${date}T12:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 1);
      // ESPN can file a late game under the preceding US date (as in the fixture loader).
      days.add(`${d.league_id}|${date}`);
      days.add(`${d.league_id}|${previous.toISOString().slice(0, 10)}`);
    }
    for (const key of days) {
      const [leagueId, date] = key.split('|');
      const league = leagues.find((l) => l.id === leagueId);
      if (!league) continue;
      const fixtures = await espnLeagueDay(league, yyyymmdd(date), SETTLEMENT_INTERVAL_MS).catch((error) => { sourceErrors++; console.warn(JSON.stringify({ event: 'results_source_failed', league: leagueId, date, message: (error as Error).message })); return []; });
      await persistFixtures(fixtures.map((f) => ({ ...f, odds: null })));
    }
    await query('UPDATE fixtures SET results_checked_at=now() WHERE id=ANY($1)', [due.map((d) => d.fixture_id)]);
    }
    sourceErrors += await loadMatchFacts();
    await settleAgentPredictions();
    const rows = await many<FactRow & { id: string; ticket_id: string; market_key: string }>(
      `SELECT s.id, s.ticket_id, s.market_key, f.status, f.home_score, f.away_score, f.kickoff_utc, f.ht_home, f.ht_away, f.corners_home, f.corners_away FROM ticket_selections s JOIN fixtures f ON f.id=s.fixture_id WHERE s.outcome='PENDING' OR (f.status IN ('post','cancelled') AND (s.settled_at IS NULL OR s.settled_at < GREATEST(f.updated_at,COALESCE(f.facts_checked_at,f.updated_at))))`,
    );
    const touched = new Set<string>();
    for (const r of rows) {
      let outcome: string | null = null;
      if (r.status === 'post' && r.home_score !== null && r.away_score !== null) outcome = settleMarket(r.market_key, r.home_score, r.away_score, factsOf(r)) ?? (factsMissingTooLong(r) ? 'VOID' : null);
      else if (r.status === 'cancelled' || (r.status === 'postponed' && Date.now() - new Date(r.kickoff_utc).getTime() > 48 * 3600_000)) outcome = 'VOID';
      if (outcome) { await query('UPDATE ticket_selections SET outcome=$2,settled_at=now() WHERE id=$1', [r.id, outcome]); touched.add(r.ticket_id); }
    }
    for (const t of touched) {
      const legs = await many<{ outcome: string }>('SELECT outcome FROM ticket_selections WHERE ticket_id=$1', [t]);
      const o = ticketOutcome(legs.map((l) => l.outcome));
      await query(`UPDATE tickets SET outcome_status=$2, settled_at=CASE WHEN $2='PENDING' THEN NULL ELSE now() END WHERE id=$1`, [t, o]);
    }
    return { checkedFixtures: due.length, sourceErrors, ticketsChecked: touched.size };
    });
  } catch (error) {
    console.warn(JSON.stringify({ event: 'settlement_failed', message: (error as Error).message }));
    return { status: 'failed' as const, error: (error as Error).message };
  } finally {
    state.running = false;
  }
}
