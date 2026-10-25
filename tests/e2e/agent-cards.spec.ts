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

test('confirmed outcomes automatically change level and rank on an open card without AI', async ({ page }) => {
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/betmind_e2e' });
  await db.connect();
  try {
    await page.goto('/auth/test-login?email=card-refresh@test.local');
    const user = (await db.query("SELECT id FROM users WHERE email='card-refresh@test.local'")).rows[0].id;
    const job = (await db.query(`INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES($1,'CUSTOM_97',current_date,5,'card-refresh','{}','{}','COMPLETED','DONE') RETURNING id`, [user])).rows[0].id;
    await db.query(`INSERT INTO fixtures(id,provider,provider_id,league_id,home_team,away_team,kickoff_utc,status,content_hash)
      SELECT 'demo:card-refresh:'||$1||':'||i,'demo',i::text,'ENG1','DEMO Card Home','DEMO Card Away',now(),'pre','card-refresh' FROM generate_series(1,15) i`, [job]);
    await db.query(`INSERT INTO agent_predictions(job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,odds,payload,outcome)
      SELECT $1::uuid,'demo:card-refresh:'||$1::text||':'||i,'robert',0,'demo','demo','v1','BET_CANDIDATE','DC:1X',1.2,'{}',CASE WHEN i<=11 THEN 'WON' WHEN i<=14 THEN 'LOST' ELSE NULL END FROM generate_series(1,15) i`, [job]);
    await page.clock.install();
    await page.goto('/?tab=statistici&luna=all&scope=mine');
    const card = page.getByRole('article', { name: 'Card Mircea Lucescu', exact: true });
    await expect(card).toHaveAttribute('data-rarity', 'unique');
    await expect(card.locator('.player-card-level')).toContainText('285 XP');
    await expect(card.locator('.player-card-level strong')).toHaveText('03');
    const before = await (await page.request.get('/api/test/stats')).json();
    const fixture = `demo:card-refresh:${job}:15`;
    await db.query("UPDATE fixtures SET status='post',home_score=1,away_score=0 WHERE id=$1", [fixture]);
    await db.query("UPDATE agent_predictions SET outcome='WON' WHERE job_id=$1 AND fixture_id=$2", [job, fixture]);
    await page.clock.runFor(61_000);
    await expect(card).toHaveAttribute('data-rarity', 'super');
    await expect(card.locator('.player-card-level')).toContainText('315 XP');
    await expect(card.locator('.player-card-level strong')).toHaveText('04');
    await db.query("UPDATE fixtures SET home_score=0,away_score=1 WHERE id=$1", [fixture]);
    await db.query("UPDATE agent_predictions SET outcome='LOST' WHERE job_id=$1 AND fixture_id=$2", [job, fixture]);
    await page.clock.runFor(61_000);
    await expect(card).toHaveAttribute('data-rarity', 'elite');
    await expect(card.locator('.player-card-level')).toContainText('270 XP');
    await expect(card.locator('.player-card-level strong')).toHaveText('03');
    expect((await (await page.request.get('/api/test/stats')).json()).aiCalls).toBe(before.aiCalls);
  } finally { await db.end(); }
});

test('AI identity view preserves agent records, character and period/scope filters', async ({ page }) => {
  await page.goto('/auth/test-login?email=ai-cards@test.local');
  await page.goto('/?tab=statistici&luna=all&scope=mine');
  const original = page.locator('#agent-robert');
  const results = await original.locator('.player-card-results').textContent();
  const career = await original.locator('.player-card-level').textContent();
  const rarity = await original.getAttribute('data-rarity');
  await page.getByRole('link', { name: 'Modele AI', exact: true }).click();
  await expect(page).toHaveURL(/luna=all&scope=mine&vedere=modele/);
  await expect(original.locator('.player-card-results')).toHaveText(results!);
  await expect(original.locator('.player-card-level')).toHaveText(career!);
  await expect(original).toHaveAttribute('data-rarity', rarity!);
  await expect(original).toContainText('Personaj: Mircea Lucescu');
  await expect(original).toContainText('Managerul de risc');
  await expect(original.locator('img')).toHaveAttribute('src', '/ai-portraits/robert-v1.webp');
  await expect(original.locator('.player-ai-character')).toContainText('Risc');
  await expect(page.locator('#agent-corina')).toContainText('Editorial');
  await expect(page.locator('#agent-corina').getByRole('progressbar')).toHaveCount(0);
  await page.getByRole('link', { name: 'septembrie 2026', exact: true }).click();
  await expect(page).toHaveURL(/luna=2026-09&scope=mine&vedere=modele/);
  await expect(original.locator('.player-card-level')).toHaveText(career!);
  await page.getByRole('link', { name: 'Toată comunitatea', exact: true }).click();
  await expect(page).toHaveURL(/luna=2026-09&scope=all&vedere=modele/);
});
