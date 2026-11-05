import { describe, expect, it } from 'vitest';
import { parseStakeExport, labelFor } from '../../src/lib/sports/imported-prices';
import { selectionWins, fairProbabilities } from '../../src/lib/stats/engine';
import { settleMarket } from '../../src/lib/settlement';
import { isBannedMarket } from '../../src/lib/jobs/analysis';
import { MARKET_FAMILIES, marketAllowedBy, needsVarietyOverride } from '../../src/lib/slots';

const o = (name: string, odds: number) => ({ name, odds, active: true });
const mk = (template: string, name: string, specifiers: string, outcomes: ReturnType<typeof o>[]) => ({ source_id: template + specifiers, template, name, specifiers, status: 'active', group: 'goals', outcomes });
const exportOf = (markets: unknown[]) => ({
  meta: { source: 'stake', sport: 'soccer', finished_at: '2026-11-06T10:00:00Z' },
  data: { matches: [{ source_id: 'm1', name: 'Everton vs Coventry', starts_at: '2026-11-07T15:00:00Z', participants: [{ name: 'Everton' }, { name: 'Coventry' }], tournament: { name: 'Championship' }, markets }] },
});
const keysOf = (markets: unknown[]) => parseStakeExport(exportOf(markets)).events[0]?.markets.map((m) => m.key) ?? [];

describe('Stake extra markets → canonical keys', () => {
  it('maps team totals, 1x2&total, total&BTTS, exact goals, multigoals, win to nil, 3-way handicap', () => {
    const k = keysOf([
      mk('{$competitor1} Total', 'Everton Total', 'total=0.5', [o('Over 0.5', 1.4), o('Under 0.5', 2.8)]),
      mk('1x2 & Total', '1x2 & Total', 'total=1.5', [o('Everton & Under 1.5', 6), o('Everton & Over 1.5', 2.3), o('Draw & Under 1.5', 5), o('Draw & Over 1.5', 6), o('Coventry & Under 1.5', 9), o('Coventry & Over 1.5', 5)]),
      mk('Total & Both Teams to Score', 'Total & Both Teams to Score', 'total=2.5', [o('Over 2.5 & Yes', 2.9), o('Under 2.5 & Yes', 7), o('Over 2.5 & No', 4.5), o('Under 2.5 & No', 2.6)]),
      mk('Exact Goals', 'Exact Goals', 'variant=sr:exact_goals:9+', [o('0', 12), o('1', 6), o('2', 4), o('3+', 2)]),
      mk('Multigoals', 'Multigoals', '', [o('1-2', 2.1), o('2-3', 2.3), o('4+', 5)]),
      mk('{$competitor2} Win to Nil', 'Coventry Win to Nil', '', [o('Yes', 7), o('No', 1.08)]),
      mk('Handicap', 'Handicap', 'hcp=0:1', [o('Everton (0:1)', 2.8), o('Draw (0:1)', 3.4), o('Coventry (0:1)', 2.4)]),
    ]);
    for (const x of ['TT:HOME:OVER:0.5', 'X2T:HOME:OVER:1.5', 'X2T:DRAW:UNDER:1.5', 'TBTTS:OVER:2.5:YES', 'TBTTS:UNDER:2.5:NO', 'EG:3+', 'MG:1-2', 'MG:4+', 'WTN:AWAY:YES', 'EH:DRAW:0:1', 'EH:AWAY:0:1']) expect(k).toContain(x);
  });
  it('refuses incomplete combos and whole-number lines', () => {
    expect(keysOf([mk('1x2 & Total', '1x2 & Total', 'total=2', [o('Everton & Over 2', 2)])])).toEqual([]);
    expect(keysOf([mk('{$competitor1} Total', 'Everton Total', 'total=1', [o('Over 1', 2), o('Under 1', 1.7)])])).toEqual([]);
  });
});

describe('score tables', () => {
  const cases: Array<[string, number, number, boolean]> = [
    ['X2T:HOME:OVER:1.5', 2, 0, true], ['X2T:HOME:OVER:1.5', 1, 0, false], ['X2T:DRAW:OVER:1.5', 1, 1, true], ['X2T:AWAY:UNDER:2.5', 0, 1, true], ['X2T:AWAY:UNDER:2.5', 1, 2, false],
    ['TBTTS:OVER:2.5:YES', 2, 1, true], ['TBTTS:OVER:2.5:YES', 3, 0, false], ['TBTTS:OVER:2.5:NO', 3, 0, true], ['TBTTS:UNDER:2.5:YES', 1, 1, true],
    ['EG:0', 0, 0, true], ['EG:2', 1, 1, true], ['EG:2', 2, 1, false], ['EG:5+', 3, 2, true], ['EG:5+', 2, 2, false],
    ['MG:1-3', 0, 0, false], ['MG:1-3', 2, 1, true], ['MG:1-3', 3, 1, false], ['MG:4+', 3, 1, true],
    ['WTN:HOME:YES', 1, 0, true], ['WTN:HOME:YES', 2, 1, false], ['WTN:HOME:NO', 0, 0, true], ['WTN:AWAY:YES', 0, 3, true],
    ['EH:HOME:0:1', 2, 0, true], ['EH:HOME:0:1', 1, 0, false], ['EH:DRAW:0:1', 1, 0, true], ['EH:AWAY:0:1', 1, 1, true], ['EH:HOME:1:0', 0, 0, true],
  ];
  it.each(cases)('%s at %i-%i → %s', (key, h, a, want) => {
    expect(selectionWins(key, h, a)).toBe(want);
    expect(settleMarket(key, h, a)).toBe(want ? 'WON' : 'LOST');
  });
  it('unknown keys never settle', () => { expect(settleMarket('ZZZ:1', 1, 0)).toBeNull(); expect(selectionWins('ZZZ:1', 1, 0)).toBeNull(); });
});

describe('fair probabilities of the new families', () => {
  it('removes the margin only inside complete partitions', () => {
    const q = (key: string, odds: number, marketType: 'COMBO' | 'EXACT_GOALS') => ({ key, odds, marketType, label: key, bookmaker: 'Stake' });
    const eg = fairProbabilities([q('EG:0', 10, 'EXACT_GOALS'), q('EG:1', 5, 'EXACT_GOALS'), q('EG:2+', 1.5, 'EXACT_GOALS')]);
    expect(eg.get('EG:1')!.fair).not.toBeNull();
    const gap = fairProbabilities([q('EG:0', 10, 'EXACT_GOALS'), q('EG:2+', 1.5, 'EXACT_GOALS')]);
    expect(gap.get('EG:0')!.fair).toBeNull();
    const four = fairProbabilities(['OVER:2.5:YES', 'UNDER:2.5:YES', 'OVER:2.5:NO', 'UNDER:2.5:NO'].map((s) => q(`TBTTS:${s}`, 4, 'COMBO')));
    expect(four.get('TBTTS:OVER:2.5:YES')!.fair).toBeCloseTo(0.25);
  });
});

describe('bans stay consistent across the new families', () => {
  it('bans every UNDER or „GG – NU” component', () => {
    for (const k of ['X2T:HOME:UNDER:2.5', 'TBTTS:UNDER:2.5:YES', 'TBTTS:OVER:2.5:NO', 'TBTTS:UNDER:2.5:NO', 'TT:HOME:UNDER:1.5']) expect(isBannedMarket(k)).toBe(true);
    for (const k of ['X2T:HOME:OVER:2.5', 'TBTTS:OVER:2.5:YES', 'EG:3', 'MG:2-4', 'WTN:HOME:YES', 'EH:HOME:0:1']) expect(isBannedMarket(k)).toBe(false);
  });
});

describe('family checklist', () => {
  it('nothing ticked allows all; ticks restrict', () => {
    expect(marketAllowedBy([], 'EG:3')).toBe(true);
    expect(marketAllowedBy(['OVER15'], 'TOTAL:OVER:1.5')).toBe(true);
    expect(marketAllowedBy(['OVER15'], 'TOTAL:OVER:2.5')).toBe(false);
    expect(marketAllowedBy(['OVER35'], 'TOTAL:OVER:3.5')).toBe(true);
    expect(marketAllowedBy(['COMBO'], 'TBTTS:OVER:2.5:YES')).toBe(true);
    expect(MARKET_FAMILIES.length).toBeGreaterThan(8);
  });
  it('waives the variety rule only when too few families are left', () => {
    expect(needsVarietyOverride([])).toBe(false);
    expect(needsVarietyOverride(['OVER15', 'OVER25'])).toBe(true);
    expect(needsVarietyOverride(['BTTS', 'OVER25'])).toBe(true);
    expect(needsVarietyOverride(['BTTS', 'OVER25', 'RESULT'])).toBe(false);
  });
});

describe('labels', () => {
  it('speak Romanian', () => {
    expect(labelFor('X2T:HOME:OVER:1.5', 'Everton', 'Coventry')).toBe('Everton câștigă și peste 1.5 goluri');
    expect(labelFor('EG:3+', 'A', 'B')).toContain('3 sau mai multe');
  });
});
