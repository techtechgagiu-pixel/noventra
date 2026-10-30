import { describe, expect, it } from 'vitest';
import { csFixture, parseCsMatch } from '@/lib/cs/pandascore';
import { candidateDates, parseStandings, rankingFor } from '@/lib/cs/rankings';
import { mapWinProbability, modelCsFixture, seriesScores } from '@/lib/cs/model';
import { parseMarketCatalog, parseOddsBoard, parseOddsFixtures } from '@/lib/cs/oddspapi';
import { csLabel, csQuote, csSelectionWins, swapSide } from '@/lib/cs/markets';
import { sameCsMatch, sameTeam, teamKey } from '@/lib/cs/teams';
import { settleMarket } from '@/lib/settlement';
import { selectionImplies } from '@/lib/stats/engine';
import { parseStakeExport } from '@/lib/sports/imported-prices';

const psMatch = { id: 1201, begin_at: '2026-10-31T15:00:00Z', status: 'finished', match_type: 'best_of', number_of_games: 3, winner_id: 124,
  opponents: [{ type: 'Team', opponent: { id: 124, name: 'Team Spirit', acronym: 'TS', image_url: 'https://x/s.png' } }, { type: 'Team', opponent: { id: 3455, name: 'Vitality', acronym: 'VIT' } }],
  results: [{ team_id: 3455, score: 1 }, { team_id: 124, score: 2 }], league: { name: 'BLAST' }, serie: { full_name: 'Premier Fall 2026' }, tournament: { name: 'Playoffs', tier: 's' } };

describe('PandaScore', () => {
  it('reads a CS match with its map score and turns it into a site fixture', () => {
    const m = parseCsMatch(psMatch)!;
    expect(m).toMatchObject({ id: '1201', bestOf: 3, score1: 2, score2: 1, winnerId: '124', tier: 's', team1: { id: '124', name: 'Team Spirit' }, team2: { name: 'Vitality' } });
    expect(csFixture(m)).toMatchObject({ id: 'ps:1201', provider: 'pandascore', leagueId: 'CS2', home: 'Team Spirit', away: 'Vitality', status: 'post', homeScore: 2, awayScore: 1 });
    expect(csFixture({ ...m, status: 'not_started' })).toMatchObject({ status: 'pre', homeScore: null });
    expect(parseCsMatch({ ...psMatch, opponents: [psMatch.opponents[0]] })).toBeNull();
  });
});

describe('Valve standings and team names', () => {
  const md = `### Standings as of 2026_10_05<br />\n| Standing | Points | Team Name | Roster | |\n| :- | -: | :- | :- | :- |\n| 1        |   2046 | Spirit               | donk, magixx, sh1ro, tN1R, zont1x | [details](x) |\n| 11       |   1596 | BETBOOM              | Boombl4, d1Ledez, Magnojez, S1ren, zorte | [details](y) |`;
  it('parses rank, points and roster', () => {
    expect(parseStandings(md)).toEqual([{ rank: 1, points: 2046, team: 'Spirit', roster: ['donk', 'magixx', 'sh1ro', 'tN1R', 'zont1x'] }, { rank: 11, points: 1596, team: 'BETBOOM', roster: ['Boombl4', 'd1Ledez', 'Magnojez', 'S1ren', 'zorte'] }]);
  });
  it('finds the same team under different spellings', () => {
    const map = new Map(parseStandings(md).map((r) => [teamKey(r.team), { ...r, asOf: '2026_10_05' }]));
    expect(rankingFor(map, 'Team Spirit')?.rank).toBe(1);
    expect(rankingFor(map, 'BetBoom Team')?.rank).toBe(11);
    expect(sameTeam('FUT Esports', 'FUT')).toBe(true); // same key once "Esports" is dropped
    expect(sameTeam('Natus Vincere', 'NAVI')).toBe(false);
    expect(sameTeam('Team Vitality', 'Vitality')).toBe(true);
    expect(sameTeam('BTH E-Sports', 'BTH')).toBe(true);
    expect(sameTeam('Nemiga Gaming', 'Nemiga')).toBe(true);
  });
  it('tries Valve publication dates, newest first', () => {
    const d = candidateDates(new Date('2026-10-30T10:00:00Z'));
    expect(d[0]).toBe('2026_10_05');
    expect(d).toContain('2026_09_07');
    expect(d.every((x) => x <= '2026_10_30')).toBe(true);
  });
});

describe('CS model and markets', () => {
  it('turns a map probability into series probabilities that add up', () => {
    const s = seriesScores(0.6, 3);
    expect(s.reduce((a, x) => a + x.p, 0)).toBeCloseTo(1, 10);
    expect(s.find((x) => x.h === 2 && x.a === 0)!.p).toBeCloseTo(0.36, 10);
    expect(seriesScores(0.7, 1)).toEqual([{ h: 1, a: 0, p: 0.7 }, { h: 0, a: 1, p: 0.30000000000000004 }]);
  });
  it('rates the stronger Valve team higher and blends with the de-margined market', () => {
    const strong = { points: 2000, mapsWon: 18, mapsLost: 8, matches: 10 }, weak = { points: 1500, mapsWon: 8, mapsLost: 16, matches: 10 };
    expect(mapWinProbability(strong, weak)!).toBeGreaterThan(0.9);
    expect(mapWinProbability({ ...strong, points: null }, weak)).toBeNull();
    const markets = ['ML:HOME', 'ML:AWAY', 'MH:HOME:-1.5', 'MH:AWAY:1.5', 'MT:OVER:2.5', 'MT:UNDER:2.5'].map((k, i) => csQuote(k, [1.2, 4.5, 1.7, 2.1, 2.3, 1.6][i], 'A', 'B'));
    const model = modelCsFixture({ home: strong, away: weak, bestOf: 3, markets });
    const ml = model.markets.find((m) => m.key === 'ML:HOME')!;
    expect(ml.fairMarketProbability!).toBeGreaterThan(0.75);
    expect(ml.modelProbability!).toBeGreaterThan(ml.fairMarketProbability!);
    expect(model.bookmakerMargin1x2).toBeGreaterThan(0);
    expect(model.uncertainty).toBe('scăzută');
  });
  it('settles winner, map handicap and total maps from the series score', () => {
    expect(settleMarket('ML:HOME', 2, 1)).toBe('WON');
    expect(settleMarket('MH:HOME:-1.5', 2, 1)).toBe('LOST');
    expect(settleMarket('MH:AWAY:1.5', 2, 1)).toBe('WON');
    expect(settleMarket('MT:OVER:2.5', 2, 1)).toBe('WON');
    expect(settleMarket('MT:OVER:2.5', 2, 0)).toBe('LOST');
    expect(csSelectionWins('ML:AWAY', 0, 1)).toBe(true);
    expect(selectionImplies('MH:HOME:-1.5', 'ML:HOME')).toBe(true);
    expect(selectionImplies('ML:HOME', 'MH:HOME:-1.5')).toBe(false);
    expect(swapSide('MH:HOME:-1.5')).toBe('MH:AWAY:-1.5');
    expect(csLabel('MH:AWAY:1.5', 'Spirit', 'G2')).toBe('G2 handicap +1.5 hărți');
  });
});

describe('OddsPapi', () => {
  const catalog = parseMarketCatalog([
    { sportId: 17, marketId: 171, marketName: 'Winner', handicap: 0, outcomes: [{ outcomeId: 171, outcomeName: '1' }, { outcomeId: 172, outcomeName: '2' }] },
    { sportId: 17, marketId: 173, marketName: 'Total Maps', handicap: 2.5, outcomes: [{ outcomeId: 173, outcomeName: 'Over' }, { outcomeId: 174, outcomeName: 'Under' }] },
    { sportId: 17, marketId: 1725, marketName: 'Maps Handicap', handicap: -1.5, outcomes: [{ outcomeId: 1726, outcomeName: '2' }, { outcomeId: 1725, outcomeName: '1' }] },
    { sportId: 17, marketId: 1747, marketName: 'Map 1 Winner', handicap: 0, outcomes: [] },
    { sportId: 10, marketId: 101, marketName: 'Full Time Result', outcomes: [] },
  ]);
  it('keeps only the CS2 markets we can settle', () => expect(catalog.map((m) => m.id)).toEqual(['171', '173', '1725']));
  it('takes the median price of real bookmakers, oriented to participant 1', () => {
    const p = (price: number) => ({ players: { 0: { price, active: true } } });
    const board = { bookmakerOdds: {
      pinnacle: { markets: { 171: { outcomes: { 171: p(1.5), 172: p(2.6) } }, 1725: { outcomes: { 1725: p(2.4), 1726: p(1.55) } }, 173: { outcomes: { 173: p(2.1), 174: p(1.7) } } } },
      stake: { markets: { 171: { outcomes: { 171: p(1.55), 172: p(2.5) } } } },
      bet365: { markets: { 171: { outcomes: { 171: p(1.45), 172: p(2.7) } } } },
      'bet365+': { markets: { 171: { outcomes: { 171: p(9), 172: p(9) } } } },
      demo: { markets: { 171: { outcomes: { 171: p(9), 172: p(9) } } } },
    } };
    expect(parseOddsBoard(board, catalog).sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: 'MH:AWAY:1.5', odds: 1.55, books: 1 }, { key: 'MH:HOME:-1.5', odds: 2.4, books: 1 },
      { key: 'ML:AWAY', odds: 2.6, books: 3 }, { key: 'ML:HOME', odds: 1.5, books: 3 },
      { key: 'MT:OVER:2.5', odds: 2.1, books: 1 }, { key: 'MT:UNDER:2.5', odds: 1.7, books: 1 },
    ]);
  });
  it('drops a two-way pair whose prices cannot both be right', () => {
    const p = (price: number) => ({ players: { 0: { price, active: true } } });
    const board = { bookmakerOdds: { a: { markets: { 171: { outcomes: { 171: p(1.83), 172: p(1.83) } }, 173: { outcomes: { 173: p(1.56), 174: p(1.04) } } } } } };
    expect(parseOddsBoard(board, catalog).map((m) => m.key).sort()).toEqual(['ML:AWAY', 'ML:HOME']);
  });
  it('reads fixtures by participant names or "A v B"', () => {
    expect(parseOddsFixtures([{ fixtureId: 'f1', participant1Name: 'Spirit', participant2Name: 'G2', startTime: '2026-10-31T15:00:00Z' }, { fixtureId: 'f2', fixtureName: 'MOUZ v FaZe', startTime: '2026-10-31T18:00:00Z' }, { fixtureId: 'x' }]))
      .toEqual([{ id: 'f1', home: 'Spirit', away: 'G2', kickoff: '2026-10-31T15:00:00.000Z', tournament: null }, { id: 'f2', home: 'MOUZ', away: 'FaZe', kickoff: '2026-10-31T18:00:00.000Z', tournament: null }]);
    expect(sameCsMatch({ home: 'Team Spirit', away: 'G2 Esports', kickoff: '2026-10-31T15:00:00Z' }, { home: 'G2', away: 'Spirit', kickoff: '2026-10-31T15:20:00Z' })).toBe('swapped');
  });
});

describe('Stake CS export', () => {
  it('maps winner, map handicap and total maps; other games are refused', () => {
    const at = new Date(Date.now() - 3600_000).toISOString(), k = new Date(Date.now() + 86400_000).toUTCString();
    const o = (name: string, odds: number) => ({ name, odds, active: true });
    const p = parseStakeExport({ meta: { source: 'stake', sport: 'counter-strike', finished_at: at }, data: { matches: [{ source_id: 's1', starts_at: k, participants: [{ name: 'Spirit' }, { name: 'G2' }], markets: [
      { name: 'Match Winner - Twoway', status: 'active', outcomes: [o('Spirit', 1.5), o('G2', 2.6)] },
      { name: 'Match Winner / Map 1 Winner', status: 'active', outcomes: [o('Spirit / Spirit', 2), o('G2 / G2', 2.9)] },
      { name: 'Match Round Handicap', status: 'active', outcomes: [o('Spirit (-10.5)', 4), o('G2 (10.5)', 1.2)] },
      { name: 'Match Total Rounds', status: 'active', outcomes: [o('Under 40.5', 4.8), o('Over 40.5', 1.15)] },
      { name: 'Map Handicap', status: 'active', outcomes: [o('Spirit (-1.5)', 2.4), o('G2 (+1.5)', 1.55)] },
      { name: 'Total Maps', status: 'active', specifiers: 'total=2.5', outcomes: [o('over 2.5', 2.1), o('under 2.5', 1.7)] },
      { name: 'Map 1 - Winner', status: 'active', outcomes: [o('Spirit', 1.6), o('G2', 2.2)] },
    ] }] } });
    expect(p.events[0].markets.map((m) => m.key).sort()).toEqual(['MH:AWAY:1.5', 'MH:HOME:-1.5', 'ML:AWAY', 'ML:HOME', 'MT:OVER:2.5', 'MT:UNDER:2.5']);
    expect(() => parseStakeExport({ meta: { source: 'stake', sport: 'dota-2', finished_at: at }, data: { matches: [] } })).toThrow(/doar fotbal și Counter-Strike/);
  });
});
