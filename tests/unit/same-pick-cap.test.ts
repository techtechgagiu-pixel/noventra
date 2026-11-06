import { expect, it } from 'vitest';
import { MAX_SAME_PICK, samePickBlocked } from '@/lib/jobs/pipeline';

it('a pick may be on at most 2 open tickets', () => {
  expect(MAX_SAME_PICK).toBe(2);
  expect([0, 1].map(samePickBlocked)).toEqual([false, false]);
  expect([2, 3].map(samePickBlocked)).toEqual([true, true]);
});
