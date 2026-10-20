import { many, query } from './db';
import { espnLeagueDay } from './sports/espn';
import { getLeagues, persistFixtures } from './sports/fixtures';
import { localDate, yyyymmdd } from './time';

/** Canonical settlement for the market keys this app produces. Returns null when not decidable. */
export function settleMarket(key: string, home: number, away: number): 'WON' | 'LOST' | null {
  const [type, side, lineRaw] = key.split(':');
  const line = Number(lineRaw);
  switch (type) {
    case '1X2': return (side === 'HOME' ? home > away : side === 'AWAY' ? away > home : home === away) ? 'WON' : 'LOST';
    case 'DC': return (side === '1X' ? home >= away : side === 'X2' ? away >= home : home !== away) ? 'WON' : 'LOST';
    case 'TOTAL': return (side === 'OVER' ? home + away > line : home + away < line) ? 'WON' : 'LOST';
    case 'AH': return (side === 'HOME' ? home + line > away : away + line > home) ? 'WON' : 'LOST';
    case 'TT': { const goals = side === 'HOME' ? home : away; const l = Number(key.split(':')[3]); return (key.split(':')[2] === 'OVER' ? goals > l : goals < l) ? 'WON' : 'LOST'; }
    default: return null;
  }
}

export function ticketOutcome(outcomes: string[]): 'PENDING' | 'WON' | 'LOST' | 'VOID' | 'PARTIAL_VOID' {
  if (outcomes.includes('LOST')) return 'LOST';
  if (outcomes.includes('PENDING')) return 'PENDING';
  if (outcomes.every((o) => o === 'VOID')) return 'VOID';
  return outcomes.includes('VOID') ? 'PARTIAL_VOID' : 'WON';
}

/** Settles every agent pick (not only ticket legs) so each agent builds a verified track record. */
export async function settleAgentPredictions() {
  const rows = await many<{ id: string; market_key: string; status: string; home_score: number | null; away_score: number | null; kickoff_utc: Date }>(
    `SELECT p.id, p.market_key, f.status, f.home_score, f.away_score, f.kickoff_utc FROM agent_predictions p JOIN fixtures f ON f.id=p.fixture_id
     WHERE p.decision='BET_CANDIDATE' AND p.market_key IS NOT NULL AND p.outcome IS NULL AND f.status IN ('post','cancelled','postponed') LIMIT 2000`,
  );
  for (const r of rows) {
    let outcome: string | null = null;
    if (r.status === 'post' && r.home_score !== null && r.away_score !== null) outcome = settleMarket(r.market_key, r.home_score, r.away_score);
    else if (r.status === 'cancelled' || (r.status === 'postponed' && Date.now() - new Date(r.kickoff_utc).getTime() > 48 * 3600_000)) outcome = 'VOID';
    if (outcome) await query('UPDATE agent_predictions SET outcome=$2, settled_at=now() WHERE id=$1', [r.id, outcome]);
  }
}

let running = false;
/** Deterministic, non-AI settlement of finished fixtures. Original prices and predictions are never changed. */
export async function settlePending() {
  if (running) return;
  running = true;
  try {
    const due = await many<{ fixture_id: string; kickoff_utc: Date; league_id: string; status: string }>(
      `SELECT DISTINCT f.id AS fixture_id, f.kickoff_utc, f.league_id, f.status FROM fixtures f
       WHERE f.kickoff_utc < now() - interval '2 hours' AND f.provider='espn' AND f.status NOT IN ('post','cancelled') AND (
         EXISTS (SELECT 1 FROM ticket_selections s WHERE s.fixture_id=f.id AND s.outcome='PENDING') OR
         EXISTS (SELECT 1 FROM agent_predictions p WHERE p.fixture_id=f.id AND p.decision='BET_CANDIDATE' AND p.outcome IS NULL))
       LIMIT 60`,
    );
    if (due.length) {
    const leagues = await getLeagues({ top10Only: false });
    const days = new Map<string, Set<string>>();
    for (const d of due) {
      const key = `${d.league_id}|${localDate(new Date(d.kickoff_utc))}`;
      days.set(key, (days.get(key) ?? new Set()).add(d.fixture_id));
    }
    for (const [key] of days) {
      const [leagueId, date] = key.split('|');
      const league = leagues.find((l) => l.id === leagueId);
      if (!league) continue;
      const fixtures = await espnLeagueDay(league, yyyymmdd(date)).catch(() => []);
      await persistFixtures(fixtures.map((f) => ({ ...f, odds: null })));
    }
    }
    await settleAgentPredictions();
    const rows = await many<{ id: string; ticket_id: string; market_key: string; status: string; home_score: number | null; away_score: number | null; kickoff_utc: Date }>(
      `SELECT s.id, s.ticket_id, s.market_key, f.status, f.home_score, f.away_score, f.kickoff_utc FROM ticket_selections s JOIN fixtures f ON f.id=s.fixture_id WHERE s.outcome='PENDING'`,
    );
    const touched = new Set<string>();
    for (const r of rows) {
      let outcome: string | null = null;
      if (r.status === 'post' && r.home_score !== null && r.away_score !== null) outcome = settleMarket(r.market_key, r.home_score, r.away_score);
      else if (r.status === 'cancelled' || (r.status === 'postponed' && Date.now() - new Date(r.kickoff_utc).getTime() > 48 * 3600_000)) outcome = 'VOID';
      if (outcome) { await query('UPDATE ticket_selections SET outcome=$2 WHERE id=$1', [r.id, outcome]); touched.add(r.ticket_id); }
    }
    for (const t of touched) {
      const legs = await many<{ outcome: string }>('SELECT outcome FROM ticket_selections WHERE ticket_id=$1', [t]);
      const o = ticketOutcome(legs.map((l) => l.outcome));
      await query(`UPDATE tickets SET outcome_status=$2, settled_at=CASE WHEN $2='PENDING' THEN NULL ELSE now() END WHERE id=$1`, [t, o]);
    }
  } catch (error) {
    console.warn(JSON.stringify({ event: 'settlement_failed', message: (error as Error).message }));
  } finally {
    running = false;
  }
}
