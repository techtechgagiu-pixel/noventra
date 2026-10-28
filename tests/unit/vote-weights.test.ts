import { afterEach, expect, it } from 'vitest';
import { weightsFrom } from '@/lib/vote-weights';
import { consensus, setVoteWeights, type FinalPosition } from '@/lib/jobs/analysis';

afterEach(() => setVoteWeights(null));
const rows = (id: string, model: string, won: number, lost: number) => [
  ...Array.from({ length: won }, () => ({ agent_id: id, model_id: model, outcome: 'WON' })),
  ...Array.from({ length: lost }, () => ({ agent_id: id, model_id: model, outcome: 'LOST' })),
];

it('gives strong agents a little more weight, weak ones a little less, new models exactly 1', () => {
  const data = [...rows('strong', 'm1', 170, 40), ...rows('weak', 'm2', 130, 90), ...rows('swapped', 'old', 10, 90)];
  const w = weightsFrom(data, new Map([['strong', 'm1'], ['weak', 'm2'], ['swapped', 'new'], ['fresh', 'x']]));
  expect(w.get('strong')!).toBeGreaterThan(1.05);
  expect(w.get('weak')!).toBeLessThan(0.95);
  expect(w.get('swapped')).toBe(1);
  expect(w.get('fresh')).toBe(1);
  for (const v of w.values()) { expect(v).toBeGreaterThanOrEqual(0.8); expect(v).toBeLessThanOrEqual(1.2); }
});

it('three weak votes no longer reach a threshold of 3, three strong ones do', () => {
  const pos = (ids: string[], key: string) => ids.map((agentId) => ({ agentId, decision: 'BET_CANDIDATE', marketKey: key, estimatedProbability: 0.8, confidence: 70, risk: 'LOW', round: 0, rationale: '', provider: 'x', model: 'x', alternatives: [] }) as FinalPosition);
  const keys = [{ key: 'DC:1X', odds: 1.3 }];
  expect(consensus(pos(['a', 'b', 'c'], 'DC:1X'), 3, 9, keys).outcome).toBe('QUALIFIED');
  setVoteWeights(new Map([['a', 0.9], ['b', 0.9], ['c', 0.9], ['x', 1.1], ['y', 1.1], ['z', 1.1]]));
  expect(consensus(pos(['a', 'b', 'c'], 'DC:1X'), 3, 9, keys).outcome).not.toBe('QUALIFIED');
  const strong = consensus(pos(['x', 'y', 'z'], 'DC:1X'), 3, 9, keys);
  expect(strong.outcome).toBe('QUALIFIED');
  expect(strong.votesFor).toBe(3);
});
