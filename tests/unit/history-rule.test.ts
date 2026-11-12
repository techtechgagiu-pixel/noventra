import { describe, expect, it } from 'vitest';
import { rejectedOnlyForHistory } from '@/lib/jobs/analysis';

const ok = { fixtureStillPreMatch: true, oddsAvailable: true, oddsFresh: true, bookmakerIdentified: true, selectionConsistent: true, probabilityPlausible: true, evNotStronglyNegative: true };

describe('missing team history no longer drops a backed selection (owner rule 12.11)', () => {
  it('counts a selection that failed only the history check', () => {
    expect(rejectedOnlyForHistory({ ...ok, dataSufficient: false })).toBe(true);
  });
  it('still drops a selection that also failed a price check', () => {
    expect(rejectedOnlyForHistory({ ...ok, dataSufficient: false, oddsFresh: false })).toBe(false);
    expect(rejectedOnlyForHistory({ ...ok, dataSufficient: false, evNotStronglyNegative: false })).toBe(false);
    expect(rejectedOnlyForHistory({ ...ok, dataSufficient: false, fixtureStillPreMatch: false })).toBe(false);
  });
  it('ignores rows without the old history failure or without a validation', () => {
    expect(rejectedOnlyForHistory({ ...ok, dataSufficient: true, oddsAvailable: false })).toBe(false);
    expect(rejectedOnlyForHistory(null)).toBe(false);
  });
});
