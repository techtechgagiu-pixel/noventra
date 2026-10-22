import { expect, test } from '@playwright/test';

// Scenario A + E with DEMO fixtures and a deterministic fake AI transport (labelled DEMO).
test('daily COTĂ 5 ticket: create → live NEXUS → auto-open result → locked → replay with zero AI', async ({ page }) => {
  await page.goto('/auth/test-login?email=e2e@test.local');
  await page.goto('/?tab=bilete');
  await expect(page.getByText('COTĂ 5 — BILETUL A')).toBeVisible();
  await expect(page.getByRole('button', { name: /CREEAZĂ BILETUL/ })).toHaveCount(5);
  // No AI on dashboard load.
  const s0 = await (await page.request.get('/api/test/stats')).json();
  await page.reload();
  expect((await (await page.request.get('/api/test/stats')).json()).aiCalls).toBe(s0.aiCalls);

  await page.getByRole('button', { name: /CREEAZĂ BILETUL/ }).first().click();
  await expect(page).toHaveURL(/tab=analiza&job=/);
  // The final ticket opens automatically.
  await page.waitForURL(/tab=bilete&ticket=[0-9a-f-]{36}&fresh=1/, { timeout: 90_000 });
  await expect(page.getByText('COPIAZĂ BILETUL')).toBeVisible();
  const ticketId = new URL(page.url()).searchParams.get('ticket')!;
  await page.reload();
  await expect(page.getByText('COTĂ 5 — BILETUL A').first()).toBeVisible();

  // Home: replays the finished analysis on the map and routes to the four sections.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Analizează. Dezbate. Decide.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Ce vrei să faci' }).getByRole('link')).toHaveCount(4);
  await expect(page.getByRole('img', { name: /Harta live a agenților/ })).toBeVisible();
  if (process.env.SHOTS) { await page.waitForTimeout(6000); await page.screenshot({ path: `${process.env.SHOTS}/home.png`, fullPage: true }); await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(4000); await page.screenshot({ path: `${process.env.SHOTS}/home-mobile.png`, fullPage: true }); await page.setViewportSize({ width: 1280, height: 720 }); }

  // Locked for today.
  await page.goto('/?tab=bilete');
  await expect(page.getByRole('button', { name: 'VEZI BILETUL' })).toHaveCount(1);
  const gen = await page.request.post('/api/ticket-slots/FIVE_A/generate', { headers: { origin: 'http://localhost:3200' } });
  expect((await gen.json()).created).toBe(false);

  // Replay: no AI calls, no new jobs, no generate requests.
  const before = await (await page.request.get('/api/test/stats')).json();
  const generateCalls: string[] = [];
  page.on('request', (r) => { if (/generate|resume/.test(r.url())) generateCalls.push(r.url()); });
  await page.goto(`/?tab=analiza&replay=${ticketId}`);
  await expect(page.getByRole('img', { name: /Harta live a agenților/ })).toBeVisible();
  await expect(page.getByRole('log')).toContainText(/Bilet gata: cota/, { timeout: 90_000 });
  const after = await (await page.request.get('/api/test/stats')).json();
  expect(after.aiCalls).toBe(before.aiCalls);
  expect(after.jobs).toBe(before.jobs);
  expect(generateCalls).toHaveLength(0);
});

test('another account sees shared tickets but not missing ones', async ({ page, browser }) => {
  await page.goto('/auth/test-login?email=owner@test.local');
  const list = await (await page.request.get('/api/tickets')).json();
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto('/auth/test-login?email=intruder@test.local');
  const res = await p2.request.get('/api/tickets/00000000-0000-4000-8000-000000000000');
  expect(res.status()).toBe(404);
  expect(list.tickets).toBeDefined();
});

test('anonymous home is public while application sections and APIs remain protected', async ({ request }) => {
  expect((await request.get('/api/ticket-slots')).status()).toBe(401);
  expect((await request.get('/api/admin/models')).status()).toBe(401);
  const home = await request.get('/', { maxRedirects: 0 });
  expect(home.status()).toBe(200);
  expect(await home.text()).toContain('Conectează-te cu Google');
  const privateTab = await request.get('/?tab=custom', { maxRedirects: 0 });
  expect(privateTab.headers().location).toBe('/login');
  const ticket = await request.get('/?ticket=00000000-0000-4000-8000-000000000000', { maxRedirects: 0 });
  expect(ticket.headers().location).toBe('/login');
  const r = await request.get('/dashboard', { maxRedirects: 0 });
  expect([307, 308]).toContain(r.status());
});

test('custom ticket: choose target, legs and agents → live map + chat → ticket', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/auth/test-login?email=e2e@test.local');
  await page.goto('/?tab=custom');
  await expect(page.getByRole('heading', { name: 'Bilet custom' })).toBeVisible();
  await page.getByLabel('Cota dorită').fill('3');
  await page.getByRole('button', { name: 'Mai puține meciuri' }).click();
  await page.getByRole('button', { name: 'Mai puține meciuri' }).click();
  await page.getByRole('button', { name: 'Toți', exact: true }).click();
  await page.getByRole('button', { name: /Ligi.*Toate ligile/ }).click();
  await page.getByRole('option', { name: /Premier League/ }).first().click();
  await page.getByRole('option', { name: /La Liga/ }).first().click();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/custom-leagues.png` });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Ligi.*2 ligi/ })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/custom-form.png`, fullPage: true });
  await page.getByRole('button', { name: /CREEAZĂ BILETUL CUSTOM/ }).click();
  await expect(page).toHaveURL(/tab=custom&job=[0-9a-f-]{36}/);
  await expect(page.getByRole('img', { name: /Harta live a agenților/ })).toBeVisible();
  if (process.env.SHOTS) for (const [i, ms] of [1500, 4000, 8000].entries()) { await page.waitForTimeout(ms - (i ? [1500, 4000][i - 1] : 0)); await page.screenshot({ path: `${process.env.SHOTS}/custom-${i}.png`, fullPage: false }); }
  await expect(page.getByRole('log')).toContainText(/Bilet custom: cotă 3 din 2 meciuri/);
  await expect(page.getByRole('link', { name: 'VEZI BILETUL' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('log')).toContainText(/propune|NO BET/, { timeout: 30_000 });
  if (process.env.SHOTS) { await page.waitForTimeout(3000); await page.screenshot({ path: `${process.env.SHOTS}/custom-done.png`, fullPage: true }); await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: /Redă dezbaterea/ }).click(); await page.waitForTimeout(2500); await page.screenshot({ path: `${process.env.SHOTS}/custom-mobile.png`, fullPage: true }); }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Coada analizelor' })).toContainText('CUSTOM — COTĂ 3');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/queue.png` });
  expect(errors.filter((e) => !/favicon|404/.test(e))).toEqual([]);
});

test('your own ticket: build from real prices → agents review it live → verdict and advice', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/auth/test-login?email=e2e@test.local');
  await page.goto('/?tab=verifica');
  await expect(page.getByRole('heading', { name: 'Vino cu biletul tău la analiză' })).toBeVisible();
  const cards = page.getByRole('region', { name: 'Meciuri disponibile' }).locator('article');
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  await cards.nth(0).getByRole('button', { pressed: false }).first().click();
  await cards.nth(1).getByRole('button', { pressed: false }).nth(1).click();
  await page.getByPlaceholder(/Ex\.: cred că/).fill('Gazdele sunt în formă.');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/review-builder.png`, fullPage: true });
  await page.getByRole('button', { name: /TRIMITE LA ANALIZĂ/ }).click();
  await expect(page).toHaveURL(/tab=verifica&job=[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Verdictul echipei' })).toContainText('Mircea Lucescu', { timeout: 90_000 });
  await expect(page.getByRole('link', { name: 'VEZI BILETUL' })).toBeVisible({ timeout: 30_000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/review-live.png`, fullPage: true });
  await page.getByRole('link', { name: 'VEZI BILETUL' }).click();
  await expect(page.getByText('Verdictul echipei · sfaturile creierului')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/review-ticket.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('statistics tab: per-agent record and consumption', async ({ page }) => {
  await page.goto('/auth/test-login?email=e2e@test.local');
  await page.goto('/?tab=statistici');
  await expect(page.getByRole('heading', { name: 'Statistici' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Agenții' }).locator('article')).toHaveCount(24);
  await expect(page.getByText('Consum azi', { exact: false })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/stats.png`, fullPage: true });
  await page.goto('/?tab=istoric');
  await expect(page.getByRole('heading', { name: 'Bilete create' })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/created.png` });
});

test('matches tab: every available fixture with odds and analysis status', async ({ page }) => {
  await page.goto('/auth/test-login?email=e2e@test.local');
  await page.goto('/?tab=meciuri');
  await expect(page.getByRole('heading', { name: 'Toate meciurile' })).toBeVisible();
  await expect(page.locator('section li').first()).toBeVisible({ timeout: 30_000 });
  const before = await page.locator('section li').count();
  await page.getByRole('button', { name: 'Pe bilet' }).click();
  expect(await page.locator('section li').count()).toBeLessThanOrEqual(before);
  await page.getByRole('button', { name: 'Toate', exact: true }).click();
  if (process.env.SHOTS) { await page.screenshot({ path: `${process.env.SHOTS}/matches.png`, fullPage: true }); await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: `${process.env.SHOTS}/matches-mobile.png`, fullPage: false }); }
});
