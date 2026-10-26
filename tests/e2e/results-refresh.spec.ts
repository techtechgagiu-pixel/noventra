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
