import { expect, it } from 'vitest';
import { mergeInformationalMatches, parseApiFootballMatches } from '@/lib/sports/api-football-catalog';
import type { MatchRow } from '@/lib/catalog';

const raw = (state = 'NS', date = '2026-10-23T20:00:00+03:00') => ({
  fixture: { id: 123, date, status: { short: state } }, league: { id: 42, name: 'Liga', country: 'Romania' },
  teams: { home: { name: 'Randers FC' }, away: { name: 'Brøndby IF' } }, goals: { home: 2, away: 1 },
});

it.each([['NS', 'pre', null], ['HT', 'in', '2–1'], ['FT', 'post', '2–1'], ['AET', 'post', '2–1'], ['PEN', 'post', '2–1'], ['PST', 'postponed', null], ['CANC', 'cancelled', null]])('maps %s without inventing a score', (state, status, score) => {
  expect(parseApiFootballMatches([raw(state)], '2026-10-23')[0]).toMatchObject({ id: 'api-football:123', status, score, kickoff: '2026-10-23T17:00:00.000Z' });
});
it('validates records and uses the Romanian date across midnight and DST', () => {
  expect(parseApiFootballMatches([{}, { ...raw(), fixture: { ...raw().fixture, id: '123' } }, raw('NS', 'invalid')], '2026-10-23')).toEqual([]);
  expect(parseApiFootballMatches([raw('NS', '2026-10-23T22:30:00Z')], '2026-10-24')).toHaveLength(1);
  expect(parseApiFootballMatches([raw('NS', '2026-10-25T22:30:00Z')], '2026-10-26')).toHaveLength(1);
  expect(parseApiFootballMatches([raw('NS', '2026-10-25T22:30:00Z')], '2026-10-25')).toEqual([]);
  expect(parseApiFootballMatches([{ ...raw('FT'), goals: { home: null, away: 1 } }], '2026-10-23')[0].score).toBeNull();
});
it('deduplicates equivalent teams without replacing existing identities, scores or annotations', () => {
  const incoming = parseApiFootballMatches([raw()], '2026-10-23')[0];
  const existing: MatchRow = { ...incoming, id: 'espn:456', source: 'espn', home: 'Randers', away: 'Brondby', status: 'post', score: '3–1', odds: null, analysis: null };
  const merged = mergeInformationalMatches([existing], [incoming, incoming]);
  expect(merged).toEqual([existing]);
  expect(merged[0]).toBe(existing);
});
it('keeps women, youth, reversed sides and different dates separate; extra fixtures stay informational', () => {
  const m = parseApiFootballMatches([raw()], '2026-10-23')[0];
  const variants = [m, { ...m, id: 'women', home: `${m.home} Women` }, { ...m, id: 'youth', home: `${m.home} U21` },
    { ...m, id: 'reverse', home: m.away, away: m.home }, { ...m, id: 'later', kickoff: '2026-10-24T17:00:00Z' }];
  const rows = mergeInformationalMatches([], [...variants, ...variants]);
  expect(rows).toHaveLength(5);
  for (const row of rows) expect(row).toMatchObject({ source: 'api-football', odds: null, analysis: null });
});
