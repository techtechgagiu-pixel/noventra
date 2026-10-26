import { afterEach, expect, it, vi } from 'vitest';
import { wakeAnalysisRunner } from '@/lib/d1/scheduled';

vi.mock('@/lib/db',()=>({one:vi.fn(),query:vi.fn(async()=>({}))}));
vi.mock('@/lib/settlement',()=>({settlePending:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});

it('uses a redirect mode supported by the Cloudflare runtime and does not forward a redirect',async()=>{
  const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{
    if(init?.redirect==='error')throw new TypeError('Invalid redirect value');
    expect(init?.redirect).toBe('manual');
    return new Response('{}',{status:200});
  });vi.stubGlobal('fetch',fetcher);
  expect(await wakeAnalysisRunner('https://example.onrender.com')).toEqual({status:'awake',httpStatus:200});
  expect(String(fetcher.mock.calls[0][0])).toBe('https://example.onrender.com/api/health');
  fetcher.mockImplementationOnce(async()=>new Response(null,{status:302,headers:{location:'https://other.example/'}}));
  expect(await wakeAnalysisRunner('https://example.onrender.com')).toEqual({status:'starting',httpStatus:302});
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('reports network failures and refuses unexpected runner origins',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('network unavailable');}));
  expect(await wakeAnalysisRunner('https://example.onrender.com')).toMatchObject({status:'starting',reason:'TypeError: network unavailable'});
  await expect(wakeAnalysisRunner('https://example.com')).rejects.toThrow('Invalid Render runner origin');
  expect(await wakeAnalysisRunner(undefined)).toEqual({status:'not-configured'});
});
