import { describe, expect, it } from 'vitest';
import { matchEvent, summaryFacts, teamSimilarity, type EspnEvent } from '@/lib/sports/stake-espn-results';

const ev = (id: string, home: string[], away: string[], kickoff: string, status = 'STATUS_FULL_TIME'): EspnEvent => ({ id, home, away, kickoff: Date.parse(kickoff), state: 'post', status });
// Real Stake vs ESPN spellings from 12-13.11.
const board = [
  ev('1', ['Türkiye', 'Türkiye'], ['Belgium'], '2026-11-12T17:00Z'),
  ev('2', ['Armenia'], ['Cyprus'], '2026-11-12T17:00Z'),
  ev('3', ['Estudiantes de La Plata', 'Estudiantes'], ['Independiente Rivadavia', 'Ind. Rivadavia'], '2026-11-12T23:00Z', 'STATUS_FINAL_AET'),
  ev('4', ['Club Atlético Morelia', 'Morelia'], ['Leones Negros'], '2026-11-13T02:00Z'),
  ev('5', ['Saudi Arabia'], ['South Korea'], '2026-11-13T14:30Z'),
  ev('6', ['Türkiye U21'], ['Czechia U21'], '2026-11-13T16:00Z'),
];
const at = (home: string, away: string, kickoff: string) => matchEvent({ home, away, kickoff: Date.parse(kickoff) }, board)?.id ?? null;

describe('Stake-only results from ESPN (13.11)', () => {
  it('matches the Stake spelling to the ESPN event at the same kickoff', () => {
    expect(at('Turkiye', 'Belgium', '2026-11-12T17:00Z')).toBe('1');
    expect(at('Estudiantes La Plata', 'Independiente Rivadavia', '2026-11-12T23:00Z')).toBe('3');
    expect(at('Atletico Morelia SA CV', 'Leones Negros UDEG', '2026-11-13T02:00Z')).toBe('4');
    expect(at('Saudi Arabia', 'Korea Republic', '2026-11-13T14:30Z')).toBe('5');
  });
  it('never takes a match at another time, the other team, or the U21 side for the seniors', () => {
    expect(at('Armenia', 'Cyprus', '2026-11-12T19:45Z')).toBeNull();
    expect(at('Armenia', 'Belgium', '2026-11-12T17:00Z')).toBeNull();
    expect(at('Turkey', 'Czech Republic', '2026-11-13T16:00Z')).toBeNull();
    expect(teamSimilarity('Turkey U21', 'Türkiye U21')).toBe(1);
    expect(teamSimilarity('Arsenal', 'Arsenal Women')).toBe(0);
  });
  it('leaves two equally good candidates to the owner', () => {
    const twice = [...board, ev('7', ['Türkiye'], ['Belgium'], '2026-11-12T17:10Z')];
    expect(matchEvent({ home: 'Turkiye', away: 'Belgium', kickoff: Date.parse('2026-11-12T17:00Z') }, twice)).toBeNull();
  });
  it('reads the 90-minute score, half time, corners and cards (extra time excluded)', () => {
    const line = (...v: number[]) => v.map((n) => ({ displayValue: String(n) }));
    const aet = summaryFacts({ header: { competitions: [{ competitors: [{ homeAway: 'home', score: '3', linescores: line(0, 2, 1, 0) }, { homeAway: 'away', score: '2', linescores: line(0, 2, 0, 0) }] }] },
      boxscore: { teams: [{ homeAway: 'home', statistics: [{ name: 'wonCorners', displayValue: '7' }, { name: 'yellowCards', displayValue: '4' }, { name: 'redCards', displayValue: '0' }] }, { homeAway: 'away', statistics: [{ name: 'wonCorners', displayValue: '3' }, { name: 'yellowCards', displayValue: '2' }, { name: 'redCards', displayValue: '1' }] }] } });
    expect(aet).toEqual({ home: 2, away: 2, ht: [0, 0], corners: [7, 3], cards: [4, 3] });
    const ft = summaryFacts({ header: { competitions: [{ competitors: [{ homeAway: 'home', score: '3', linescores: line(1, 2) }, { homeAway: 'away', score: '1', linescores: line(1, 0) }] }] } });
    expect(ft).toMatchObject({ home: 3, away: 1, ht: [1, 1] });
    const noLines = summaryFacts({ header: { competitions: [{ competitors: [{ homeAway: 'home', score: '2' }, { homeAway: 'away', score: '0' }] }] } });
    expect(noLines).toMatchObject({ home: 2, away: 0, ht: null });
  });
});
