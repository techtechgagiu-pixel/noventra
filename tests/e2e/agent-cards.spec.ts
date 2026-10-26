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
    await db.query(`INSERT INTO agent_predictions(job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,odds,payload,outcome,created_at) VALUES($1,'demo:card-career','robert',0,'demo',(SELECT model_id FROM agent_model_assignments WHERE agent_id='robert' AND active LIMIT 1),'v1','BET_CANDIDATE','DC:1X',1.2,'{}','WON','2026-10-21T10:00:00Z')`, [job]);
  } finally { await db.end(); }
  await page.goto('/?tab=statistici&luna=all');
  const before = await (await page.request.get('/api/test/stats')).json();
  const cards = page.getByRole('region', { name: 'Agenții' }).locator('article');
  await expect(cards).toHaveCount(34);
  const card = page.locator('#agent-robert');
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
  const corina = page.locator('#agent-corina');
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
    await db.query(`INSERT INTO agent_predictions(job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,odds,payload,outcome,created_at)
      SELECT $1::uuid,'demo:card-refresh:'||$1::text||':'||i,'robert',0,'demo',(SELECT model_id FROM agent_model_assignments WHERE agent_id='robert' AND active LIMIT 1),'v1','BET_CANDIDATE','DC:1X',1.2,'{}',CASE WHEN i<=11 THEN 'WON' WHEN i<=14 THEN 'LOST' ELSE NULL END,now()-interval '1 day' FROM generate_series(1,15) i`, [job]);
    await page.clock.install();
    await page.goto('/?tab=statistici&luna=all&scope=mine');
    const card = page.locator('#agent-robert');
    await expect(card).toHaveAttribute('data-rarity', 'unique');
    await expect(card.locator('.player-card-level')).toContainText('285 XP');
    await expect(card.locator('.player-card-level strong')).toHaveText('03');
    const before = await (await page.request.get('/api/test/stats')).json();
    const fixture = `demo:card-refresh:${job}:15`;
    await db.query("UPDATE fixtures SET status='post',home_score=1,away_score=0 WHERE id=$1", [fixture]);
    await db.query("UPDATE agent_predictions SET outcome='WON' WHERE job_id=$1 AND fixture_id=$2", [job, fixture]);
    await page.clock.runFor(601_000);
    await expect(card).toHaveAttribute('data-rarity', 'super');
    await expect(card.locator('.player-card-level')).toContainText('315 XP');
    await expect(card.locator('.player-card-level strong')).toHaveText('04');
    await db.query("UPDATE fixtures SET home_score=0,away_score=1 WHERE id=$1", [fixture]);
    await db.query("UPDATE agent_predictions SET outcome='LOST' WHERE job_id=$1 AND fixture_id=$2", [job, fixture]);
    await page.clock.runFor(601_000);
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
  await expect(page.getByRole('link', { name: 'Personaje', exact: true })).toHaveCount(0);
  await page.goto('/?tab=statistici&luna=all&scope=mine&vedere=modele');
  await expect(original.locator('.player-card-results')).toHaveText(results!);
  await expect(original.locator('.player-card-level')).toHaveText(career!);
  await expect(original).toHaveAttribute('data-rarity', rarity!);
  await expect(original).not.toContainText('Personaj');
  await expect(original).toHaveAttribute('aria-label', /Card AI .* · Managerul de risc/);
  await expect(original).toContainText('Managerul de risc');
  await expect(original.locator('img')).toHaveAttribute('src', '/ai-portraits/robert-v1.webp');
  await expect(original.locator('.player-ai-character')).toContainText('Risc');
  await expect(page.locator('#agent-corina')).toContainText('Editorial');
  await expect(page.locator('#agent-corina').getByRole('progressbar')).toHaveCount(0);
  await page.getByRole('link', { name: 'septembrie 2026', exact: true }).click();
  await expect(page).toHaveURL(/luna=2026-09&scope=mine/);
  await expect(original.locator('.player-card-level')).toHaveText(career!);
  await page.getByRole('link', { name: 'Toată comunitatea', exact: true }).click();
  await expect(page).toHaveURL(/luna=2026-09&scope=all/);
});

test('model identities replace actors across public home, Custom and statistics, including all ten new models', async ({ page }) => {
  const actors = /Mircea Lucescu|Ștucan|Corina Caragea|Personaje|Gheorghe Hagi|Nova|Sigma/;
  await page.goto('/');
  await expect(page.locator('.home-team-grid > div')).toHaveCount(34);
  await expect(page.locator('.home-team')).not.toContainText(actors);
  await expect(page.locator('.home-team img[src^="/agents/"]')).toHaveCount(0);
  await expect(page.locator('.home-team')).toContainText('Claude Sonnet 5.5');
  await expect(page.locator('.home-team')).toContainText('MiniMax M3.1 Flash');
  await page.goto('/auth/test-login?email=model-identities@test.local');
  await page.goto('/?tab=custom');
  await page.locator('summary').filter({ hasText: 'Echipa de agenți' }).click();
  await page.getByRole('button', { name: /Noua echipă AI \(10\)/ }).click();
  await expect(page.locator('summary').filter({ hasText: 'Echipa de agenți' })).toContainText('10 agenți aleși');
  await expect(page.locator('main')).not.toContainText(actors);
  await expect(page.locator('main img[src^="/agents/"]')).toHaveCount(0);
  await page.goto('/?tab=statistici&vedere=personaje');
  await expect(page.locator('.agent-player-card')).toHaveCount(34);
  await expect(page.locator('main')).not.toContainText(actors);
  await expect(page.locator('#agent-robert')).toHaveAttribute('aria-label', /Card AI .* · Managerul de risc/);
});

test('agents above 80% on at least 10 decided picks get the hot-streak flame card', async ({ page }) => {
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/betmind_e2e' });
  await db.connect();
  try {
    await page.goto('/auth/test-login?email=card-hot@test.local');
    const user = (await db.query("SELECT id FROM users WHERE email='card-hot@test.local'")).rows[0].id;
    const job = (await db.query(`INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES($1,'CUSTOM_96',current_date,5,'card-hot','{}','{}','COMPLETED','DONE') RETURNING id`, [user])).rows[0].id;
    await db.query(`INSERT INTO fixtures(id,provider,provider_id,league_id,home_team,away_team,kickoff_utc,status,content_hash)
      SELECT 'demo:card-hot:'||$1||':'||i,'demo',i::text,'ENG1','DEMO Hot Home','DEMO Hot Away',now(),'post','card-hot' FROM generate_series(1,10) i`, [job]);
    for (const [agent, won] of [['victor', 9], ['mihai', 8]] as const) {
      await db.query(`INSERT INTO agent_predictions(job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,odds,payload,outcome,created_at)
        SELECT $1::uuid,'demo:card-hot:'||$1::text||':'||i,$2,0,'demo',(SELECT model_id FROM agent_model_assignments WHERE agent_id=$2 AND active LIMIT 1),'v1','BET_CANDIDATE','DC:1X',1.2,'{}',CASE WHEN i<=$3 THEN 'WON' ELSE 'LOST' END,now()-interval '1 day' FROM generate_series(1,10) i`, [job, agent, won]);
    }
    await page.goto('/?tab=statistici&luna=all&scope=mine');
    await expect(page.locator('#agent-victor')).toHaveAttribute('data-hot', 'true');
    await expect(page.locator('#agent-victor .player-card-hot')).toHaveText('🔥 HOT STREAK');
    await expect(page.locator('#agent-mihai')).not.toHaveAttribute('data-hot', 'true'); // exactly 80% is not "over 80%"
    if (process.env.SHOTS) await page.locator('#agent-victor').screenshot({ path: `${process.env.SHOTS}/hot-card.png` });
  } finally { await db.end(); }
});
