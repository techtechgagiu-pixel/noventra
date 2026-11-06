import { expect, it } from 'vitest';
import { MAX_SAME_PICK, samePickBlocked } from '@/lib/jobs/pipeline';

it('a pick may be on at most 3 open tickets', () => {
  expect(MAX_SAME_PICK).toBe(3);
  expect([0, 1, 2].map(samePickBlocked)).toEqual([false, false, false]);
  expect([3, 4].map(samePickBlocked)).toEqual([true, true]);
});
