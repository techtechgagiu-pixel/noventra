import { describe, expect, it } from 'vitest';
import { retryRead, isTransientD1Error } from '../../src/lib/d1/client';

describe('D1 read retry', () => {
  it('retries a transient read and succeeds', async () => {
    let n = 0;
    const out = await retryRead('SELECT 1', async () => { if (++n < 3) throw new Error('D1_ERROR: Network connection lost'); return 'ok'; }, [1, 1]);
    expect(out).toBe('ok'); expect(n).toBe(3);
  });
  it('never repeats a write', async () => {
    let n = 0;
    await expect(retryRead('UPDATE t SET a=1', async () => { n++; throw new Error('Network connection lost'); }, [1, 1])).rejects.toThrow();
    expect(n).toBe(1);
  });
  it('does not retry real errors', async () => {
    let n = 0;
    await expect(retryRead('SELECT x', async () => { n++; throw new Error('no such column: x'); }, [1])).rejects.toThrow();
    expect(n).toBe(1); expect(isTransientD1Error(new Error('no such column'))).toBe(false);
  });
});
