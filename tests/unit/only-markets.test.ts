import { describe, expect, it } from 'vitest';
import { marketAllowedBy } from '@/lib/slots';

describe('ticket restricted to GG / over 2.5', () => {
  it('allows everything when nothing is ticked', () => {
    expect(marketAllowedBy(undefined, 'DC:1X')).toBe(true);
    expect(marketAllowedBy([], '1X2:HOME')).toBe(true);
  });
  it('GG only keeps BTTS:YES', () => {
    expect(marketAllowedBy(['BTTS'], 'BTTS:YES')).toBe(true);
    expect(marketAllowedBy(['BTTS'], 'BTTS:NO')).toBe(false);
    expect(marketAllowedBy(['BTTS'], 'TOTAL:OVER:2.5')).toBe(false);
  });
  it('over 2.5 only keeps that exact line', () => {
    expect(marketAllowedBy(['OVER25'], 'TOTAL:OVER:2.5')).toBe(true);
    expect(marketAllowedBy(['OVER25'], 'TOTAL:OVER:1.5')).toBe(false);
    expect(marketAllowedBy(['OVER25'], 'TOTAL:UNDER:2.5')).toBe(false);
  });
  it('both ticked accepts either', () => {
    expect(marketAllowedBy(['BTTS', 'OVER25'], 'BTTS:YES')).toBe(true);
    expect(marketAllowedBy(['BTTS', 'OVER25'], 'TOTAL:OVER:2.5')).toBe(true);
    expect(marketAllowedBy(['BTTS', 'OVER25'], 'DC:X2')).toBe(false);
  });
});
