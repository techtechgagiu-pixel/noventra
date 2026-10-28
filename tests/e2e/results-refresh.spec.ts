import { expect, test } from '@playwright/test';
import pg from 'pg';

test('open archive and ticket receive green/red results without reload, retain filters and trigger no AI', async ({ page }) => {
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/betmind_e2e' });
  await db.connect();
  try {
    await page.goto('/auth/test-login?email=results-refresh@test.local');
    const user = (await db.query(`SELECT id FROM users WHERE email=$1`, ['results-refresh@test.local'])).rows[0].id;
    const job = (await db.query(`INSERT INTO ticket_generation_jobs (user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES ($1,'FIVE_A',current_date,5,'refresh-test','{}','{}','COMPLETED','DONE') RETURNING id`, [user])).rows[0].id;
    const ticket = (await db.query(`INSERT INTO tickets (job_id,user_id,slot,period_key,target_odds,actual_odds,leg_count,generation_status,summary) VALUES ($1,$2,'FIVE_A',current_date,5,1.5,1,'COMPLETED','{}') RETURNING id`, [job, user])).rows[0].id;
    const fixture = `demo:refresh:${ticket}`;
    await db.query(`INSERT INTO fixtures (id,provider,provider_id,league_id,home_team,away_team,kickoff_utc,status,content_hash) VALUES ($1,'demo','refresh','ENG1','DEMO Refresh Home','DEMO Refresh Away',now(),'pre','refresh-test')`, [fixture]);
    await db.query(`INSERT INTO ticket_selections (ticket_id,fixture_id,position,market_key,market_label,odds,bookmaker,quote_observed_at,votes_for,risk,snapshot) VALUES ($1,$2,1,'1X2:HOME','DEMO Refresh wins',1.5,'DEMO',now(),6,'LOW',$3)`, [ticket, fixture, JSON.stringify({ match: 'DEMO Refresh Home – DEMO Refresh Away', home: 'DEMO Refresh Home', away: 'DEMO Refresh Away', kickoff: new Date().toISOString(), league: 'DEMO' })]);

    await page.clock.install();
    await page.goto('/?tab=istoric');
    await expect(page.getByText('DEMO Refresh Home – DEMO Refresh Away')).toBeVisible();
    const filter = page.getByRole('button', { name: 'Azi', exact: true });
    await filter.click();
    const before = await (await page.request.get('/api/test/stats')).json();
    await db.query(`UPDATE ticket_selections SET outcome='WON' WHERE ticket_id=$1`, [ticket]);
    await db.query(`UPDATE tickets SET outcome_status='WON' WHERE id=$1`, [ticket]);
    await page.clock.runFor(601_000);
    const archiveLeg = page.getByText('DEMO Refresh Home – DEMO Refresh Away');
    await expect(archiveLeg).toHaveClass(/text-emerald/);
    await expect(filter).toHaveClass(/text-cyan/);

    await page.goto(`/?tab=istoric&ticket=${ticket}`);
    await expect(page.getByText('✓ A intrat')).toBeVisible();
    await db.query(`UPDATE ticket_selections SET outcome='LOST' WHERE ticket_id=$1`, [ticket]);
    await db.query(`UPDATE tickets SET outcome_status='LOST' WHERE id=$1`, [ticket]);
    await page.clock.runFor(601_000);
    await expect(page.getByText('✗ Nu a intrat')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('ticket')).toBe(ticket);
    const after = await (await page.request.get('/api/test/stats')).json();
    expect(after).toEqual(before);
  } finally { await db.end(); }
});

test('the creator removes a ticket from Bilete create; nobody sees it there afterwards', async ({ page, browser }) => {
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/betmind_e2e' });
  await db.connect();
  try {
    await page.goto('/auth/test-login?email=remove-owner@test.local');
    const owner = (await db.query(`SELECT id FROM users WHERE email='remove-owner@test.local'`)).rows[0].id;
    const job = (await db.query(`INSERT INTO ticket_generation_jobs (user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES ($1,'CUSTOM_9',current_date,3,'remove','{}','{}','COMPLETED','DONE') RETURNING id`, [owner])).rows[0].id;
    const ticket = (await db.query(`INSERT INTO tickets (job_id,user_id,slot,period_key,target_odds,actual_odds,leg_count,generation_status,summary) VALUES ($1,$2,'CUSTOM_9',current_date,3,1.5,1,'COMPLETED','{}') RETURNING id`, [job, owner])).rows[0].id;
    const fixture = `demo:remove:${ticket}`;
    await db.query(`INSERT INTO fixtures (id,provider,provider_id,league_id,home_team,away_team,kickoff_utc,status,content_hash) VALUES ($1,'demo','remove','ENG1','DEMO Remove Home','DEMO Remove Away',now()+interval '1 day','pre','remove')`, [fixture]);
    await db.query(`INSERT INTO ticket_selections (ticket_id,fixture_id,position,market_key,market_label,odds,bookmaker,quote_observed_at,votes_for,risk,snapshot) VALUES ($1,$2,1,'1X2:HOME','DEMO Remove wins',1.5,'DEMO',now(),6,'LOW',$3)`, [ticket, fixture, JSON.stringify({ match: 'DEMO Remove Home – DEMO Remove Away', home: 'DEMO Remove Home', away: 'DEMO Remove Away', kickoff: new Date().toISOString(), league: 'DEMO' })]);
    // Another account cannot remove it.
    const other = await browser.newPage();
    await other.goto('/auth/test-login?email=remove-other@test.local');
    expect((await other.request.delete(`/api/tickets/${ticket}`, { headers: { origin: 'http://localhost:3200' } })).status()).toBe(403);
    await page.goto('/?tab=istoric');
    const slip = page.locator('li', { hasText: 'DEMO Remove Home – DEMO Remove Away' });
    await slip.getByRole('button', { name: 'Șterge din listă' }).click();
    await slip.getByRole('button', { name: 'Da, șterge' }).click();
    await expect(page.getByText('DEMO Remove Home – DEMO Remove Away')).toHaveCount(0);
    await other.goto('/?tab=istoric');
    await expect(other.getByText('DEMO Remove Home – DEMO Remove Away')).toHaveCount(0);
    expect((await db.query('SELECT count(*)::int n FROM ticket_selections WHERE ticket_id=$1', [ticket])).rows[0].n).toBe(1);
  } finally { await db.end(); }
});
