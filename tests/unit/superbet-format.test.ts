import { describe, expect, it } from 'vitest';
import { superbetPick } from '@/lib/superbet-format';

describe('Superbet wording', () => {
  it('maps every market type to what you search in Superbet', () => {
    expect(superbetPick('DC:1X', 'Pau', 'Grenoble')).toMatchObject({ market: 'Șansă dublă', pick: '1X' });
    expect(superbetPick('1X2:AWAY', 'A', 'B')).toMatchObject({ market: 'Final (1X2)', pick: '2' });
    expect(superbetPick('TOTAL:UNDER:2.5', 'A', 'B')).toMatchObject({ market: 'Total goluri', pick: 'Sub 2.5' });
    expect(superbetPick('TT:HOME:UNDER:2.5', 'BK Häcken', 'Degerfors')).toMatchObject({ market: 'Total goluri BK Häcken', pick: 'Sub 2.5' });
    expect(superbetPick('AH:AWAY:-0.5', 'A', 'Heerenveen')).toMatchObject({ market: 'Final (1X2)', pick: '2' });
    expect(superbetPick('AH:HOME:0.5', 'Pau', 'B')).toMatchObject({ market: 'Șansă dublă', pick: '1X' });
    expect(superbetPick('AH:HOME:1.5', 'Pau', 'B')).toMatchObject({ market: 'Handicap asiatic', pick: 'Pau +1.5' });
  });
});
