import { describe, expect, it, vi, beforeEach } from 'vitest';
import { memo, clearMemo } from '@/lib/memo';
import { finalAgentPicksCte } from '@/lib/final-agent-picks';

describe('memo (perf 07.11)', () => {
  beforeEach(() => clearMemo());
  it('shares one load between concurrent callers and reuses it within the TTL', async () => {
    const load = vi.fn(async () => 42);
    const [a, b] = await Promise.all([memo('k', 1000, load), memo('k', 1000, load)]);
    expect([a, b]).toEqual([42, 42]);
    expect(await memo('k', 1000, load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('reloads after the TTL and keeps the old value when a reload fails', async () => {
    let n = 0;
    expect(await memo('x', 0, async () => ++n)).toBe(1);
    await expect(memo('x', 0, async () => { throw new Error('db'); })).rejects.toThrow('db');
    expect(await memo('x', 60_000, async () => 99)).toBe(1);
  });
});

describe('finalAgentPicksCte fixture scope', () => {
  it('adds the scope inside the ranking, next to the sport filter', () => {
    const sql = finalAgentPicksCte(false, 'all', 'p.fixture_id IN (SELECT fixture_id FROM agent_predictions WHERE job_id=$1)');
    expect(sql).toMatch(/WHERE p\.fixture_id IN \(SELECT fixture_id FROM agent_predictions WHERE job_id=\$1\)\s+\), final_round/);
    expect(finalAgentPicksCte(false, 'all')).not.toMatch(/j\.id=p\.job_id\s+WHERE/);
  });
});
