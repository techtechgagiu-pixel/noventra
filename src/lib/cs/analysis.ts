import { many, one } from '../db';
import type { Fixture } from '../sports/types';
import type { FixtureSnapshot } from '../jobs/types';
import type { ScoutDossier, TeamDossier } from '../scout/dossier';
import type { BriefMatch, MatchBrief } from '../scout/match-brief';
import { modelCsFixture, mapWinProbability, type CsTeamInput } from './model';
import { loadRankings, rankingFor } from './rankings';
import { sameTeam } from './teams';

/**
 * Everything the agents get for a Counter-Strike match, built only from stored data (PandaScore results and the
 * Valve standings). Nothing is invented: a missing ranking or a short history is reported as missing.
 */
type Row = { id: string; begin_at: string | Date; best_of: number | null; team1_id: string | null; team1: string; team2_id: string | null; team2: string; score1: number | null; score2: number | null; winner_id: string | null; tournament: string | null; league: string | null; tier: string | null; status: string };
export type CsGame = { date: string; opponent: string; won: boolean; mapsFor: number; mapsAgainst: number; bestOf: number | null; event: string | null; tier: string | null };
export type CsContext = {
  bestOf: number | null; tournament: string | null; tier: string | null;
  home: { rank: number | null; points: number | null; roster: string[] }; away: { rank: number | null; points: number | null; roster: string[] };
  rankingsAsOf: string | null; mapWinHome: number | null;
};

const iso = (v: string | Date) => new Date(v).toISOString();
const TIER: Record<string, string> = { s: 'S (elită)', a: 'A', b: 'B', c: 'C', d: 'D' };
const tierText = (t: string | null) => (t ? TIER[t.toLowerCase()] ?? t.toUpperCase() : 'necunoscut');

/** Finished matches of a team before the kickoff (by PandaScore team id, else by name), newest first. */
export async function csHistory(teamId: string | null | undefined, name: string, before: string, limit = 10): Promise<CsGame[]> {
  const rows = teamId
    ? await many<Row>(`SELECT * FROM cs_matches WHERE status='finished' AND begin_at < $2 AND (team1_id=$1 OR team2_id=$1) ORDER BY begin_at DESC LIMIT ${limit}`, [teamId, before])
    : (await many<Row>(`SELECT * FROM cs_matches WHERE status='finished' AND begin_at < $1 ORDER BY begin_at DESC LIMIT 3000`, [before])).filter((r) => sameTeam(r.team1, name) || sameTeam(r.team2, name)).slice(0, limit);
  return rows.flatMap((r) => {
    const first = teamId ? r.team1_id === teamId : sameTeam(r.team1, name);
    const mf = first ? r.score1 : r.score2, ma = first ? r.score2 : r.score1;
    if (mf === null || ma === null) return [];
    const myId = first ? r.team1_id : r.team2_id;
    return [{ date: iso(r.begin_at), opponent: first ? r.team2 : r.team1, won: r.winner_id ? r.winner_id === myId : mf > ma, mapsFor: mf, mapsAgainst: ma, bestOf: r.best_of, event: r.tournament ?? r.league, tier: r.tier }];
  });
}

async function headToHead(f: Fixture): Promise<BriefMatch[]> {
  const rows = f.homeTeamId && f.awayTeamId
    ? await many<Row>(`SELECT * FROM cs_matches WHERE status='finished' AND begin_at < $3 AND ((team1_id=$1 AND team2_id=$2) OR (team1_id=$2 AND team2_id=$1)) ORDER BY begin_at DESC LIMIT 5`, [f.homeTeamId, f.awayTeamId, f.kickoff])
    : [];
  return rows.map((r) => ({ date: iso(r.begin_at), text: `${iso(r.begin_at).slice(0, 10)} ${r.team1} ${r.score1 ?? '?'}-${r.score2 ?? '?'} ${r.team2}`, result: (r.team1_id === f.homeTeamId ? (r.score1 ?? 0) > (r.score2 ?? 0) : (r.score2 ?? 0) > (r.score1 ?? 0)) ? 'W' as const : 'L' as const }));
}

const gameText = (g: CsGame) => `${g.date.slice(0, 10)} ${g.won ? 'V' : 'Î'} ${g.mapsFor}-${g.mapsAgainst} vs ${g.opponent}${g.bestOf ? ` (BO${g.bestOf})` : ''}${g.tier ? ` tier ${g.tier.toUpperCase()}` : ''}`;

function teamDossier(team: string, games: CsGame[], rank: { rank: number; points: number } | null): TeamDossier {
  const n = games.length, w = games.filter((g) => g.won).length;
  const mf = games.reduce((s, g) => s + g.mapsFor, 0), ma = games.reduce((s, g) => s + g.mapsAgainst, 0);
  return {
    team, sample: n, record: { w, d: 0, l: n - w },
    goalsForPerMatch: n ? Math.round((mf / n) * 100) / 100 : null, goalsAgainstPerMatch: n ? Math.round((ma / n) * 100) / 100 : null,
    shotsOnTargetFor: null, shotsOnTargetAgainst: null, finishingDelta: null,
    resultsVsPerformance: `${rank ? `Valve #${rank.rank} (${rank.points} pct)` : 'în afara clasamentului Valve'} · ${n} meciuri: ${w}V-${n - w}Î, hărți ${mf}-${ma}`,
    recent: games.map((g) => ({ date: g.date, venue: '—', opponent: g.opponent, score: `${g.mapsFor}-${g.mapsAgainst}`, result: g.won ? 'V' : 'Î', sot: 'n/d', notes: [g.event ?? '', g.tier ? `tier ${g.tier.toUpperCase()}` : ''].filter(Boolean) })),
    anomalies: [],
  };
}

/** The snapshot pieces for a CS fixture (same shape as football, so voting, the brain and tickets work unchanged). */
export async function buildCsSnapshot(f: Fixture): Promise<Omit<FixtureSnapshot, 'news'> & { cs: CsContext }> {
  const [homeGames, awayGames, h2h, rankings, row] = await Promise.all([
    csHistory(f.homeTeamId, f.home, f.kickoff), csHistory(f.awayTeamId, f.away, f.kickoff), headToHead(f), loadRankings(),
    one<Row>('SELECT * FROM cs_matches WHERE id=$1', [f.providerId]),
  ]);
  const rh = rankingFor(rankings, f.home), ra = rankingFor(rankings, f.away);
  const input = (games: CsGame[], r: typeof rh): CsTeamInput => ({ points: r?.points ?? null, mapsWon: games.reduce((s, g) => s + g.mapsFor, 0), mapsLost: games.reduce((s, g) => s + g.mapsAgainst, 0), matches: games.length });
  const bestOf = row?.best_of ?? null;
  const model = modelCsFixture({ home: input(homeGames, rh), away: input(awayGames, ra), bestOf, markets: f.odds!.markets });
  const missing: string[] = [];
  if (!rh) missing.push(`${f.home} nu apare în clasamentul Valve.`);
  if (!ra) missing.push(`${f.away} nu apare în clasamentul Valve.`);
  if (homeGames.length < 5) missing.push(`${f.home}: doar ${homeGames.length} meciuri încheiate în istoric.`);
  if (awayGames.length < 5) missing.push(`${f.away}: doar ${awayGames.length} meciuri încheiate în istoric.`);
  const dossier: ScoutDossier = {
    mode: 'statistics', modeMessage: 'CS2: forma pe meciuri și hărți (PandaScore) și clasamentul oficial Valve.',
    fixture: { home: f.home, away: f.away, kickoff: f.kickoff, league: row?.tournament ?? f.leagueName },
    home: teamDossier(f.home, homeGames, rh), away: teamDossier(f.away, awayGames, ra), missing,
    sources: ['PandaScore (program, rezultate)', `Valve Regional Standings${rh?.asOf ? ` ${rh.asOf.replaceAll('_', '-')}` : ''}`],
    limitations: ['Fără statistici pe runde sau jucători (plan gratuit).', 'Fără știri pentru CS2.'],
  };
  const standings = { home: rh ? { rank: rh.rank, points: rh.points, played: null } : null, away: ra ? { rank: ra.rank, points: ra.points, played: null } : null };
  const brief: MatchBrief = {
    sport: 'cs2', home: f.home, away: f.away, h2h,
    homeAtHome: homeGames.slice(0, 5).map((g) => ({ date: g.date, text: gameText(g), result: g.won ? 'W' : 'L' })),
    awayAway: awayGames.slice(0, 5).map((g) => ({ date: g.date, text: gameText(g), result: g.won ? 'W' : 'L' })),
    standings, lineups: { home: rh?.roster.length ? rh.roster : null, away: ra?.roster.length ? ra.roster : null }, flags: [], missing,
  };
  const cs: CsContext = {
    bestOf, tournament: row?.tournament ?? row?.league ?? null, tier: row?.tier ?? null,
    home: { rank: rh?.rank ?? null, points: rh?.points ?? null, roster: rh?.roster ?? [] }, away: { rank: ra?.rank ?? null, points: ra?.points ?? null, roster: ra?.roster ?? [] },
    rankingsAsOf: rh?.asOf ?? ra?.asOf ?? null, mapWinHome: mapWinProbability(input(homeGames, rh), input(awayGames, ra)),
  };
  return {
    fixture: { id: f.id, home: f.home, away: f.away, league: `Esports · CS2${cs.tournament ? ` · ${cs.tournament}` : ''}`, leagueKey: f.leagueKey, kickoff: f.kickoff, provider: f.provider, providerId: f.providerId },
    odds: f.odds!, standings, model, dossier, brief, cs,
    dataQuality: { historyHome: homeGames.length, historyAway: awayGames.length, shotsAvailable: false, standings: !!(rh && ra), oddsObservedAt: f.odds!.observedAt },
  };
}

const r2 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

/** What each agent reads for a CS match (instead of the football facts). */
export function csFacts(s: FixtureSnapshot, band: { minOdds: number; maxOdds: number }) {
  const cs = s.cs;
  const team = (t: TeamDossier, r: CsContext['home'] | undefined) => ({
    echipa: t.team, valve: r?.rank ? `#${r.rank}, ${r.points} pct` : 'neclasată', roster: r?.roster.join(', ') || 'n/d',
    forma: `${t.sample} meciuri: ${t.record.w}V-${t.record.l}Î · hărți ${t.goalsForPerMatch ?? 'n/d'} câștigate / ${t.goalsAgainstPerMatch ?? 'n/d'} pierdute pe meci`,
    ultimele: t.recent.slice(0, 6).map((g) => `${g.date.slice(0, 10)} ${g.result} ${g.score} vs ${g.opponent}${g.notes.length ? ` (${g.notes.join(', ')})` : ''}`),
  });
  return {
    fixtureId: s.fixture.id, sport: 'Counter-Strike 2', match: `${s.fixture.home} – ${s.fixture.away}`, competitie: cs?.tournament ?? s.fixture.league,
    format: cs?.bestOf ? `BO${cs.bestOf}` : 'necunoscut (presupus BO3)', tier: tierText(cs?.tier ?? null), kickoffUtc: s.fixture.kickoff,
    gazde: team(s.dossier.home, cs?.home), oaspeti: team(s.dossier.away, cs?.away),
    directe: (s.brief?.h2h ?? []).map((m) => m.text),
    model: { sansaHartaGazde: r2(cs?.mapWinHome), incertitudine: s.model.uncertainty },
    markets: s.model.markets.filter((m) => !/:UNDER(:|$)/.test(m.key) && m.odds >= band.minOdds && m.odds <= band.maxOdds).map((m) => ({ key: m.key, label: m.label, odds: m.odds, fair: r2(m.fairMarketProbability), model: r2(m.modelProbability), est: r2(m.estimatedProbability), ev: r2(m.expectedValue) })),
    missing: s.dossier.missing.slice(0, 3),
  };
}

/** Rules every agent reads before a CS batch (their own character and limits still apply). */
export const CS_BRIEFING = `ATENȚIE: meciurile de mai jos sunt COUNTER-STRIKE 2 (esports), nu fotbal. Scorul final este în HĂRȚI (ex. 2-1 într-un BO3).
Chei valide: ML:HOME / ML:AWAY = echipa câștigă meciul (nu există egal); MH:HOME|AWAY:linie = handicap pe hărți (MH:HOME:-1.5 = gazdele câștigă 2-0 într-un BO3; MH:AWAY:+1.5 = oaspeții câștigă cel puțin o hartă); MT:OVER:2.5 = BO3-ul ajunge la a treia hartă.
Ce cântărești: clasamentul oficial Valve (puncte, loc), forma recentă pe meciuri ȘI pe hărți, nivelul adversarilor (tier S/A > B > C/D), meciurile directe, formatul (BO1 e mult mai imprevizibil decât BO3), rosterul. Nu ai statistici pe runde/jucători: nu le inventa. „sansaHartaGazde” este estimarea modelului pentru o singură hartă.`;
