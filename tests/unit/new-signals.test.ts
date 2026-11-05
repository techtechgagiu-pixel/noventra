import { describe, expect, it } from 'vitest';
import { describeMovement, mainPrices, historyStatements } from '../../src/lib/sports/odds-movement';
import { restInfo, restText, stakesText, tableFromSummary, buildMatchBrief, briefForPrompt } from '../../src/lib/scout/match-brief';

const row = (capturedAt: string, h: number | null, over25: number | null = 1.9) => ({ capturedAt, h, d: 3.4, a: 4, over25, btts: 1.8 });

describe('odds movement', () => {
  it('reports moves of at least 4 % and says who the market backs', () => {
    const t = describeMovement([row('2026-11-05T08:00:00Z', 2.1), row('2026-11-06T08:00:00Z', 1.85)], 'A', 'B')!;
    expect(t).toContain('victorie A: 2.1 → 1.85');
    expect(t).toContain('scade, piața o susține');
    expect(t).not.toContain('egal');
  });
  it('says nothing moved, and nothing at all with a single capture', () => {
    expect(describeMovement([row('2026-11-05T08:00:00Z', 2), row('2026-11-06T08:00:00Z', 2.02)], 'A', 'B')).toContain('nicio mișcare');
    expect(describeMovement([row('2026-11-05T08:00:00Z', 2)], 'A', 'B')).toBeNull();
    expect(describeMovement([row('2026-11-05T08:00:00Z', 2), row('2026-11-05T08:20:00Z', 1.5)], 'A', 'B')).toBeNull();
  });
  it('reads the main prices and writes one idempotent insert per event', () => {
    const markets = [{ key: '1X2:HOME', odds: 2 }, { key: '1X2:DRAW', odds: 3 }, { key: '1X2:AWAY', odds: 4 }, { key: 'TOTAL:OVER:2.5', odds: 1.8 }, { key: 'BTTS:YES', odds: 1.7 }, { key: 'EG:2', odds: 5 }].map((x) => ({ ...x, marketType: '1X2' as const }));
    expect(mainPrices(markets)).toEqual({ h: 2, d: 3, a: 4, over25: 1.8, btts: 1.7 });
    const [st] = historyStatements([{ sourceId: 's1', home: 'A', away: 'B', league: null, kickoff: '2026-11-07T15:00:00Z', capturedAt: '2026-11-06T08:00:00Z', markets }]);
    expect(st.text).toContain('ON CONFLICT(source_id,captured_at) DO NOTHING');
    expect(st.params).toEqual(['s1', '2026-11-06T08:00:00Z', 'A', 'B', '2026-11-07T15:00:00Z', 2, 3, 4, 1.8, 1.7]);
  });
});

describe('rest and congestion', () => {
  const m = (date: string) => ({ date }) as never;
  it('counts days since the last match and matches in 14 days', () => {
    const r = restInfo([m('2026-11-04T19:00:00Z'), m('2026-11-01T19:00:00Z'), m('2026-10-28T19:00:00Z'), m('2026-10-20T19:00:00Z'), m('2026-11-09T19:00:00Z')], '2026-11-07T19:00:00Z')!;
    expect(r.days).toBe(3); expect(r.last14).toBe(3);
    expect(restText(r)).toContain('ODIHNĂ SCURTĂ');
  });
  it('flags a heavy schedule and ignores matches after kickoff', () => {
    const r = restInfo(['2026-11-05', '2026-11-02', '2026-10-30', '2026-10-27'].map((d) => m(`${d}T19:00:00Z`)), '2026-11-07T19:00:00Z')!;
    expect(restText(r)).toContain('PROGRAM ÎNCĂRCAT');
    expect(restInfo([], '2026-11-07T19:00:00Z')).toBeNull();
    expect(restText(null)).toBe('n/d');
  });
});

describe('stakes from the table', () => {
  const table = Array.from({ length: 20 }, (_, i) => ({ id: `t${i + 1}`, rank: i + 1, points: 30 - i * 1.5, played: 12 }));
  it('names title race, relegation, bottom edge, top and the quiet middle', () => {
    expect(stakesText(table, 't2')).toContain('lupta pentru titlu');
    expect(stakesText(table, 't19')).toContain('zona retrogradării');
    expect(stakesText(table, 't16')).toContain('aproape de retrogradare');
    expect(stakesText(table, 't5')).toContain('partea de sus');
    expect(stakesText(table, 't10')).toContain('miză mică');
  });
  it('is silent without a table, a known team or enough games', () => {
    expect(stakesText([], 't1')).toBeNull();
    expect(stakesText(table, 'zzz')).toBeNull();
    expect(stakesText(table.map((t) => ({ ...t, played: 3 })), 't3')).toContain('început de sezon');
  });
  it('reads the whole table from an ESPN summary', () => {
    const entry = (id: string, rank: number) => ({ id, stats: [{ name: 'rank', value: rank }, { name: 'points', value: 20 - rank }, { name: 'gamesPlayed', value: 9 }] });
    expect(tableFromSummary({ standings: { groups: [{ standings: { entries: [entry('1', 1), entry('2', 2)] } }] } })).toEqual([{ id: '1', rank: 1, points: 19, played: 9 }, { id: '2', rank: 2, points: 18, played: 9 }]);
    expect(tableFromSummary(null)).toEqual([]);
  });
});

describe('the brief carries the new signals to the agents', () => {
  it('puts rest, stakes and movement into the prompt facts', () => {
    const b = buildMatchBrief({ home: 'A', away: 'B', kickoff: '2026-11-07T19:00:00Z', summary: null, homeMatches: [], awayMatches: [], standings: { home: null, away: null }, movement: 'în ultimele 20 h: victorie A: 2.1 → 1.85 (scade, piața o susține)' });
    const p = briefForPrompt(b) as Record<string, unknown>;
    expect(p.miscareaCotelor).toContain('scade');
    expect(p.odihna).toContain('n/d');
    expect(p.miza).toBe('n/d');
  });
});

import { consensus, contested, type FinalPosition } from '../../src/lib/jobs/analysis';
const vote = (agentId: string, marketKey: string | null): FinalPosition => ({ agentId, decision: marketKey ? 'BET_CANDIDATE' : 'NO_BET', marketKey, estimatedProbability: 0.7, confidence: 70, risk: 'mediu', round: 1, rationale: 'r', provider: 'p', model: 'm', alternatives: [] } as unknown as FinalPosition);
const keys = [{ key: '1X2:HOME', odds: 1.8 }, { key: 'DC:1X', odds: 1.3 }];

describe('unanimity (06.11)', () => {
  const four = [vote('a', '1X2:HOME'), vote('b', '1X2:HOME'), vote('c', '1X2:HOME'), vote('d', '1X2:HOME')];
  it('4 of 5 passes the usual threshold but not unanimity', () => {
    const team = [...four, vote('e', null)];
    expect(consensus(team, 2, 5, keys).outcome).toBe('QUALIFIED');
    const u = consensus(team, 5, 5, keys, 'safest', 5);
    expect(u.outcome).not.toBe('QUALIFIED');
    expect(u.requiredVotes).toBe(5);
  });
  it('all 5 backing it qualifies, also through a safer selection they all imply', () => {
    expect(consensus([...four, vote('e', '1X2:HOME')], 5, 5, keys, 'safest', 5).outcome).toBe('QUALIFIED');
    const mixed = [vote('a', '1X2:HOME'), vote('b', '1X2:HOME'), vote('c', 'DC:1X'), vote('d', 'DC:1X'), vote('e', '1X2:HOME')];
    const c = consensus(mixed, 5, 5, keys, 'safest', 5);
    expect(c.outcome).toBe('QUALIFIED'); expect(c.marketKey).toBe('DC:1X'); // every vote implies 1X
  });
  it('an agent that did not answer breaks unanimity', () => {
    expect(consensus(four, 5, 5, keys, 'safest', 5).outcome).not.toBe('QUALIFIED');
  });
  it('sends the one-dissenter case to debate', () => {
    expect(contested([...four, vote('e', null)], keys, 5, 5, 5)).toBe(true);
    expect(contested([...four.slice(0, 3), vote('d', null), vote('e', null)], keys, 5, 5, 5)).toBe(false);
  });
});

import { jobTimeUp, MAX_JOB_MINUTES } from '../../src/lib/jobs/pipeline';
describe('limita de 30 de minute (06.11)', () => {
  const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  it('nu expiră înainte de limită, expiră după', () => {
    expect(jobTimeUp({ created_at: at(MAX_JOB_MINUTES - 2), config: {} as never })).toBe(false);
    expect(jobTimeUp({ created_at: at(MAX_JOB_MINUTES + 2), config: {} as never })).toBe(true);
  });
  it('o cerere de completare repornește ceasul', () => {
    expect(jobTimeUp({ created_at: at(120), config: { completion: { requestedAt: at(5) } } as never })).toBe(false);
  });
});
