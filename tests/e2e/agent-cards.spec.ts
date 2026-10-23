import { expect, test } from '@playwright/test';
import pg from 'pg';

test('compact agent cards preserve career across month filters, editorial roles and mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/auth/test-login?email=cards@test.local');
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/betmind_e2e' });
  await db.connect();
  try {
    const user = (await db.query("SELECT id FROM users WHERE email='cards@test.local'")).rows[0].id;
    const job = (await db.query(`INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES($1,'CUSTOM_98',current_date,5,'cards','{}','{}','COMPLETED','DONE') RETURNING id`, [user])).rows[0].id;
    await db.query(`INSERT INTO fixtures(id,provider,provider_id,league_id,home_team,away_team,kickoff_utc,status,home_score,away_score,content_hash) VALUES('demo:card-career','demo','card-career','ENG1','DEMO Card Home','DEMO Card Away','2026-10-22T10:00:00Z','post',1,0,'card-career')`);
    await db.query(`INSERT INTO agent_predictions(job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,odds,payload,outcome) VALUES($1,'demo:card-career','robert',0,'demo','demo','v1','BET_CANDIDATE','DC:1X',1.2,'{}','WON')`, [job]);
  } finally { await db.end(); }
  await page.goto('/?tab=statistici&luna=all');
  const before = await (await page.request.get('/api/test/stats')).json();
  const cards = page.getByRole('region', { name: 'Agenții' }).locator('article');
  await expect(cards).toHaveCount(24);
  const card = page.getByRole('article', { name: 'Card Mircea Lucescu', exact: true });
  await expect(card).toContainText('Nivel');
  await expect(card.getByRole('progressbar')).toHaveCount(1);
  const size = await card.boundingBox();
  expect(size!.width).toBeLessThan(300);
  expect(size!.height).toBeLessThan(370);
  const portrait = await card.locator('img').boundingBox();
  expect(portrait!.width).toBeGreaterThanOrEqual(75);
  expect(portrait!.width).toBeLessThanOrEqual(100);
  const career = (await card.locator('.player-card-level').textContent())!;
  expect(career).not.toBe('Nivel010 XP');
  const corina = page.getByRole('article', { name: 'Card Corina Caragea', exact: true });
  await expect(corina).toContainText('Editorial');
  await expect(corina.getByRole('progressbar')).toHaveCount(0);
  await page.getByRole('link', { name: 'septembrie 2026', exact: true }).click();
  await expect(card.locator('.player-card-level')).toHaveText(career);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await card.getByText('Detalii și consum', { exact: true }).click();
  await expect(card.getByText('Cotă medie (decise)', { exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/test/stats')).json()).aiCalls).toBe(before.aiCalls);
});
