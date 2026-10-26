import { expect,test } from '@playwright/test';
import pg from 'pg';

test('terminal metadata cannot discard the final unread event page',async({page})=>{
  const db=new pg.Client({connectionString:process.env.E2E_DATABASE_URL||'postgresql://postgres@localhost:5433/betmind_e2e'});await db.connect();
  try{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto('/auth/test-login?email=terminal-drain@test.local');
    const user=(await db.query("SELECT id FROM users WHERE email='terminal-drain@test.local'")).rows[0].id;
    // A paused synthetic record prevents the actual runner from executing this fixture.
    const job=(await db.query("INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status) VALUES($1,'CUSTOM_96',current_date,2,'event-drain','{}','{}','PAUSED') RETURNING id",[user])).rows[0].id;
    const requested:number[]=[];
    const event=(seq:number,note:string)=>({seq,type:'JOB_RESUMED',stage:'QUEUED',payload:{note},createdAt:new Date().toISOString()});
    const meta={id:job,title:'CUSTOM — COTĂ 2',target:2,status:'COMPLETED',lastSeq:3,ticketId:null,nextRunAt:new Date().toISOString(),lastError:null,mine:true};
    await page.route(`**/api/jobs/${job}/events?*`,async route=>{
      const after=Number(new URL(route.request().url()).searchParams.get('after'));requested.push(after);
      const events=after<2?[event(1,'Primul mesaj.'),event(2,'Al doilea mesaj.')]:[event(3,'Ultimul mesaj a ajuns după starea finalizată.')];
      const body=events.filter(e=>e.seq>after).map(e=>`id: ${e.seq}\nevent: job\ndata: ${JSON.stringify(e)}\n\n`).join('')+`event: meta\ndata: ${JSON.stringify(meta)}\n\nevent: end\ndata: {}\n\n`;
      await route.fulfill({status:200,contentType:'text/event-stream',body});
    });
    const before=(await(await page.request.get('/api/test/stats')).json()).aiCalls;
    await page.goto(`/?tab=custom&job=${job}`);
    await expect(page.getByRole('log')).toContainText('Ultimul mesaj a ajuns după starea finalizată.');
    expect(requested).toContain(2);
    expect((await(await page.request.get('/api/test/stats')).json()).aiCalls).toBe(before);
  }finally{await db.end();}
});

test('the transcript receives new messages while the debate canvas is offscreen',async({page})=>{
  const db=new pg.Client({connectionString:process.env.E2E_DATABASE_URL||'postgresql://postgres@localhost:5433/betmind_e2e'});await db.connect();
  let release!:()=>void;const nextPage=new Promise<void>(resolve=>{release=resolve;});
  try{
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto('/auth/test-login?email=offscreen-chat@test.local');
    const user=(await db.query("SELECT id FROM users WHERE email='offscreen-chat@test.local'")).rows[0].id;
    const job=(await db.query("INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status) VALUES($1,'CUSTOM_95',current_date,2,'offscreen-chat','{}','{}','PAUSED') RETURNING id",[user])).rows[0].id;
    await page.route(`**/api/jobs/${job}/events?*`,async route=>{
      const after=Number(new URL(route.request().url()).searchParams.get('after'));
      if(after)await nextPage;
      const seq=after?2:1,note=after?'Mesajul continuă când citesc sub hartă.':'Primul mesaj înainte de derulare.';
      const event={seq,type:'JOB_RESUMED',stage:'QUEUED',payload:{note},createdAt:new Date().toISOString()};
      const meta={id:job,title:'CUSTOM — COTĂ 2',target:2,status:after?'COMPLETED':'RUNNING',lastSeq:2,ticketId:null,nextRunAt:new Date().toISOString(),lastError:null,mine:true};
      await route.fulfill({status:200,contentType:'text/event-stream',body:`id: ${seq}\nevent: job\ndata: ${JSON.stringify(event)}\n\nevent: meta\ndata: ${JSON.stringify(meta)}\n\nevent: end\ndata: {}\n\n`});
    });
    const before=(await(await page.request.get('/api/test/stats')).json()).aiCalls;
    await page.goto(`/?tab=custom&job=${job}`);
    await expect(page.getByRole('log')).toContainText('Primul mesaj înainte de derulare.');
    // This short fixture needs scroll room that a full debate naturally has.
    await page.addStyleTag({content:'body::after{content:"";display:block;height:100vh}'});
    await page.getByRole('log').evaluate(el=>el.scrollIntoView({block:'start'}));
    await expect.poll(()=>page.getByRole('img',{name:/Harta live/}).evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
    release();
    await expect(page.getByRole('log')).toContainText('Mesajul continuă când citesc sub hartă.');
    expect((await(await page.request.get('/api/test/stats')).json()).aiCalls).toBe(before);
  }finally{release();await db.end();}
});
