import { isD1, many, query, SQL_NOW, SQL_AGO, timeCompare } from '../db';
import { sportsGet } from './http';
import { espnSummary } from './espn';

/**
 * Results for Stake-only fixtures (owner question 13.11: „biletele alea nu se mai actualizează?”).
 * Those matches have no ESPN id, so the normal settlement never saw them and the legs stayed pending.
 * ESPN's all-competitions scoreboard (`soccer/all`) does list them (Nations League, friendlies, U21, cups, small leagues):
 * a fixture is matched by kickoff time and both team names, then its 90-minute score, half-time score, corners and
 * cards are read from the match summary. Anything ambiguous is left for the manual result form.
 */
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all';

type Obj = Record<string, any>;
export type EspnEvent = { id: string; kickoff: number; home: string[]; away: string[]; state: string; status: string };

const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'ca', 'cs', 'fk', 'sk', 'if', 'bk', 'club', 'de', 'del', 'la', 'el', 'the', 'sa', 'cv', 'ud', 'sd', 'rc', 'rcd', 'ss', 'as', 'us', 'nk', 'and', 'y', 'e']);
const ALIASES: Array<[RegExp, string]> = [
  [/\bt(u|ue)rkiye\b/g, 'turkey'], [/\bczechia\b/g, 'czech republic'], [/\bkorea republic\b|\brepublic of korea\b/g, 'south korea'],
  [/\bkorea dpr\b|\bdpr korea\b/g, 'north korea'], [/\bir iran\b/g, 'iran'], [/\busa\b/g, 'united states'], [/\bcote d ?ivoire\b/g, 'ivory coast'],
  [/\bcabo verde\b/g, 'cape verde'], [/\brepublic of ireland\b/g, 'ireland'], [/\bchinese taipei\b/g, 'taiwan'], [/\bcongo dr\b|\bdr congo\b/g, 'democratic republic congo'],
  [/\bcuracao\b/g, 'curacao'], [/\bbosnia herzegovina\b/g, 'bosnia and herzegovina'], [/\bfyr macedonia\b/g, 'north macedonia'], [/\batletico\b/g, 'atletico'],
];
/** Markers that must agree on both sides (an under-21 match is not the senior one, women are not men). */
const MARKERS = ['u17', 'u18', 'u19', 'u20', 'u21', 'u23', 'women', 'ii', 'b'];

export function normalizeTeam(name: string) {
  let s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\bwomen'?s?\b|\bfemenil\b|\bfeminin[oa]?\b|\b\(w\)\b/g, ' women ').replace(/\bunder ?(\d\d)\b/g, 'u$1');
  for (const [re, to] of ALIASES) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}
const tokens = (name: string) => normalizeTeam(name).split(' ').filter((t) => t && !STOP.has(t));
const markers = (t: string[]) => MARKERS.filter((m) => t.includes(m)).sort().join(',');

/** 0…1: how surely two spellings name the same team. */
export function teamSimilarity(a: string, b: string) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length || markers(ta) !== markers(tb)) return 0;
  const A = new Set(ta.filter((t) => !MARKERS.includes(t))), B = new Set(tb.filter((t) => !MARKERS.includes(t)));
  if (!A.size || !B.size) return 0;
  const common = [...A].filter((t) => B.has(t)).length;
  if (common === A.size && common === B.size) return 1;
  if (common && (common === A.size || common === B.size)) return 0.9; // „Estudiantes La Plata” ⊂ „Estudiantes de La Plata”
  return common / new Set([...A, ...B]).size;
}

/** The ESPN event for a Stake fixture, or null when none (or more than one) fits. */
export function matchEvent(f: { home: string; away: string; kickoff: number }, events: EspnEvent[]) {
  const scored = events.filter((e) => Math.abs(e.kickoff - f.kickoff) <= 35 * 60_000).map((e) => {
    const h = Math.max(...e.home.map((n) => teamSimilarity(f.home, n))), a = Math.max(...e.away.map((n) => teamSimilarity(f.away, n)));
    return { e, h, a, score: h + a };
  }).filter((x) => x.h >= 0.5 && x.a >= 0.5).sort((x, y) => y.score - x.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[1].score >= scored[0].score - 0.2) return null; // ambiguous: leave it to the owner
  return scored[0].e;
}

export function parseScoreboard(data: Obj): EspnEvent[] {
  return (Array.isArray(data?.events) ? data.events : []).flatMap((e: Obj) => {
    const c = e?.competitions?.[0];
    const side = (s: string) => (c?.competitors ?? []).find((x: Obj) => x.homeAway === s)?.team ?? {};
    const names = (t: Obj) => [t.displayName, t.shortDisplayName, t.name, t.location].filter((x): x is string => typeof x === 'string' && x.length > 0);
    const kickoff = Date.parse(e?.date ?? '');
    if (!e?.id || !Number.isFinite(kickoff) || !names(side('home')).length || !names(side('away')).length) return [];
    return [{ id: String(e.id), kickoff, home: names(side('home')), away: names(side('away')), state: String(c?.status?.type?.state ?? ''), status: String(c?.status?.type?.name ?? '') }];
  });
}

/** Fixtures read per settlement page (a Worker pass keeps its D1 and network work small). */
export const STAKE_RESULTS_PAGE = () => (isD1() ? 6 : 40);
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');

/** Final facts from a finished match summary: the 90-minute score (extra time excluded), half time, corners, cards. */
export function summaryFacts(sm: Obj) {
  const comps: Obj[] = sm?.header?.competitions?.[0]?.competitors ?? [];
  const team = (s: string) => comps.find((x) => x.homeAway === s);
  const periods = (s: string) => (team(s)?.linescores ?? []).map((l: Obj) => Number(l?.displayValue ?? l?.value));
  const ph = periods('home'), pa = periods('away');
  const total = (s: string) => Number(team(s)?.score);
  let home: number | null = null, away: number | null = null;
  if (ph.length >= 2 && pa.length >= 2 && [ph[0], ph[1], pa[0], pa[1]].every(Number.isFinite)) { home = ph[0] + ph[1]; away = pa[0] + pa[1]; }
  else if (ph.length <= 2 && pa.length <= 2 && Number.isFinite(total('home')) && Number.isFinite(total('away'))) { home = total('home'); away = total('away'); }
  const ht = ph.length && pa.length && Number.isFinite(ph[0]) && Number.isFinite(pa[0]) ? [ph[0], pa[0]] as const : null;
  const box: Obj[] = sm?.boxscore?.teams ?? [];
  const stat = (s: string, name: string) => {
    // Boxscore teams are not always tagged home/away: then the home side is found by team id (as the ESPN settlement does).
    const homeId = team('home')?.team?.id;
    const t = box.find((x) => (x.homeAway ? x.homeAway === s : homeId !== undefined && (x.team?.id === homeId) === (s === 'home')));
    const v = Number((t?.statistics ?? []).find((x: Obj) => x.name === name)?.displayValue);
    return Number.isFinite(v) ? v : null;
  };
  const cards = (s: string) => { const y = stat(s, 'yellowCards'), r = stat(s, 'redCards'); return y === null ? null : y + (r ?? 0); };
  return { home, away, ht, corners: [stat('home', 'wonCorners'), stat('away', 'wonCorners')] as const, cards: [cards('home'), cards('away')] as const };
}

export async function settleStakeFromEspn() {
  const due = await many<{ id: string; home_team: string; away_team: string; kickoff_utc: string | Date }>(
    `SELECT f.id, f.home_team, f.away_team, f.kickoff_utc FROM fixtures f
      WHERE f.provider='stake' AND f.status NOT IN ('post','cancelled') AND ${timeCompare('f.kickoff_utc', '<=', SQL_AGO(110, 'minutes'))}
        AND ${timeCompare('f.kickoff_utc', '>', SQL_AGO(7 * 24, 'hours'))}
        AND (f.results_checked_at IS NULL OR ${timeCompare('f.results_checked_at', '<', SQL_AGO(15, 'minutes'))})
        AND (EXISTS (SELECT 1 FROM ticket_selections s WHERE s.fixture_id=f.id AND s.outcome='PENDING')
          OR EXISTS (SELECT 1 FROM agent_predictions p WHERE p.fixture_id=f.id AND p.decision='BET_CANDIDATE' AND p.outcome IS NULL))
      ORDER BY f.results_checked_at NULLS FIRST, f.kickoff_utc LIMIT ${STAKE_RESULTS_PAGE()}`);
  if (!due.length) return { checked: 0, settled: 0, failures: 0 };
  let failures = 0, settled = 0;
  const boards = new Map<string, EspnEvent[]>();
  const board = async (day: string) => {
    if (!boards.has(day)) {
      const data = await sportsGet<Obj>(`${BASE}/scoreboard?dates=${day}&limit=1000`, { provider: 'espn', ttlMs: 10 * 60_000 }).catch(() => { failures++; return null; });
      boards.set(day, data ? parseScoreboard(data) : []);
    }
    return boards.get(day)!;
  };
  for (const f of due) {
    const kickoff = Date.parse(new Date(f.kickoff_utc).toISOString());
    // ESPN files evening games under the US date, so the day before is read too.
    const days = [...new Set([ymd(kickoff), ymd(kickoff - 8 * 3600_000)])];
    const events = (await Promise.all(days.map(board))).flat();
    const e = matchEvent({ home: f.home_team, away: f.away_team, kickoff }, events);
    if (e && /POSTPONED|CANCELED|CANCELLED|ABANDONED/.test(e.status)) {
      await query(`UPDATE fixtures SET status=$2, results_checked_at=${SQL_NOW()} WHERE id=$1 AND provider='stake'`, [f.id, /POSTPONED/.test(e.status) ? 'postponed' : 'cancelled']);
      settled++;
      continue;
    }
    if (e && e.state === 'post') {
      const sm = await espnSummary('all', e.id, 10 * 60_000).catch(() => { failures++; return null; });
      const facts = sm ? summaryFacts(sm) : null;
      if (facts && facts.home !== null && facts.away !== null) {
        await query(`UPDATE fixtures SET status='post', home_score=$2, away_score=$3, ht_home=$4, ht_away=$5, corners_home=$6, corners_away=$7, cards_home=$8, cards_away=$9,
            live_clock=NULL, source_observed_at=${SQL_NOW()}, results_checked_at=${SQL_NOW()}, updated_at=${SQL_NOW()} WHERE id=$1 AND provider='stake'`,
          [f.id, facts.home, facts.away, facts.ht?.[0] ?? null, facts.ht?.[1] ?? null, facts.corners[0], facts.corners[1], facts.cards[0], facts.cards[1]]);
        settled++;
        continue;
      }
    }
    await query(`UPDATE fixtures SET results_checked_at=${SQL_NOW()} WHERE id=$1`, [f.id]);
  }
  return { checked: due.length, settled, failures };
}
