import { describe, expect, it } from 'vitest';
import { customSearchSize } from '@/lib/slots';

const base = { maxFixtures: 48, batchSize: 3 };
describe('customSearchSize', () => {
  it('keeps the usual 4 matches per leg when the agents need not all agree', () => {
    expect(customSearchSize({ legs: 12, agents: ['a', 'b', 'c'], minAgree: 2 }, base)).toEqual({ maxFixtures: 48, batchSize: 3 });
    expect(customSearchSize({ legs: 3, agents: ['a', 'b', 'c'] }, base)).toEqual({ maxFixtures: 12, batchSize: 3 });
  });
  it('searches wider and in bigger batches when every agent must agree', () => {
    expect(customSearchSize({ legs: 12, agents: ['a', 'b', 'c'], minAgree: 3 }, base)).toEqual({ maxFixtures: 144, batchSize: 6 });
    expect(customSearchSize({ legs: 20, agents: ['a', 'b', 'c'], minAgree: 3 }, base).maxFixtures).toBe(150);
    expect(customSearchSize({ legs: 2, agents: ['a', 'b', 'c'], minAgree: 3 }, base).maxFixtures).toBe(24);
  });
  it('does not shrink a batch that is already bigger', () => {
    expect(customSearchSize({ legs: 5, agents: ['a', 'b'], minAgree: 2 }, { maxFixtures: 30, batchSize: 8 }).batchSize).toBe(8);
  });
});
