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
