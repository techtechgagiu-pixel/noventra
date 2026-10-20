import { describe, expect, it } from 'vitest';
import { canonicalMarket, consensus, contested, toPosition, type FinalPosition } from '@/lib/jobs/analysis';
import { settleMarket, ticketOutcome } from '@/lib/settlement';
import { seededShuffle } from '@/lib/jobs/pipeline';
import { teamDossier } from '@/lib/scout/dossier';

const pos = (agentId: string, marketKey: string | null): FinalPosition => ({ agentId, decision: marketKey ? 'BET_CANDIDATE' : 'NO_BET', marketKey, estimatedProbability: 0.6, confidence: 60, risk: 'MEDIUM', round: 0, rationale: '', provider: 'groq', model: 'm' });
describe('voting', () => {
  it('4/6 on the same canonical key qualifies', () => {
    const c = consensus([pos('a', '1X2:HOME'), pos('b', '1X2:HOME'), pos('c', '1X2:HOME'), pos('d', '1X2:HOME'), pos('e', null), pos('f', 'DC:1X')], 4);
    expect(c).toMatchObject({ outcome: 'QUALIFIED', marketKey: '1X2:HOME', votesFor: 4 });
  });
  it('3/6 is NO CONSENSUS; 4 NO_BET is NO BET; failed agents are abstentions, not votes', () => {
    expect(consensus([pos('a', '1X2:HOME'), pos('b', '1X2:HOME'), pos('c', '1X2:HOME'), pos('d', 'TOTAL:OVER:2.5'), pos('e', null), pos('f', null)], 4).outcome).toBe('NO_CONSENSUS');
    expect(consensus([pos('a', null), pos('b', null), pos('c', null), pos('d', null), pos('e', '1X2:HOME')], 4)).toMatchObject({ outcome: 'NO_BET', abstentions: 1 });
    expect(consensus([pos('a', '1X2:HOME'), pos('b', '1X2:HOME'), pos('c', '1X2:HOME')], 4).outcome).toBe('NO_CONSENSUS');
  });
  it('normalises equivalent selections and rejects keys not in the market list', () => {
    const keys = new Set(['1X2:HOME', 'DC:1X']);
    expect(canonicalMarket(' 1x2:home ', keys)).toBe('1X2:HOME');
    expect(canonicalMarket('1X', keys)).toBe('DC:1X');
    expect(canonicalMarket('BTTS:YES', keys)).toBeNull();
    expect(toPosition('a', { fixtureId: 'f', decision: 'BET_CANDIDATE', marketKey: 'INVENTED', estimatedProbability: 0.7, confidence: 80, risk: 'LOW', evidence: [], counterarguments: [], missingData: [], failureReasons: [], rationale: '' }, 0, 'groq', 'm', keys).decision).toBe('NO_BET');
  });
  it('debate only for contested fixtures', () => {
    expect(contested([pos('a', '1X2:HOME'), pos('b', '1X2:HOME'), pos('c', null)])).toBe(true);
    expect(contested(['a', 'b', 'c', 'd', 'e', 'f'].map((x) => pos(x, '1X2:HOME')))).toBe(false);
    expect(contested(['a', 'b', 'c'].map((x) => pos(x, null)))).toBe(false);
  });
});
describe('settlement', () => {
  it('canonical market settlement', () => {
    expect(settleMarket('1X2:HOME', 2, 1)).toBe('WON');
    expect(settleMarket('DC:X2', 1, 1)).toBe('WON');
    expect(settleMarket('TOTAL:OVER:2.5', 1, 1)).toBe('LOST');
    expect(settleMarket('AH:AWAY:1.5', 2, 1)).toBe('WON');
    expect(ticketOutcome(['WON', 'VOID'])).toBe('PARTIAL_VOID');
    expect(ticketOutcome(['WON', 'LOST', 'PENDING'])).toBe('LOST');
    expect(ticketOutcome(['WON', 'PENDING'])).toBe('PENDING');
  });
});
describe('random discovery', () => {
  it('same seed → same order; different seeds → different order', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    expect(seededShuffle(items, 'abc')).toEqual(seededShuffle(items, 'abc'));
    expect(seededShuffle(items, 'abc')).not.toEqual(seededShuffle(items, 'abd'));
    expect([...seededShuffle(items, 'x')].sort((a, b) => a - b)).toEqual(items);
  });
});
describe('SCOUT', () => {
  const base = { eventKey: 'e', date: '2026-09-01', competition: 'L', venue: 'home' as const, opponent: 'Y', shots: 10, possession: 50, redCardsFor: 0, redCardsAgainst: 0, penaltyGoalsFor: 0, penaltyGoalsAgainst: 0, ownGoalsFor: 0, ownGoalsAgainst: 0, deflectedGoalsFor: 0, earlyRedCard: false, xg: null, opponentShots: 10, source: 't' };
  it('classifies verified events vs possible fortune vs insufficient evidence', () => {
    const d = teamDossier('X', [
      { ...base, goalsFor: 1, goalsAgainst: 0, result: 'W', shotsOnTarget: 1, opponentShotsOnTarget: 6, penaltyGoalsFor: 1 },
      { ...base, goalsFor: 2, goalsAgainst: 2, result: 'D', shotsOnTarget: null, opponentShotsOnTarget: null },
    ]);
    const classes = d.anomalies.map((a) => a.classification);
    expect(classes).toContain('VERIFIED EVENT');
    expect(classes).toContain('POSSIBLE FORTUITOUS INFLUENCE');
    expect(classes).toContain('INSUFFICIENT EVIDENCE');
    expect(d.shotsOnTargetFor).toBe(1); // average over available values only, missing ≠ 0
  });
});

describe('logical vote normalisation', () => {
  const keys = [{ key: '1X2:AWAY', odds: 2.15 }, { key: 'DC:X2', odds: 1.4 }, { key: 'AH:AWAY:1.5', odds: 1.2 }, { key: 'TOTAL:UNDER:2.5', odds: 1.9 }];
  it('a vote for "Away wins" also supports "Draw or Away" and "+1.5"', async () => {
    const { selectionImplies } = await import('@/lib/stats/engine');
    expect(selectionImplies('1X2:AWAY', 'DC:X2')).toBe(true);
    expect(selectionImplies('DC:X2', '1X2:AWAY')).toBe(false);
    expect(selectionImplies('1X2:AWAY', 'AH:AWAY:1.5')).toBe(true);
    expect(selectionImplies('TOTAL:UNDER:2.5', 'DC:X2')).toBe(false);
  });
  it('qualifies the most specific key that reaches 4/6 and reports supporters', () => {
    const c = consensus([pos('a', '1X2:AWAY'), pos('b', '1X2:AWAY'), pos('c', 'DC:X2'), pos('d', 'DC:X2'), pos('e', null), pos('f', 'TOTAL:UNDER:2.5')], 4, 6, keys);
    expect(c).toMatchObject({ outcome: 'QUALIFIED', marketKey: 'DC:X2', votesFor: 4, directVotes: 2 });
    expect(c.supporters.sort()).toEqual(['a', 'b', 'c', 'd']);
  });
  it('never counts unrelated markets together', () => {
    const c = consensus([pos('a', '1X2:AWAY'), pos('b', 'TOTAL:UNDER:2.5'), pos('c', 'TOTAL:UNDER:2.5'), pos('d', '1X2:AWAY'), pos('e', null), pos('f', null)], 4, 6, keys);
    expect(c.outcome).toBe('NO_CONSENSUS');
  });
});
