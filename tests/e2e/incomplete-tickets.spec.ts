import { expect, test } from '@playwright/test';
import pg from 'pg';

test('incomplete archive and detail show validated matches and refresh their results without becoming a completed ticket', async ({ page }) => {
  await page.goto('/auth/test-login?email=incomplete-view@test.local');
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/betmind_e2e' });
  await db.connect();
  let ticket: string;
  try {
    const user = (await db.query("SELECT id FROM users WHERE email='incomplete-view@test.local'")).rows[0].id;
    const job = (await db.query(`INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES($1,'CUSTOM_77',current_date,50,'partial','{}','{}','INCOMPLETE','DONE') RETURNING id`,[user])).rows[0].id;
    ticket = (await db.query(`INSERT INTO tickets(job_id,user_id,slot,period_key,target_odds,leg_count,generation_status,outcome_status,summary) VALUES($1,$2,'CUSTOM_77',current_date,50,0,'INCOMPLETE','NOT_APPLICABLE','{"agents":7,"reason":"DEMO ținta nu a fost atinsă"}') RETURNING id`,[job,user])).rows[0].id;
    for (let i=0;i<4;i++) {
      const id=`demo:incomplete-ui-${i}`, home=`DEMO Incomplete Home ${i}`, away=`DEMO Incomplete Away ${i}`;
      await db.query(`INSERT INTO fixtures(id,provider,provider_id,league_id,home_team,away_team,kickoff_utc,status,home_score,away_score,content_hash) VALUES($1,'demo',$1,'ENG1',$2,$3,now()-interval '2 hours',$4,$5,$6,'incomplete-ui')`,[id,home,away,i===2?'in':'post',i===1?0:2,i===1?2:0]);
      await db.query(`INSERT INTO fixture_snapshots(job_id,fixture_id,payload,data_quality) VALUES($1,$2,$3,'{}')`,[job,id,JSON.stringify({fixture:{home,away,league:'DEMO League'},model:{markets:[{key:'DC:1X',label:'DEMO șansă dublă 1X',estimatedProbability:.75}]}})]);
      await db.query(`INSERT INTO final_decisions(job_id,fixture_id,outcome,market_key,votes_for,votes,validation,reason) VALUES($1,$2,$3,'DC:1X',4,'[]',$4,'DEMO accepted')`,[job,id,i===3?'REJECTED':'QUALIFIED',JSON.stringify({currentOdds:1.4,bookmaker:'DEMO',observedAt:new Date().toISOString()})]);
    }
    const before = await (await page.request.get('/api/test/stats')).json();
    await page.clock.install();
    await page.goto('/?tab=istoric');
    await page.getByRole('button',{name:'Incomplete',exact:true}).click();
    const card = page.locator(`a[href="/?tab=istoric&ticket=${ticket}"]`);
    await expect(card).toContainText('3 selecții acceptate');
    await expect(card).toContainText('DEMO Incomplete Home 0');
    await expect(card).not.toContainText('DEMO Incomplete Home 3');
    await expect(card.getByLabel('a intrat',{exact:true})).toHaveCount(1);
    await expect(card.getByLabel('nu a intrat',{exact:true})).toHaveCount(1);
    await expect(card.getByLabel('în așteptare',{exact:true})).toHaveCount(1);
    await card.click();
    await expect(page.getByText('Bilet incomplet',{exact:true})).toBeVisible();
    const picks = page.getByRole('list',{name:'Selecții acceptate ale biletului incomplet'});
    await expect(picks.getByRole('listitem')).toHaveCount(3);
    await expect(picks).toContainText('DEMO șansă dublă 1X');
    await expect(picks).toContainText('✓ A intrat');
    await expect(picks).toContainText('✗ Nu a intrat');
    await expect(page.getByText('BILET CÂȘTIGAT',{exact:false})).toHaveCount(0);
    await db.query("UPDATE fixtures SET status='post',home_score=0,away_score=1 WHERE id='demo:incomplete-ui-2'");
    await page.clock.runFor(61_000);
    await expect(picks.getByText('✗ Nu a intrat',{exact:true})).toHaveCount(2);
    await expect(page.getByText('Bilet incomplet',{exact:true})).toBeVisible();
    const after = await (await page.request.get('/api/test/stats')).json();
    expect(after.aiCalls).toBe(before.aiCalls);
    expect(after.jobs).toBe(before.jobs);
    expect((await db.query('SELECT generation_status,outcome_status,leg_count FROM tickets WHERE id=$1',[ticket])).rows[0]).toEqual({generation_status:'INCOMPLETE',outcome_status:'NOT_APPLICABLE',leg_count:0});
  } finally { await db.end(); }
});
