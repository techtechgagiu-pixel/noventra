import { expect, it } from 'vitest';
import { CREDITS_DAILY_CAP, CREDITS_MAX_LEGS, maxLegsForUser } from '@/lib/credits';

it('with credits on, only technical ceilings remain', async () => {
  expect(CREDITS_DAILY_CAP).toBe(30);
  expect(await maxLegsForUser({ id: 'x', email: 'a@b.c' })).toBe(CREDITS_MAX_LEGS);
});
