import { expect, it } from 'vitest';
import { preferUnused } from '@/lib/jobs/pipeline';

it('puts selections already on the user\'s other open tickets last, keeping the rest in order', () => {
  expect(preferUnused(['DC:X2', 'TOTAL:OVER:1.5', 'BTTS:YES'], new Set(['DC:X2']))).toEqual(['TOTAL:OVER:1.5', 'BTTS:YES', 'DC:X2']);
  expect(preferUnused(['DC:X2'], new Set(['DC:X2']))).toEqual(['DC:X2']);
  expect(preferUnused(['A', 'B'], new Set())).toEqual(['A', 'B']);
});
