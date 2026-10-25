import { describe, expect, it } from 'vitest';
import { archiveResult } from '@/lib/archive-visibility';
const ticket = (...outcomes: string[]) => ({ generation_status: 'COMPLETED', selections: outcomes.map((outcome) => ({ outcome })) });
describe('archive display follows saved selection results', () => {
  it('keeps pending, green and exactly one red, including a loss before other matches finish', () => {
    expect(archiveResult(ticket('WON', 'PENDING'))).toBe('PENDING');
    expect(archiveResult(ticket('WON', 'WON', 'VOID'))).toBe('WON');
    expect(archiveResult(ticket('LOST', 'WON'))).toBe('ONE_LOSS');
    expect(archiveResult(ticket('LOST', 'PENDING'))).toBe('ONE_LOSS');
    expect(archiveResult(ticket('LOST', 'LOST', 'PENDING'))).toBeNull();
  });
  it('reclassifies as results arrive without trusting an outdated ticket-level status', () => {
    const t = { ...ticket('PENDING', 'PENDING'), outcome_status: 'PENDING' };
    expect(archiveResult(t)).toBe('PENDING');
    t.selections[0].outcome = 'LOST'; expect(archiveResult(t)).toBe('ONE_LOSS');
    t.selections[1].outcome = 'LOST'; expect(archiveResult(t)).toBeNull();
  });
  it('uses accepted picks from incomplete tickets and never labels void/empty/unknown as green', () => {
    expect(archiveResult({ generation_status: 'INCOMPLETE', selections: [], partialSelections: ticket('WON', 'PENDING').selections })).toBe('PENDING');
    expect(archiveResult({ generation_status: 'INCOMPLETE', selections: [], partialSelections: ticket('WON', 'LOST', 'LOST').selections })).toBeNull();
    expect(archiveResult(ticket('VOID', 'VOID'))).toBeNull();
    expect(archiveResult(ticket())).toBeNull();
    expect(archiveResult(ticket('UNKNOWN'))).toBeNull();
    expect(archiveResult({ ...ticket('PENDING'), generation_status: 'NO_BET' })).toBeNull();
  });
});
