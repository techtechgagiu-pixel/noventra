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



describe('Stake half-time and combined markets', () => {
  const all = [
    mk('1x2 & Both Teams to Score', '1x2 & Both Teams to Score', '', [o('Everton & Yes', 3.2), o('Everton & No', 2.9), o('Draw & Yes', 4.7), o('Draw & No', 14), o('Coventry & Yes', 8.4), o('Coventry & No', 9)]),
    mk('1st Half - 1x2 & Both Teams to Score', '1st Half - 1x2 & Both Teams to Score', '', [o('Everton & Yes', 13), o('Everton & No', 2.36), o('Draw & Yes', 7.2), o('Draw & No', 3.4), o('Coventry & Yes', 28), o('Coventry & No', 5.6)]),
    mk('1st/2nd Half Both Teams to Score', '1st/2nd Half Both Teams to Score', '', [o('No/No', 1.58), o('Yes/No', 5.4), o('Yes/Yes', 15), o('No/Yes', 3.9)]),
    mk('1st Half - Double Chance', '1st Half - Double Chance', '', [o('Everton or Coventry', 1.54), o('Draw or Coventry', 1.67), o('Everton or Draw', 1.18)]),
    mk('1st Half - 1x2', '1st Half - 1x2', '', [o('Everton', 2.4), o('Draw', 2.1), o('Coventry', 6)]),
    mk('1st Half - Asian Total', '1st Half - Asian Total', '', [o('Over 1.5', 2.44), o('Under 1.5', 1.52), o('Over 1.25', 2.04), o('Under 1.25', 1.72), o('Over 1', 1.63), o('Under 1', 2.18)]),
    mk('Halftime/Fulltime & Total', 'Halftime/fulltime & total', 'total=2.5', [o('Everton/Everton & under 2.5', 6.6), o('Everton/draw & under 2.5', 24), o('draw/Everton & under 2.5', 8.6), o('draw/draw & under 2.5', 6.4), o('draw/Coventry & under 2.5', 18), o('Coventry/draw & under 2.5', 27)]),
  ];
  const keys = keysOf(all);
  it('maps every market from the Stake screenshots', () => {
    for (const x of ['X2B:HOME:YES', 'X2B:AWAY:NO', 'X2B:DRAW:NO', 'H1B:HOME:YES', 'H1B:AWAY:NO', 'HHB:N:N', 'HHB:Y:Y', 'HHB:N:Y', 'HDC:12', 'HDC:X2', 'HDC:1X', 'HT1X2:HOME', 'HT1X2:DRAW', 'HT1X2:AWAY', 'HTTOT:OVER:1.5', 'HTTOT:UNDER:1.5', 'HFT:HOME:HOME:UNDER:2.5', 'HFT:DRAW:AWAY:UNDER:2.5', 'HFT:AWAY:DRAW:UNDER:2.5']) expect(keys).toContain(x);
    expect(keys).not.toContain('HTTOT:OVER:1.25'); expect(keys).not.toContain('HTTOT:OVER:1');
  });
  it('refuses incomplete sets', () => {
    expect(keysOf([mk('1x2 & Both Teams to Score', '1x2 & Both Teams to Score', '', [o('Everton & Yes', 3.2), o('Everton & No', 2.9)])])).toEqual([]);
    expect(keysOf([mk('1st/2nd Half Both Teams to Score', '1st/2nd Half Both Teams to Score', '', [o('No/No', 1.58), o('Yes/No', 5.4)])])).toEqual([]);
  });
  it('labels in Romanian', () => {
    expect(labelFor('X2B:HOME:YES', 'Everton', 'Coventry')).toBe('Everton câștigă și ambele echipe marchează – DA');
    expect(labelFor('HFT:DRAW:HOME:UNDER:2.5', 'Everton', 'Coventry')).toBe('Pauză egal, final Everton și sub 2.5 goluri');
    expect(labelFor('HTTOT:OVER:1.5', 'Everton', 'Coventry')).toBe('Peste 1.5 goluri în prima repriză');
  });
  it('settles with the half-time score', () => {
    const ht: [number, number] = [1, 0];
    expect(settleMarket('X2B:HOME:YES', 2, 1)).toBe('WON'); expect(settleMarket('X2B:HOME:YES', 2, 0)).toBe('LOST');
    expect(settleMarket('H1B:HOME:NO', 2, 1, { ht })).toBe('WON'); expect(settleMarket('H1B:HOME:YES', 2, 1, { ht })).toBe('LOST');
    expect(settleMarket('HDC:1X', 1, 3, { ht })).toBe('WON'); expect(settleMarket('HDC:X2', 1, 3, { ht })).toBe('LOST');
    expect(settleMarket('HHB:N:Y', 2, 1, { ht })).toBe('WON'); // 1st half 1-0 (no), 2nd half 1-1 (yes)
    expect(settleMarket('HHB:Y:Y', 2, 1, { ht })).toBe('LOST');
    expect(settleMarket('HFT:HOME:HOME:UNDER:2.5', 2, 0, { ht })).toBe('WON'); expect(settleMarket('HFT:HOME:DRAW:UNDER:2.5', 2, 0, { ht })).toBe('LOST');
    expect(settleMarket('HHB:N:N', 1, 0)).toBeNull(); // needs the half-time score
  });
  it('gives a fair probability only for complete sets', () => {
    const q = (key: string, odds: number, marketType: 'COMBO' | 'HALF') => ({ key, label: key, odds, marketType, bookmaker: 'Stake' });
    const f = fairProbabilities([q('HHB:N:N', 1.58, 'HALF'), q('HHB:Y:N', 5.4, 'HALF'), q('HHB:Y:Y', 15, 'HALF'), q('HHB:N:Y', 3.9, 'HALF'), q('HT1X2:HOME', 2.4, 'HALF'), q('HT1X2:DRAW', 2.1, 'HALF'), q('HT1X2:AWAY', 6, 'HALF'), q('HDC:1X', 1.18, 'HALF')]);
    expect(f.get('HHB:N:N')?.fair).toBeGreaterThan(0.5); expect(f.get('HDC:1X')?.fair).toBeGreaterThan(0.7);
    expect(fairProbabilities([q('HHB:N:N', 1.58, 'HALF'), q('HHB:Y:N', 5.4, 'HALF')]).get('HHB:N:N')?.fair).toBeNull();
  });

  it('maps and settles the 2nd-half total', () => {
    const k = keysOf([mk('2nd Half - Asian Total', '2nd Half - Asian Total', '', [o('Over 1.5', 2), o('Under 1.5', 1.76), o('Over 1.25', 1.68), o('Under 1.25', 2.1), o('Over 1', 1.37), o('Under 1', 2.9)])]);
    expect(k).toContain('H2TOT:OVER:1.5'); expect(k).toContain('H2TOT:UNDER:1.5');
    expect(k).not.toContain('H2TOT:OVER:1.25'); expect(k).not.toContain('H2TOT:OVER:1');
    expect(labelFor('H2TOT:OVER:1.5', 'Everton', 'Coventry')).toBe('Peste 1.5 goluri în repriza a doua');
    expect(settleMarket('H2TOT:OVER:1.5', 3, 1, { ht: [1, 0] })).toBe('WON'); // 2nd half 2-1
    expect(settleMarket('H2TOT:OVER:1.5', 2, 1, { ht: [1, 1] })).toBe('LOST'); // 2nd half 1-0
    expect(settleMarket('H2TOT:UNDER:1.5', 2, 1, { ht: [1, 1] })).toBe('WON');
    expect(settleMarket('H2TOT:OVER:0.5', 2, 1)).toBeNull();
    expect(marketAllowedBy(['HALF'], 'H2TOT:OVER:0.5')).toBe(true);
  });
});
