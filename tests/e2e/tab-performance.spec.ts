import { expect, test } from '@playwright/test';
import pg from 'pg';

test('statistics fetches a history only when expanded, retries errors and preserves personal scope',async({page})=>{
  await page.goto('/auth/test-login?email=lazy-history@test.local');
  const db=new pg.Client({connectionString:process.env.E2E_DATABASE_URL});await db.connect();
  try {
    const user=(await db.query("SELECT id FROM users WHERE email='lazy-history@test.local'")).rows[0].id;
    const job=(await db.query("INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES($1,'CUSTOM_98',current_date,5,'lazy-history','{}','{}','COMPLETED','DONE') RETURNING id",[user])).rows[0].id;
    await db.query("INSERT INTO fixtures(id,provider,provider_id,league_id,home_team,away_team,kickoff_utc,status,home_score,away_score,content_hash) VALUES('demo:lazy-history','demo','lazy-history','ENG1','DEMO lazy home','DEMO lazy away',now(),'post',2,0,'lazy-history')");
    await db.query("INSERT INTO agent_predictions(job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,odds,payload,outcome) VALUES($1,'demo:lazy-history','robert',0,'demo','demo','v1','BET_CANDIDATE','1X2:HOME',1.5,'{}','WON')",[job]);
    let requests=0;
    await page.route('**/api/agents/robert/history?*',async route=>{
      requests++;
      if(requests===1)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporar indisponibil'})});
      else await route.continue();
    });
    const response=await page.goto('/?tab=statistici&luna=all&scope=mine');
    await expect(page.locator('#agent-robert')).toContainText('Pronosticuri și rezultate (1)');
    expect(requests).toBe(0);
    expect(await response!.text()).not.toContain('DEMO lazy home');
    const card=page.locator('#agent-robert');
    await card.getByText('Pronosticuri și rezultate (1)',{exact:true}).click();
    await expect(card.getByRole('alert')).toContainText('Temporar indisponibil');
    await card.getByRole('button',{name:'Reîncearcă',exact:true}).click();
    await expect(card.locator('li')).toContainText('DEMO lazy home');
    expect(requests).toBe(2);
    const history=await page.request.get('/api/agents/robert/history?month=all&scope=mine');
    expect((await history.json()).entries).toHaveLength(1);
    expect((await page.request.get('/api/agents/unknown/history')).status()).toBe(404);
  }finally{await db.end();}
});

test('tab click gives immediate feedback during a slow server response without a document reload',async({page})=>{
  await page.goto('/auth/test-login?email=tab-speed@test.local');
  await page.goto('/?tab=acasa');
  await expect(page.getByRole('heading',{name:'Biletul tău începe cu o dezbatere.'})).toBeVisible();
  let release!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(url=>url.searchParams.get('tab')==='custom'&&url.searchParams.has('_rsc'),async route=>{await held;await route.continue();});
  const link=page.getByRole('navigation',{name:'Secțiuni'}).getByRole('link',{name:'Custom',exact:true});
  try{
    await link.click();
    await expect(link.locator('[data-pending="true"]')).toBeVisible();
  }finally{release();}
  await expect(page.getByRole('heading',{name:'Bilet custom',exact:true})).toBeVisible();
  await expect(link).toHaveAttribute('aria-current','page');
});
