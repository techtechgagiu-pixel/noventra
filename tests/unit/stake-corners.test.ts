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


describe('Stake corners → canonical keys', () => {
  it('maps total corners and team corners, labels them and ignores half/range/odd-even/handicap', () => {
    const k = keysOf([
      mk('Total Corners', 'Total Corners', 'total=10.5', [o('Over 10.5', 2.33), o('Under 10.5', 1.53)]),
      mk('Total Corners', 'Total Corners', 'total=9.5', [o('Over 9.5', 1.85), o('Under 9.5', 1.85)]),
      mk('{$competitor1} Total Corners', 'Everton Total Corners', 'total=5.5', [o('Over 5.5', 1.93), o('Under 5.5', 1.75)]),
      mk('{$competitor2} Total Corners', 'Coventry Total Corners', 'total=3.5', [o('Over 3.5', 1.64), o('Under 3.5', 2.08)]),
      mk('1st Half - Total Corners', '1st Half - Total Corners', 'total=4.5', [o('Over 4.5', 1.89), o('Under 4.5', 1.75)]),
      mk('Corner Range', 'Corner Range', '', [o('0-8', 2.39), o('9-11', 2.75), o('12+', 3.15)]),
      mk('Odd/Even Corners', 'Odd/Even Corners', '', [o('Odd', 1.85), o('Even', 1.86)]),
      mk('1st Corner', '1st Corner', '', [o('Everton', 1.6), o('Coventry', 2.1)]),
      mk('1st Half - Corner Handicap', '1st Half - Corner Handicap', 'hcp=-0.5', [o('Everton (-0.5)', 1.71), o('Coventry (0.5)', 1.86)]),
    ]);
    expect(k.sort()).toEqual(['CORN:OVER:10.5', 'CORN:OVER:9.5', 'CORN:UNDER:10.5', 'CORN:UNDER:9.5', 'TCORN:AWAY:OVER:3.5', 'TCORN:AWAY:UNDER:3.5', 'TCORN:HOME:OVER:5.5', 'TCORN:HOME:UNDER:5.5'].sort());
    expect(labelFor('CORN:OVER:10.5', 'Everton', 'Coventry')).toBe('Peste 10.5 cornere');
    expect(labelFor('TCORN:HOME:UNDER:5.5', 'Everton', 'Coventry')).toBe('Everton sub 5.5 cornere');
  });
  it('maps a team market named by team when the template has no competitor placeholder', () => {
    expect(keysOf([mk('Team Total Corners', 'Everton Total Corners', 'total=5.5', [o('Over 5.5', 1.9), o('Under 5.5', 1.8)])])).toEqual(['TCORN:HOME:OVER:5.5', 'TCORN:HOME:UNDER:5.5']);
  });
  it('skips whole-number lines', () => {
    expect(keysOf([mk('Total Corners', 'Total Corners', 'total=10', [o('Over 10', 1.9), o('Under 10', 1.9)])])).toEqual([]);
  });
});

describe('Stake cards → CARD keys', () => {
  it('maps Total Bookings and leaves out points, player, first booking and team markets', () => {
    const k = keysOf([
      mk('Total Bookings', 'Total Bookings', 'total=3.5', [o('Over 3.5', 1.57), o('Under 3.5', 2.11)]),
      mk('Total Booking Points', 'Total Booking Points', 'total=45.5', [o('Over 45.5', 1.9), o('Under 45.5', 1.9)]),
      mk('1st Booking', '1st Booking', '', [o('Everton', 2), o('None', 45), o('Coventry', 1.73)]),
      mk('Booking 1x2', 'Booking 1x2', '', [o('Everton', 2.8), o('Draw', 3.95), o('Coventry', 2)]),
      mk('Player to be yellow carded', 'Player to be yellow carded', '', [o('Hamer', 3.65)]),
      mk('Sending Off', 'Sending Off', '', [o('Yes', 5.4), o('No', 1.12)]),
    ]);
    expect(k.sort()).toEqual(['CARD:OVER:3.5', 'CARD:UNDER:3.5']);
    expect(labelFor('CARD:OVER:3.5', 'Everton', 'Coventry')).toBe('Peste 3.5 cartonașe');
  });
});
