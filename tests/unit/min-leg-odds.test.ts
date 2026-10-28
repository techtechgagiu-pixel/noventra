import { expect, it, vi } from 'vitest';
vi.mock('@/lib/db', async (orig) => ({ ...await orig<typeof import('@/lib/db')>(), many: vi.fn(async () => []), one: vi.fn(async () => null), query: vi.fn(async () => ({})) }));
import { parseCustom } from '@/lib/jobs/service';
import { customPolicy } from '@/lib/slots';

const base = { target: 5, legs: 6, agents: ['victor', 'andrei'], fromHours: 2, toHours: 48 };
it('keeps the user minimum odds per selection and raises the policy floor to it', () => {
  const c = parseCustom({ ...base, minLegOdds: 1.15 });
  expect(c.minLegOdds).toBe(1.15);
  expect(customPolicy(c).minOdds).toBe(1.15);
  expect(customPolicy(parseCustom(base)).minOdds).toBe(1.1);
});
it('refuses a minimum above the average the target needs', () => {
  expect(() => parseCustom({ ...base, minLegOdds: 1.4 })).toThrow(/peste media necesară/);
  expect(() => parseCustom({ ...base, minLegOdds: 3 })).toThrow(/între 1.01 și 2.00/);
});
