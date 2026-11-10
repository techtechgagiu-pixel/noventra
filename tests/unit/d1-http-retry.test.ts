import { afterEach, describe, expect, it, vi } from 'vitest';
import { d1HttpDatabase } from '@/lib/d1/http-client';

const ok = () => new Response(JSON.stringify({ results: [{ rows: [{ n: 1 }], rowCount: 0 }] }), { status: 200 });
const busy = () => new Response(JSON.stringify({ error: 'database_unavailable' }), { status: 503 });

describe('D1 bridge client (perf 10.11)', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  const db = () => d1HttpDatabase('http://127.0.0.1:1', 'test-secret-not-a-production-credential-000000000000');

  it('sends a read again after D1 did not answer, with a fresh nonce', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok());
    const r = await db().query('SELECT 1 AS n');
    expect(r.rows).toEqual([{ n: 1 }]);
    expect(spy).toHaveBeenCalledTimes(2);
    const nonces = spy.mock.calls.map((c) => (c[1]!.headers as Record<string, string>)['x-p11-nonce']);
    expect(new Set(nonces).size).toBe(2);
  });

  it('retries a read after a network error too, then gives up after two retries', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(db().query('SELECT 1 AS n')).rejects.toThrow('D1 bridge: network_error');
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('never repeats a write', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(busy());
    await expect(db().query("UPDATE users SET name='x' WHERE id='y'")).rejects.toThrow('D1 bridge: database_unavailable');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    await expect(db().batch!([{ text: 'SELECT 1' }, { text: "DELETE FROM sessions WHERE id='z'" }])).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not retry a refused request (4xx)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'database_operation_failed' }), { status: 409 }));
    await expect(db().query('SELECT 1')).rejects.toThrow('database_operation_failed');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
