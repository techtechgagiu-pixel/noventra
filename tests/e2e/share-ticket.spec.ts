import { expect, test } from '@playwright/test';
import pg from 'pg';

test('Distribuie turns a finished ticket into a PNG image without any server call', async ({ page }) => {
  await page.goto('/auth/test-login?email=share-view@test.local');
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/betmind_e2e' });
  await db.connect();
  let ticket: string;
  try {
    const user = (await db.query("SELECT id FROM users WHERE email='share-view@test.local'")).rows[0].id;
    const job = (await db.query(`INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES($1,'CUSTOM_88',current_date,2,'share','{}','{}','COMPLETED','DONE') RETURNING id`, [user])).rows[0].id;
    ticket = (await db.query(`INSERT INTO tickets(job_id,user_id,slot,period_key,target_odds,actual_odds,leg_count,generation_status,outcome_status,summary) VALUES($1,$2,'CUSTOM_88',current_date,2,2.1,2,'COMPLETED','PENDING','{"agents":7}') RETURNING id`, [job, user])).rows[0].id;
    for (let i = 0; i < 2; i++) {
      const id = `demo:share-${i}`;
      await db.query(`INSERT INTO fixtures(id,provider,provider_id,league_id,home_team,away_team,kickoff_utc,status,content_hash) VALUES($1,'demo',$1,'ENG1',$2,$3,now()+interval '1 day','pre','share')`, [id, `DEMO Share Home ${i}`, `DEMO Share Away ${i}`]);
      await db.query(`INSERT INTO ticket_selections(ticket_id,fixture_id,position,market_key,market_label,odds,bookmaker,quote_observed_at,votes_for,risk,snapshot) VALUES($1,$2,$3,'DC:1X','DEMO șansă dublă 1X',1.45,'DEMO',now(),5,'LOW',$4)`,
        [ticket, id, i + 1, JSON.stringify({ match: 'x', home: `DEMO Share Home ${i}`, away: `DEMO Share Away ${i}`, league: 'DEMO League', kickoff: new Date(Date.now() + 86_400_000).toISOString(), source: 'demo' })]);
    }
  } finally { await db.end(); }
  const apiCalls: string[] = [];
  page.on('request', (r) => { if (r.method() !== 'GET') apiCalls.push(r.url()); });
  await page.goto(`/?tab=istoric&ticket=${ticket}`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'DISTRIBUIE' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^primul11-.*\.png$/);
  const bytes = await (await download.createReadStream()).toArray();
  const png = Buffer.concat(bytes);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(apiCalls).toEqual([]);
});
