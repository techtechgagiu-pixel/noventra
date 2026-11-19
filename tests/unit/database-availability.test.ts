import { expect, it, vi, afterEach } from 'vitest';
import { databaseIssue } from '@/lib/database-availability';
vi.mock('@/lib/db',()=>({one:vi.fn()}));
import { one } from '@/lib/db';
import { GET } from '@/app/api/health/route';
afterEach(()=>vi.resetAllMocks());
it('classifies exhausted database quotas without treating unrelated errors as quotas',()=>{
  expect(databaseIssue(new Error('Your account or project has exceeded the quota. Upgrade your plan to increase limits.'))).toBe('quota');
  expect(databaseIssue(new Error('ECONNREFUSED'))).toBe('unavailable');
});
it('reports a safe quota code and HTTP 503 without leaking the original database error',async()=>{
  vi.mocked(one).mockRejectedValueOnce(new Error('Your account or project has exceeded the quota. secret-host-and-password'));
  const res=await GET();const body=await res.json();expect(res.status).toBe(503);expect(body).toMatchObject({status:'degraded',database:'unavailable',databaseIssue:'quota'});expect(JSON.stringify(body)).not.toContain('secret-host');
});
it('keeps the healthy contract and omits outage reasons after database recovery',async()=>{
  vi.mocked(one).mockResolvedValueOnce({ok:1});const res=await GET();const body=await res.json();expect(res.status).toBe(200);expect(body.database).toBe('ok');expect(body).not.toHaveProperty('databaseIssue');
});
it('shows the configuration only to callers with the server secret', async () => {
  const before = process.env.D1_BRIDGE_SECRET; process.env.D1_BRIDGE_SECRET = 'health-test-secret';
  try {
    vi.mocked(one).mockResolvedValue({ ok: 1 });
    const open = await (await GET(new Request('https://app.example/api/health'))).json();
    expect(Object.keys(open).sort()).toEqual(['database', 'status', 'time']);
    const wrong = await (await GET(new Request('https://app.example/api/health', { headers: { 'x-p11-health': 'nope' } }))).json();
    expect(wrong).not.toHaveProperty('ai');
    const full = await (await GET(new Request('https://app.example/api/health', { headers: { 'x-p11-health': 'health-test-secret' } }))).json();
    expect(full).toHaveProperty('ai'); expect(full).toHaveProperty('runnerOnly');
  } finally { if (before === undefined) delete process.env.D1_BRIDGE_SECRET; else process.env.D1_BRIDGE_SECRET = before; }
});
