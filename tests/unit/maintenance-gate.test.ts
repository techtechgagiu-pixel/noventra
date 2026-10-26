import { expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { maintenanceGate } from '@/lib/d1/maintenance-gate';
import { proxy } from '@/proxy';

it('fails closed for page/API/auth requests and tampered or expired cookies', async () => {
  for(const path of ['/','/api/custom-tickets','/auth/callback'])expect((await maintenanceGate(new Request('https://app.example'+path),true))?.status).toBe(503);
  expect(await maintenanceGate(new Request('https://app.example/'),false)).toBeNull();
  expect(await maintenanceGate(new Request('https://app.example/_internal/database'),true)).toBeNull();
  for(const cookie of ['bm_migration=broken','bm_migration=99999999999.fake'])expect((await maintenanceGate(new Request('https://app.example/',{headers:{cookie}}),true,'test-secret'))?.status).toBe(503);
});

it('unlocks only with the key and same origin, without granting app authentication',async()=>{
  const now=Date.now(),secret='a-private-key-only-for-migration';
  const request=(origin:string,code:string)=>new Request('https://app.example/_migration/unlock',{method:'POST',headers:{origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code})});
  expect((await maintenanceGate(request('https://evil.example',secret),true,secret,now))?.status).toBe(503);
  expect((await maintenanceGate(request('https://app.example','wrong'),true,secret,now))?.status).toBe(403);
  const response=(await maintenanceGate(request('https://app.example',secret),true,secret,now))!;
  expect(response.status).toBe(303);expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax');expect(response.headers.get('set-cookie')).not.toContain('bm_sid');
  const cookie=response.headers.get('set-cookie')!.split(';')[0];
  expect(await maintenanceGate(new Request('https://app.example/',{headers:{cookie}}),true,secret,now+1000)).toBeNull();
  expect((await maintenanceGate(new Request('https://app.example/',{headers:{cookie}}),true,secret,now+3601000))?.status).toBe(503);
});

it('freezes the old origin and limits the runner to health',()=>{
  const savedMaintenance=process.env.BETMIND_MAINTENANCE,savedRunner=process.env.BETMIND_RUNNER_ONLY,savedBase=process.env.APP_BASE_URL;
  try{
    process.env.BETMIND_MAINTENANCE='1';expect(proxy(new NextRequest('https://app.example/auth/callback')).status).toBe(503);expect(proxy(new NextRequest('https://app.example/api/health')).status).toBe(200);
    process.env.BETMIND_MAINTENANCE='0';process.env.BETMIND_RUNNER_ONLY='1';expect(proxy(new NextRequest('https://runner.example/')).status).toBe(404);expect(proxy(new NextRequest('https://runner.example/api/health')).status).toBe(200);
    process.env.APP_BASE_URL='https://app.example';expect(proxy(new NextRequest('https://app.example/')).status).toBe(200);
  }finally{
    if(savedMaintenance===undefined)delete process.env.BETMIND_MAINTENANCE;else process.env.BETMIND_MAINTENANCE=savedMaintenance;
    if(savedRunner===undefined)delete process.env.BETMIND_RUNNER_ONLY;else process.env.BETMIND_RUNNER_ONLY=savedRunner;
    if(savedBase===undefined)delete process.env.APP_BASE_URL;else process.env.APP_BASE_URL=savedBase;
  }
});
