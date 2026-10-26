import { describe, expect, it } from 'vitest';
import { briefForChat, briefForPrompt, buildMatchBrief, h2hFromSummary, lineupsFromSummary, newsFlags } from '@/lib/scout/match-brief';
import type { HistoricalMatch } from '@/lib/sports/types';

const team = (name: string) => ({ team: { displayName: name } });
const meeting = (date: string, h: string, hs: string, a: string, as: string, completed = true) => ({ date, statusType: { completed }, competitors: [{ homeAway: 'home', score: hs, ...team(h) }, { homeAway: 'away', score: as, ...team(a) }] });
const hm = (date: string, venue: 'home' | 'away', gf: number, ga: number, opp: string): HistoricalMatch => ({ eventKey: date, date, competition: 'L', venue, opponent: opp, goalsFor: gf, goalsAgainst: ga, result: gf > ga ? 'W' : gf === ga ? 'D' : 'L', shots: null, shotsOnTarget: null, opponentShots: null, opponentShotsOnTarget: null } as HistoricalMatch);

describe('match brief', () => {
  it('keeps only completed head-to-head meetings before kickoff, newest first, max 5', () => {
    const summary = { seasonseries: [{ type: 'head-to-head', events: [
      meeting('2025-01-01T15:00Z', 'Chelsea', '1', 'Man Utd', '0'),
      meeting('2026-04-18T19:00Z', 'Chelsea', '2', 'Man Utd', '2'),
      meeting('2026-11-01T19:00Z', 'Chelsea', '0', 'Man Utd', '0', false),
    ] }] };
    const h = h2hFromSummary(summary, '2026-10-31T12:00Z');
    expect(h.map((x) => x.text)).toEqual(['Chelsea 2-2 Man Utd', 'Chelsea 1-0 Man Utd']);
  });

  it('reports lineups only when announced', () => {
    expect(lineupsFromSummary({ rosters: [{ homeAway: 'home', roster: [] }] })).toMatchObject({ home: null, away: null });
    const xi = Array.from({ length: 11 }, (_, i) => ({ starter: true, athlete: { displayName: `P${i}` } }));
    expect(lineupsFromSummary({ rosters: [{ homeAway: 'home', formation: '4-3-3', roster: xi }, { homeAway: 'away', roster: xi }] }).home).toHaveLength(11);
  });

  it('flags absences and finances only from real headlines', () => {
    const flags = newsFlags('A', 'B', { home: [{ title: 'Star striker ruled out with injury', source: 'BBC', publishedAt: '2026-10-20', link: 'x', lang: 'en' }], away: [{ title: 'Club faces unpaid wages crisis', source: 'X', publishedAt: '2026-10-20', link: 'y', lang: 'en' }, { title: 'Nice win', source: 'X', publishedAt: '2026-10-20', link: 'z', lang: 'en' }] });
    expect(flags.map((f) => f.kind)).toEqual(['absențe', 'financiar']);
  });

  it('builds home-at-home and away-on-the-road form and says what is missing', () => {
    const b = buildMatchBrief({ home: 'A', away: 'B', kickoff: '2026-10-31T12:00Z', summary: null,
      homeMatches: [hm('2026-10-01', 'home', 2, 0, 'X'), hm('2026-10-08', 'away', 0, 1, 'Y')],
      awayMatches: [hm('2026-10-02', 'away', 1, 1, 'Z')], standings: { home: { rank: 3, points: 20, played: 9 }, away: null } });
    expect(b.homeAtHome.map((m) => m.text)).toEqual(['V 2-0 vs X']);
    expect(b.awayAway.map((m) => m.text)).toEqual(['E 1-1 vs Z']);
    expect(b.missing.join(' ')).toMatch(/directe/);
    expect(briefForChat(b)).toMatch(/locul 3, 20 pct/);
    expect(briefForPrompt(b)?.titulari).toBe('neanunțați');
  });
});

describe('payload cleaning keeps agent ids', () => {
  it('rewrites prose but never id lists', async () => {
    const { cleanPayload } = await import('@/lib/agent-names');
    const out = cleanPayload({ custom: { agents: ['hantu', 'becali', 'nova'] }, rationale: 'Hanțu are dreptate' });
    expect(out.custom.agents).toEqual(['hantu', 'becali', 'nova']);
    expect(out.rationale).not.toMatch(/Hanțu/);
  });
});
