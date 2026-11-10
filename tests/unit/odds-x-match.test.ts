import { describe, expect, it } from 'vitest';
import { parseCustom } from '@/lib/jobs/service';

const base = { target: 10, agents: ['victor'] };

describe('oddsxmatch: picked fixtures', () => {
  it('uses the number of picked matches as legs', () => {
    const c = parseCustom({ ...base, legs: 99, fixtures: ['a:1', 'a:2', 'a:3'] });
    expect(c.legs).toBe(3);
    expect(c.fixtures).toEqual(['a:1', 'a:2', 'a:3']);
  });
  it('drops duplicates and invalid ids, keeps legs from the form otherwise', () => {
    const c = parseCustom({ target: 3, agents: ['victor'], legs: 5, fixtures: ['a:1', 'a:1', '<x>', 'ab', 'a:2'] });
    expect(c.fixtures).toEqual(['a:1', 'a:2']);
    expect(c.legs).toBe(2);
  });
  it('has no fixtures key without picks', () => {
    expect(parseCustom({ ...base, legs: 3 }).fixtures).toBeUndefined();
  });
  it('carries the bold flag together with picks', () => {
    expect(parseCustom({ ...base, fixtures: ['a:1', 'a:2'], bold: true }).bold).toBe(true);
  });
  it('rejects a target that needs too high odds per match', () => {
    expect(() => parseCustom({ target: 1000, agents: ['victor'], fixtures: ['a:1', 'a:2'] })).toThrow();
  });
});
