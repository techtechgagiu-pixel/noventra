import { many } from '../db';
import type { Statement } from '../d1/client';
import type { ImportedEvent } from './imported-prices';
import { sameImportedMatch } from './imported-prices';

/**
 * Odds movement (owner request 06.11): every Stake import stores the main prices of each match; the agents read how the
 * market moved between the first capture still on record and the latest one. A falling price means money came in on that side.
 */
export type MainPrices = { h: number | null; d: number | null; a: number | null; over25: number | null; btts: number | null };
export type HistoryRow = MainPrices & { capturedAt: string };

export function mainPrices(markets: Array<{ key: string; odds: number }>): MainPrices {
  const get = (k: string) => markets.find((m) => m.key === k)?.odds ?? null;
  return { h: get('1X2:HOME'), d: get('1X2:DRAW'), a: get('1X2:AWAY'), over25: get('TOTAL:OVER:2.5'), btts: get('BTTS:YES') };
}

/** One insert per event; the primary key makes a repeated import of the same export harmless. */
export function historyStatements(events: ImportedEvent[]): Statement[] {
  return events.map((e) => {
    const p = mainPrices(e.markets);
    return {
      text: `INSERT INTO imported_odds_history(source_id,captured_at,home,away,kickoff_utc,h,d,a,over25,btts) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(source_id,captured_at) DO NOTHING`,
      params: [e.sourceId, e.capturedAt, e.home, e.away, e.kickoff, p.h, p.d, p.a, p.over25, p.btts],
    };
  });
}

const MIN_MOVE = 0.04; // below 4 % is noise
const pct = (from: number, to: number) => (to - from) / from;
const fmt = (x: number) => String(Math.round(x * 100) / 100);

/** Pure: rows of one match (any order) → one Romanian line per price that moved at least 4 %, or null. */
export function describeMovement(rows: HistoryRow[], home: string, away: string): string | null {
  const sorted = [...rows].sort((x, y) => Date.parse(x.capturedAt) - Date.parse(y.capturedAt));
  if (sorted.length < 2) return null;
  const first = sorted[0], last = sorted[sorted.length - 1];
  const hours = Math.round((Date.parse(last.capturedAt) - Date.parse(first.capturedAt)) / 3600_000);
  if (hours < 1) return null;
  const items: Array<[string, keyof MainPrices]> = [[`victorie ${home}`, 'h'], ['egal', 'd'], [`victorie ${away}`, 'a'], ['peste 2,5 goluri', 'over25'], ['ambele marchează', 'btts']];
  const moves: string[] = [];
  for (const [label, k] of items) {
    const a = first[k], b = last[k];
    if (a === null || b === null || a <= 1 || b <= 1) continue;
    const c = pct(a, b);
    if (Math.abs(c) >= MIN_MOVE) moves.push(`${label}: ${fmt(a)} → ${fmt(b)} (${c < 0 ? 'scade, piața o susține' : 'crește, piața se retrage'})`);
  }
  return moves.length ? `în ultimele ${hours} h: ${moves.join('; ')}` : `nicio mișcare peste 4% în ultimele ${hours} h`;
}

type Row = { captured_at: string | Date; home: string; away: string; kickoff_utc: string | Date; h: number | null; d: number | null; a: number | null; over25: number | null; btts: number | null };

/** Reads the stored captures of one fixture; never throws (a missing table or a read error just means no movement info). */
export async function loadOddsMovement(f: { home: string; away: string; kickoff: string }): Promise<string | null> {
  try {
    const t = Date.parse(f.kickoff);
    const rows = await many<Row>(
      `SELECT captured_at,home,away,kickoff_utc,h,d,a,over25,btts FROM imported_odds_history WHERE kickoff_utc >= $1 AND kickoff_utc <= $2 AND captured_at >= $3`,
      [new Date(t - 20 * 60_000).toISOString(), new Date(t + 20 * 60_000).toISOString(), new Date(Date.now() - 72 * 3600_000).toISOString()],
    );
    const mine = rows.filter((r) => sameImportedMatch(f, { home: r.home, away: r.away, kickoff: new Date(r.kickoff_utc).toISOString() }));
    return describeMovement(mine.map((r) => ({ capturedAt: new Date(r.captured_at).toISOString(), h: r.h, d: r.d, a: r.a, over25: r.over25, btts: r.btts })), f.home, f.away);
  } catch { return null; }
}
