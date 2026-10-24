import { expect, it } from 'vitest';
import { parseSoccerLeagues, parseTheOddsMatches } from '@/lib/sports/the-odds-catalog';
import { mergeInformationalMatches } from '@/lib/sports/informational-matches';
import type { MatchRow } from '@/lib/catalog';

const sport = { key: 'soccer_epl', title: 'EPL' };
const raw = { id: 'event123', sport_key: sport.key, home_team: 'Randers FC', away_team: 'Brøndby IF', commence_time: '2026-10-24T14:00:00Z' };
it('accepts only active soccer competitions, excluding outrights, unsafe keys and duplicates', () => {
  const league = { ...sport, active: true, has_outrights: false };
  expect(parseSoccerLeagues([league, league, { ...league, active: false }, { ...league, has_outrights: true }, { ...league, key: 'basketball_nba' }, { ...league, key: 'soccer_../secret' }, {}])).toEqual([sport]);
});
it('validates event identities, competition and Romanian date window, ignoring any odds or links', () => {
  const parsed = parseTheOddsMatches([{ ...raw, bookmakers: [{ key: 'unused' }], link: 'https://example.com' }], sport, '2026-10-24', 8, Date.parse('2026-10-24T10:00Z'));
  expect(parsed).toHaveLength(1);
  expect(parsed[0]).toMatchObject({ id: 'the-odds-api:event123', status: 'pre', score: null });
  expect(parsed[0]).not.toHaveProperty('bookmakers'); expect(parsed[0]).not.toHaveProperty('link');
  expect(parseTheOddsMatches([raw, raw, { ...raw, id: '../bad' }, { ...raw, sport_key: 'soccer_other' }, { ...raw, home_team: '' }, { ...raw, commence_time: 'bad' }, { ...raw, commence_time: '2026-11-01T12:00Z' }], sport, '2026-10-24', 8)).toHaveLength(1);
});
it('does not infer a live score or a final result from a past kickoff', () => {
  expect(parseTheOddsMatches([raw], sport, '2026-10-24', 8, Date.parse('2026-10-24T18:00Z'))[0]).toMatchObject({ status: 'unknown', score: null });
});
it('uses Romanian calendar dates correctly across midnight and DST', () => {
  expect(parseTheOddsMatches([{ ...raw, commence_time: '2026-10-24T22:30Z' }], sport, '2026-10-25', 1)).toHaveLength(1);
  expect(parseTheOddsMatches([{ ...raw, commence_time: '2026-10-25T22:30Z' }], sport, '2026-10-26', 1)).toHaveLength(1);
  expect(parseTheOddsMatches([{ ...raw, commence_time: '2026-10-25T22:30Z' }], sport, '2026-10-25', 1)).toHaveLength(0);
});
it('deduplicates equivalent events, preserves ESPN data and records both sources without mutating the input', () => {
  const m = parseTheOddsMatches([raw], sport, '2026-10-24', 8)[0];
  const existing: MatchRow = { ...m, id: 'espn:123', home: 'Randers', away: 'Brondby', source: 'espn', status: 'post', score: '2–1', odds: { home: 1.7, draw: 3, away: 4, markets: 3, bookmaker: 'DEMO' }, analysis: null };
  const merged = mergeInformationalMatches([existing], [m, m]);
  expect(merged).toEqual([{ ...existing, sources: ['espn', 'the-odds-api'] }]);
  expect(existing).not.toHaveProperty('sources');
});
it('keeps women, youth, reversed sides and different dates separate with no prices or analysis', () => {
  const m = parseTheOddsMatches([raw], sport, '2026-10-24', 8)[0];
  const variants = [m, { ...m, id: 'women', home: `${m.home} Women` }, { ...m, id: 'youth', home: `${m.home} U21` }, { ...m, id: 'reverse', home: m.away, away: m.home }, { ...m, id: 'later', kickoff: '2026-10-25T14:00Z' }];
  const rows = mergeInformationalMatches([], [...variants, ...variants]);
  expect(rows).toHaveLength(5);
  for (const row of rows) expect(row).toMatchObject({ source: 'the-odds-api', sources: ['the-odds-api'], odds: null, analysis: null });
});
