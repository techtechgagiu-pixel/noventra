import { expect, it } from 'vitest';
import { preferUnused } from '@/lib/jobs/pipeline';

it('puts selections already on the user\'s other open tickets last, keeping the rest in order', () => {
  expect(preferUnused(['DC:X2', 'TOTAL:OVER:1.5', 'BTTS:YES'], new Set(['DC:X2']))).toEqual(['TOTAL:OVER:1.5', 'BTTS:YES', 'DC:X2']);
  expect(preferUnused(['DC:X2'], new Set(['DC:X2']))).toEqual(['DC:X2']);
  expect(preferUnused(['A', 'B'], new Set())).toEqual(['A', 'B']);
});

import { diversityFactor } from '@/lib/jobs/pipeline';
it('lowers the weight of matches and market types the user already has on many open tickets', () => {
  expect(diversityFactor(0, 0)).toBe(1);
  expect(diversityFactor(0, 0.3)).toBe(1);
  expect(diversityFactor(2, 0)).toBeCloseTo(0.7225);
  expect(diversityFactor(0, 0.5)).toBeCloseTo(0.9);
  expect(diversityFactor(9, 0)).toBeCloseTo(diversityFactor(5, 0));
});
