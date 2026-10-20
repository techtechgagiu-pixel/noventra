import type { Fixture, FixtureStatus, HistoricalMatch, League, MarketQuote, OddsSnapshot, TeamContext } from './types';
import { sportsGet } from './http';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);
const numOrNull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** American odds (+340 / -140 / EVEN) → decimal, rounded to 3 places. */
export function americanToDecimal(raw: unknown): number | null {
  if (raw === 'EVEN' || raw === 'even') return 2;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace('+', '')) : NaN;
  if (!Number.isFinite(value) || value === 0) return null;
  const decimal = value > 0 ? 1 + value / 100 : 1 + 100 / Math.abs(value);
  return Math.round(decimal * 1000) / 1000;
}

function mapStatus(type: Obj): FixtureStatus {
  const state = str(type.state);
  const name = (str(type.name) || '').toUpperCase();
  if (name.includes('POSTPONED')) return 'postponed';
  if (name.includes('CANCELED') || name.includes('CANCELLED') || name.includes('ABANDONED')) return 'cancelled';
  if (state === 'in') return 'in';
  if (state === 'post') return 'post';
  return 'pre';
}

const sideLine = (side: Obj) => obj(side.close).odds ?? obj(side.open).odds;

/** Parses ESPN's embedded bookmaker odds (DraftKings in the soccer feed) without altering prices. */
export function parseEspnOdds(rawOdds: unknown, home: string, away: string, observedAt: string): OddsSnapshot | null {
  const book = arr(rawOdds).map(obj).find((o) => obj(o.moneyline).home || obj(o.homeTeamOdds).moneyLine !== undefined);
  if (!book) return null;
  const provider = obj(book.provider);
  const markets: MarketQuote[] = [];
  const ml = obj(book.moneyline);
  const push = (q: MarketQuote | null) => { if (q && q.odds > 1.01) markets.push(q); };
  const home1 = americanToDecimal(sideLine(obj(ml.home)) ?? obj(book.homeTeamOdds).moneyLine);
  const draw = americanToDecimal(sideLine(obj(ml.draw)) ?? obj(book.drawOdds).moneyLine);
  const away2 = americanToDecimal(sideLine(obj(ml.away)) ?? obj(book.awayTeamOdds).moneyLine);
  if (home1) push({ key: '1X2:HOME', label: `${home} câștigă (1)`, marketType: '1X2', odds: home1 });
  if (draw) push({ key: '1X2:DRAW', label: 'Egal (X)', marketType: '1X2', odds: draw });
  if (away2) push({ key: '1X2:AWAY', label: `${away} câștigă (2)`, marketType: '1X2', odds: away2 });

  const total = obj(book.total);
  const line = numOrNull(book.overUnder);
  if (line !== null && Math.abs(line % 1) === 0.5) {
    const over = americanToDecimal(sideLine(obj(total.over)) ?? book.overOdds);
    const under = americanToDecimal(sideLine(obj(total.under)) ?? book.underOdds);
    if (over) push({ key: `TOTAL:OVER:${line}`, label: `Peste ${line} goluri`, marketType: 'TOTAL', odds: over, line });
    if (under) push({ key: `TOTAL:UNDER:${line}`, label: `Sub ${line} goluri`, marketType: 'TOTAL', odds: under, line });
  }

  // Spread ±0.5 in a 3-way market is equivalent to double chance (1X / X2). Other .5 lines are Asian handicaps.
  const spread = obj(book.pointSpread);
  for (const side of ['home', 'away'] as const) {
    const s = obj(spread[side]);
    const lineRaw = str(obj(s.close).line) ?? str(obj(s.open).line);
    const price = americanToDecimal(sideLine(s));
    const l = lineRaw ? Number(lineRaw) : NaN;
    if (!price || !Number.isFinite(l) || Math.abs(l % 1) !== 0.5) continue;
    const team = side === 'home' ? home : away;
    if (l === 0.5) push({ key: side === 'home' ? 'DC:1X' : 'DC:X2', label: side === 'home' ? `${home} sau egal (1X)` : `Egal sau ${away} (X2)`, marketType: 'DOUBLE_CHANCE', odds: price });
    else push({ key: `AH:${side.toUpperCase()}:${l}`, label: `${team} handicap ${l > 0 ? '+' : ''}${l}`, marketType: 'HANDICAP', odds: price, line: l });
  }
  if (!markets.length) return null;
  return { bookmaker: str(provider.displayName) || str(provider.name) || 'Necunoscut', source: 'ESPN (cote furnizate de bookmaker)', observedAt, providerUpdatedAt: null, markets };
}

export function parseScoreboardEvent(raw: unknown, league: League, observedAt: string): Fixture | null {
  const e = obj(raw);
  const c = obj(arr(e.competitions)[0]);
  const competitors = arr(c.competitors).map(obj);
  const h = competitors.find((x) => x.homeAway === 'home');
  const a = competitors.find((x) => x.homeAway === 'away');
  const id = str(e.id);
  const date = str(e.date);
  if (!h || !a || !id || !date || !Number.isFinite(Date.parse(date))) return null;
  const ht = obj(h.team), at = obj(a.team);
  const home = str(ht.displayName) || str(ht.shortDisplayName) || 'Gazde';
  const away = str(at.displayName) || str(at.shortDisplayName) || 'Oaspeți';
  const status = mapStatus(obj(obj(c.status).type));
  return {
    id: `espn:${id}`, provider: 'espn', providerId: id, leagueId: league.id, leagueKey: league.providerKey, leagueName: league.name, country: league.country,
    home, away, homeTeamId: str(ht.id), awayTeamId: str(at.id), homeLogo: str(ht.logo), awayLogo: str(at.logo),
    kickoff: new Date(date).toISOString(), status,
    homeScore: status === 'pre' ? null : numOrNull(h.score), awayScore: status === 'pre' ? null : numOrNull(a.score),
    odds: status === 'pre' ? parseEspnOdds(c.odds, home, away, observedAt) : null,
    fetchedAt: observedAt,
  };
}

export async function espnLeagueDay(league: League, yyyymmdd: string): Promise<Fixture[]> {
  const data = obj(await sportsGet(`${BASE}/${league.providerKey}/scoreboard?dates=${yyyymmdd}`, { provider: 'espn', ttlMs: 10 * 60_000 }));
  const observedAt = new Date().toISOString();
  return arr(data.events).flatMap((e) => {
    const f = parseScoreboardEvent(e, league, observedAt);
    return f ? [f] : [];
  });
}

export async function espnSummary(leagueKey: string, eventId: string, ttlMs = 10 * 60_000): Promise<Obj> {
  if (!/^[a-z0-9.]+$/.test(leagueKey) || !/^\d+$/.test(eventId)) throw new Error('Identificator de meci invalid');
  return obj(await sportsGet(`${BASE}/${leagueKey}/summary?event=${eventId}`, { provider: 'espn', ttlMs }));
}

/** Team standing from the summary's league table. */
export function standingFor(summary: Obj, teamId?: string): TeamContext['standing'] {
  if (!teamId) return null;
  for (const group of arr(obj(summary.standings).groups)) {
    for (const entry of arr(obj(obj(group).standings).entries).map(obj)) {
      if (str(entry.id) !== teamId) continue;
      const stats = arr(entry.stats).map(obj);
      const stat = (name: string) => numOrNull(stats.find((s) => s.name === name)?.value);
      return { rank: stat('rank'), played: stat('gamesPlayed'), points: stat('points'), goalDifference: stat('pointDifferential') };
    }
  }
  return null;
}

function teamStat(team: Obj, name: string) {
  return numOrNull(arr(team.statistics).map(obj).find((s) => s.name === name)?.displayValue);
}

/** Builds a HistoricalMatch from a finished match summary, from the given team's perspective. */
export function historicalFromSummary(summary: Obj, teamId: string, eventKey: string): HistoricalMatch | null {
  const header = obj(summary.header);
  const comp = obj(arr(header.competitions)[0]);
  const status = obj(obj(comp.status).type);
  if (str(status.state) !== 'post') return null;
  const competitors = arr(comp.competitors).map(obj);
  const me = competitors.find((c) => str(obj(c.team).id) === teamId);
  const opp = competitors.find((c) => str(obj(c.team).id) !== teamId);
  if (!me || !opp) return null;
  const gf = numOrNull(me.score), ga = numOrNull(opp.score);
  if (gf === null || ga === null) return null;
  const teams = arr(obj(summary.boxscore).teams).map(obj);
  const myBox = teams.find((t) => str(obj(t.team).id) === teamId) ?? {};
  const oppBox = teams.find((t) => str(obj(t.team).id) !== teamId) ?? {};
  const details = arr(comp.details).map(obj);
  const scoring = details.filter((d) => d.scoringPlay === true);
  const forTeam = (d: Obj) => str(obj(d.team).id) === teamId;
  const keyEvents = arr(summary.keyEvents).map(obj);
  const goalTexts = keyEvents.filter((k) => k.scoringPlay === true).map((k) => ({ team: str(obj(k.team).id), text: (str(k.text) || '').toLowerCase() }));
  const reds = details.filter((d) => d.redCard === true);
  const minute = (d: Obj) => numOrNull(obj(d.clock).value);
  const venue = str(me.homeAway) === 'home' ? 'home' : 'away';
  const hasDetails = details.length > 0 || scoring.length === 0;
  return {
    eventKey, date: str(comp.date) || str(header.date) || '', competition: str(obj(header.league).name) || 'Campionat',
    venue, opponent: str(obj(opp.team).displayName) || 'Adversar', goalsFor: gf, goalsAgainst: ga,
    result: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
    shots: teamStat(myBox, 'totalShots'), shotsOnTarget: teamStat(myBox, 'shotsOnTarget'),
    opponentShots: teamStat(oppBox, 'totalShots'), opponentShotsOnTarget: teamStat(oppBox, 'shotsOnTarget'),
    possession: teamStat(myBox, 'possessionPct'),
    redCardsFor: hasDetails ? reds.filter((d) => forTeam(d)).length : teamStat(myBox, 'redCards'),
    redCardsAgainst: hasDetails ? reds.filter((d) => !forTeam(d)).length : teamStat(oppBox, 'redCards'),
    penaltyGoalsFor: hasDetails ? scoring.filter((d) => forTeam(d) && d.penaltyKick === true).length : teamStat(myBox, 'penaltyKickGoals'),
    penaltyGoalsAgainst: hasDetails ? scoring.filter((d) => !forTeam(d) && d.penaltyKick === true).length : teamStat(oppBox, 'penaltyKickGoals'),
    // ESPN attributes own goals to the benefiting team.
    ownGoalsFor: hasDetails ? scoring.filter((d) => forTeam(d) && d.ownGoal === true).length : null,
    ownGoalsAgainst: hasDetails ? scoring.filter((d) => !forTeam(d) && d.ownGoal === true).length : null,
    deflectedGoalsFor: goalTexts.length ? goalTexts.filter((g) => g.team === teamId && g.text.includes('deflect')).length : null,
    earlyRedCard: hasDetails ? reds.some((d) => (minute(d) ?? 9999) < 1800) : null,
    xg: null,
    source: 'ESPN · rezumat meci',
  };
}

/** Past league matches for a team from its season schedule, strictly before `before`. */
/**
 * Completed official matches of a team before `before`, across ALL competitions (league, European cups, domestic cups),
 * friendlies excluded. A cup fixture therefore gets the team's full recent form, not only its 2–3 cup games.
 * Falls back to the fixture's own league schedule if the cross-competition feed is unavailable.
 */
export async function espnTeamPastEvents(leagueKey: string, teamId: string, before: string, limit = 10) {
  if (!/^\d+$/.test(teamId)) return [];
  const cutoff = Math.min(Date.parse(before), Date.now());
  const pick = (data: Obj, source: string) => arr(data.events).map(obj)
    .filter((e) => {
      const state = str(obj(obj(obj(arr(e.competitions)[0]).status).type).state);
      const d = Date.parse(str(e.date) || '');
      const competition = str(obj(e.league).name) ?? '';
      return state === 'post' && Number.isFinite(d) && d < cutoff && !/friendly|amical/i.test(competition);
    })
    .sort((a, b) => Date.parse(str(b.date)!) - Date.parse(str(a.date)!))
    .slice(0, limit)
    .map((e) => ({ eventId: str(e.id)!, date: str(e.date)!, leagueKey: source, competition: str(obj(e.league).name) ?? null }));
  try {
    const all = pick(obj(await sportsGet(`${BASE}/all/teams/${teamId}/schedule`, { provider: 'espn', ttlMs: 6 * 3600_000 })), 'all');
    if (all.length) return all;
  } catch { /* fall back to the league feed below */ }
  return pick(obj(await sportsGet(`${BASE}/${leagueKey}/teams/${teamId}/schedule`, { provider: 'espn', ttlMs: 6 * 3600_000 })), leagueKey);
}

// ── Extra markets (ESPN core odds API) ─────────────────────────────────────────
const CORE = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues';

/** "14/5" → 3.8; "evens" → 2. Returns null when not parseable. */
export function fractionalToDecimal(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  if (/^evens?$/i.test(raw.trim())) return 2;
  const m = raw.trim().match(/^(\d+)\/(\d+)$/);
  if (!m || Number(m[2]) === 0) return null;
  return Math.round((1 + Number(m[1]) / Number(m[2])) * 1000) / 1000;
}

const teamIdFromRef = (o: Obj) => (str(obj(o.team).$ref) ?? '').match(/\/teams\/(\d+)/)?.[1];

/**
 * Additional priced selections for one fixture, each tagged with its own bookmaker:
 * - Bet365 (labelled fields): 1X2, double chance (1X/X2/12), goal line when it is a .5 line.
 * - DraftKings props: double chance (team-tagged), team totals per line. Over/under labels are
 *   not published, so a line pair is accepted only when one side's prices rise strictly with the
 *   line (that side is "over") and the other's fall — otherwise the market is dropped, never guessed.
 */
export async function espnExtraMarkets(f: { leagueKey: string; providerId: string; home: string; away: string; homeTeamId?: string; awayTeamId?: string }): Promise<MarketQuote[]> {
  if (!/^[a-z0-9.]+$/.test(f.leagueKey) || !/^\d+$/.test(f.providerId)) return [];
  const base = `${CORE}/${f.leagueKey}/events/${f.providerId}/competitions/${f.providerId}/odds`;
  const out: MarketQuote[] = [];
  const add = (q: MarketQuote | null) => { if (q && q.odds > 1.01 && !out.some((x) => x.key === q.key)) out.push(q); };
  let items: Obj[] = [];
  try { items = arr(obj(await sportsGet(`${base}?lang=en&region=us`, { provider: 'espn', ttlMs: 10 * 60_000 })).items).map(obj); } catch { return []; }

  // Bet365 block
  const b365 = items.find((i) => /bet ?365/i.test(str(obj(i.provider).name) ?? ''));
  const t = obj(obj(b365?.bettingOdds).teamOdds);
  const fr = (k: string) => fractionalToDecimal(obj(t[k]).value);
  if (b365) {
    const bk = 'Bet365';
    const h = fr('preMatchFullTimeResultHome'), d = fr('preMatchFullTimeResultDraw'), a = fr('preMatchFullTimeResultAway');
    if (h) add({ key: '1X2:HOME', label: `${f.home} câștigă (1)`, marketType: '1X2', odds: h, bookmaker: bk });
    if (d) add({ key: '1X2:DRAW', label: 'Egal (X)', marketType: '1X2', odds: d, bookmaker: bk });
    if (a) add({ key: '1X2:AWAY', label: `${f.away} câștigă (2)`, marketType: '1X2', odds: a, bookmaker: bk });
    const dc1x = fr('preMatchDoubleChanceHomeOrDraw'), dcx2 = fr('preMatchDoubleChanceDrawOrAway'), dc12 = fr('preMatchDoubleChanceHomeOrAway');
    if (dc1x) add({ key: 'DC:1X', label: `${f.home} sau egal (1X)`, marketType: 'DOUBLE_CHANCE', odds: dc1x, bookmaker: bk });
    if (dcx2) add({ key: 'DC:X2', label: `Egal sau ${f.away} (X2)`, marketType: 'DOUBLE_CHANCE', odds: dcx2, bookmaker: bk });
    if (dc12) add({ key: 'DC:12', label: `${f.home} sau ${f.away} (12)`, marketType: 'DOUBLE_CHANCE', odds: dc12, bookmaker: bk });
    const line = Number(obj(t.preMatchOverUnderHandicap).value);
    if (Number.isFinite(line) && Math.abs(line % 1) === 0.5) {
      const o = fr('preMatchGoalLineOver'), u = fr('preMatchGoalLineUnder');
      if (o) add({ key: `TOTAL:OVER:${line}`, label: `Peste ${line} goluri`, marketType: 'TOTAL', odds: o, line, bookmaker: bk });
      if (u) add({ key: `TOTAL:UNDER:${line}`, label: `Sub ${line} goluri`, marketType: 'TOTAL', odds: u, line, bookmaker: bk });
    }
  }

  // DraftKings props
  const dk = items.find((i) => /draftkings/i.test(str(obj(i.provider).name) ?? ''));
  const propsRef = str(obj(dk?.propBets).$ref);
  if (propsRef) {
    try {
      const url = propsRef.replace(/^http:/, 'https:') + (propsRef.includes('?') ? '&' : '?') + 'limit=300';
      const props = arr(obj(await sportsGet(url, { provider: 'espn', ttlMs: 10 * 60_000 })).items).map(obj);
      const price = (p: Obj) => numOrNull(obj(obj(p.current).over).decimal);
      const bk = 'DraftKings';
      for (const p of props.filter((x) => str(obj(x.type).name) === 'Double Chance')) {
        const team = teamIdFromRef(p); const v = price(p);
        if (!v) continue;
        if (team && team === f.homeTeamId) add({ key: 'DC:1X', label: `${f.home} sau egal (1X)`, marketType: 'DOUBLE_CHANCE', odds: v, bookmaker: bk });
        else if (team && team === f.awayTeamId) add({ key: 'DC:X2', label: `Egal sau ${f.away} (X2)`, marketType: 'DOUBLE_CHANCE', odds: v, bookmaker: bk });
        else if (!team) add({ key: 'DC:12', label: `${f.home} sau ${f.away} (12)`, marketType: 'DOUBLE_CHANCE', odds: v, bookmaker: bk });
      }
      for (const [side, teamId, name] of [['HOME', f.homeTeamId, f.home], ['AWAY', f.awayTeamId, f.away]] as const) {
        if (!teamId) continue;
        const rows = props.filter((x) => str(obj(x.type).name) === 'Team Total Goals' && teamIdFromRef(x) === teamId)
          .map((x) => ({ line: numOrNull(obj(obj(x.current).target).value), odds: price(x) }))
          .filter((r): r is { line: number; odds: number } => r.line !== null && r.odds !== null && Math.abs(r.line % 1) === 0.5);
        const byLine = new Map<number, number[]>();
        for (const r of rows) byLine.set(r.line, [...(byLine.get(r.line) ?? []), r.odds]);
        const lines = [...byLine.keys()].filter((l) => byLine.get(l)!.length === 2).sort((x, y) => x - y);
        if (lines.length < 2) continue;
        // Published order is first-of-pair = one side, second = the other. Verify with monotonicity before labelling.
        const first = lines.map((l) => byLine.get(l)![0]), second = lines.map((l) => byLine.get(l)![1]);
        const rising = (xs: number[]) => xs.every((v, i) => i === 0 || v > xs[i - 1]);
        const falling = (xs: number[]) => xs.every((v, i) => i === 0 || v < xs[i - 1]);
        let overs: number[] | null = null, unders: number[] | null = null;
        if (rising(first) && falling(second)) { overs = first; unders = second; }
        else if (rising(second) && falling(first)) { overs = second; unders = first; }
        if (!overs || !unders) continue;
        lines.forEach((l, i) => {
          if (l > 3.5) return;
          add({ key: `TT:${side}:OVER:${l}`, label: `${name} peste ${l} goluri`, marketType: 'TEAM_TOTAL', odds: overs![i], line: l, bookmaker: bk });
          add({ key: `TT:${side}:UNDER:${l}`, label: `${name} sub ${l} goluri`, marketType: 'TEAM_TOTAL', odds: unders![i], line: l, bookmaker: bk });
        });
      }
    } catch { /* props optional */ }
  }
  return out;
}

/** Main snapshot markets keep priority; extra markets fill keys the main bookmaker does not offer. */
export function mergeMarkets(main: MarketQuote[], extra: MarketQuote[], mainBookmaker: string): MarketQuote[] {
  const keys = new Set(main.map((m) => m.key));
  return [...main.map((m) => ({ ...m, bookmaker: m.bookmaker ?? mainBookmaker })), ...extra.filter((m) => !keys.has(m.key))];
}
