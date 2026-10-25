import { expect,test } from '@playwright/test';
import pg from 'pg';

test('archive filters, agent history and every statistics view use the same saved records',async({page})=>{
 const db=new pg.Client({connectionString:process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/betmind_e2e'});await db.connect();
 try {
  await page.goto('/auth/test-login?email=stats-sync@test.local');
  const user=(await db.query(`SELECT id FROM users WHERE email='stats-sync@test.local'`)).rows[0].id;
  const job=(await db.query(`INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES($1,'CUSTOM_99',current_date,5,'stats-sync','{}','{}','COMPLETED','DONE') RETURNING id`,[user])).rows[0].id;
  for(let i=0;i<17;i++){
   const id=`demo:stats-sync:${i}`,out=i<12?'WON':i<16?'LOST':null;
   await db.query(`INSERT INTO fixtures(id,provider,provider_id,league_id,home_team,away_team,kickoff_utc,status,home_score,away_score,content_hash) VALUES($1,'demo',$1,'ENG1',$2,'DEMO Away',now()+($3::int * interval '1 day'),$4,$5,$6,'stats-sync')`,[id,`DEMO Stats ${i}`,out?-1:1,out?'post':'pre',out==='WON'?2:out===null?null:0,out==='LOST'?1:out===null?null:0]);
   await db.query(`INSERT INTO agent_predictions(job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,odds,estimated_probability,payload,outcome) VALUES($1,$2,'robert',0,'demo','demo','v1','BET_CANDIDATE','1X2:HOME',1.5,0.7,$3,$4)`,[job,id,JSON.stringify({marketLabel:`DEMO Stats ${i} câștigă`}),out]);
  }
  const before=await(await page.request.get('/api/test/stats')).json();
  const stats=await(await page.request.get('/api/statistics?month=all&scope=all')).json();
  const a=stats.agents.find((x:any)=>x.id==='robert');
  const records=await(await page.request.get('/api/agents?month=all')).json();
  const record=records.agents.find((x:any)=>x.id==='robert').trackRecord;
  expect(record.decided).toBe(a.won+a.lost);expect(record.won).toBe(a.won);expect(record.avgOdds).toBeCloseTo(a.avgOdds,8);expect(record.avgEstimated).toBeCloseTo(a.avgEstimated,8);
  expect(a.recent.filter((p:any)=>p.decision==='BET_CANDIDATE'&&p.outcome==='WON')).toHaveLength(a.won);
  expect(a.recent.length).toBe(a.bets+a.noBet);
  const mine=await(await page.request.get('/api/statistics?month=all&scope=mine')).json();
  const personal=mine.agents.find((x:any)=>x.id==='robert');
  expect(personal).toMatchObject({bets:17,won:12,lost:4,pending:1,avgOdds:1.5});
  expect(personal.avgEstimated).toBeCloseTo(0.7,8);
  await page.goto('/?tab=statistici&luna=all&scope=all');
  const card=page.getByRole('region',{name:'Agenții'}).locator('article').filter({hasText:'Mircea Lucescu'});
  await card.getByText(/Pronosticuri și rezultate/).click();
  await card.getByLabel('Rezultate Mircea Lucescu').selectOption('WON');
  await expect(card.getByRole('option',{name:`Verzi (${a.won})`,exact:true})).toHaveCount(1);
  await expect(card.locator('li')).toHaveCount(Math.min(a.won,8));
  await card.getByRole('button',{name:'Pagina următoare Mircea Lucescu'}).click();
  await expect(card).toContainText(`9–${Math.min(a.won,16)} din ${a.won}`);
  await page.goto('/?tab=istoric');
  const allTickets=(await(await page.request.get('/api/tickets')).json()).tickets;
  const performance=await(await page.request.get('/api/performance')).json();
  expect(performance.tickets.total).toBe(allTickets.length);
  const summary=page.getByRole('region',{name:'Performanța biletelor afișate'});
  // The archive intentionally hides empty/NO_BET and tickets with multiple red legs.
  // Its summary must match the visible creator-filter count; the API retains the full history.
  const count=async(label:RegExp)=>Number((await page.getByRole('option',{name:label}).textContent())!.match(/\((\d+)\)/)![1]);
  const visible=await count(/^toată lumea/);expect(visible).toBeLessThanOrEqual(allTickets.length);
  await expect(summary.getByText('Bilete afișate',{exact:true}).locator('..')).toContainText(String(visible));
  await page.getByLabel('Creat de').selectOption('mine');
  await expect(summary.getByText('Bilete afișate',{exact:true}).locator('..')).toContainText(String(await count(/^mine/)));
  const after=await(await page.request.get('/api/test/stats')).json();expect(after.aiCalls).toBe(before.aiCalls);
 }finally{await db.end();}
});
