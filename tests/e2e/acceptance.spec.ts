import { expect, test } from '@playwright/test';

// Scenario A + E with DEMO fixtures and a deterministic fake AI transport (labelled DEMO).
test('daily COTĂ 5 ticket: create → live NEXUS → auto-open result → locked → replay with zero AI', async ({ page }) => {
  await page.goto('/auth/test-login?email=e2e@test.local');
  await expect(page.getByText('COTĂ 5 — BILETUL A')).toBeVisible();
  await expect(page.getByRole('button', { name: /CREEAZĂ BILETUL/ })).toHaveCount(5);
  // No AI on dashboard load.
  const s0 = await (await page.request.get('/api/test/stats')).json();
  await page.reload();
  expect((await (await page.request.get('/api/test/stats')).json()).aiCalls).toBe(s0.aiCalls);

  await page.getByRole('button', { name: /CREEAZĂ BILETUL/ }).first().click();
  await expect(page).toHaveURL(/\/nexus\?job=/);
  // The final ticket opens automatically.
  await page.waitForURL(/\/tickets\/[0-9a-f-]{36}\?fresh=1/, { timeout: 90_000 });
  await expect(page.getByText('COPIAZĂ BILETUL')).toBeVisible();
  const url = page.url().split('?')[0];
  await page.reload();
  await expect(page.getByText('COTĂ 5 — BILETUL A').first()).toBeVisible();

  // Locked for today.
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: 'VEZI BILETUL' })).toHaveCount(1);
  const gen = await page.request.post('/api/ticket-slots/FIVE_A/generate', { headers: { origin: 'http://localhost:3200' } });
  expect((await gen.json()).created).toBe(false);

  // Replay: no AI calls, no new jobs, no generate requests.
  const before = await (await page.request.get('/api/test/stats')).json();
  const generateCalls: string[] = [];
  page.on('request', (r) => { if (/generate|resume/.test(r.url())) generateCalls.push(r.url()); });
  await page.goto(`${url.replace(/^https?:\/\/[^/]+/, '')}/replay`);
  await expect(page.getByText('REPLAY — ANALIZĂ SALVATĂ')).toBeVisible();
  await page.getByRole('button', { name: '4×' }).click();
  await page.getByRole('button', { name: 'Final' }).click();
  await expect(page.getByText(/Bilet finalizat: cota/)).toBeVisible();
  const after = await (await page.request.get('/api/test/stats')).json();
  expect(after.aiCalls).toBe(before.aiCalls);
  expect(after.jobs).toBe(before.jobs);
  expect(generateCalls).toHaveLength(0);
});

test('another user cannot open the ticket', async ({ page, browser }) => {
  await page.goto('/auth/test-login?email=owner@test.local');
  const list = await (await page.request.get('/api/tickets')).json();
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto('/auth/test-login?email=intruder@test.local');
  const res = await p2.request.get('/api/tickets/00000000-0000-4000-8000-000000000000');
  expect(res.status()).toBe(404);
  expect(list.tickets).toBeDefined();
});

test('private API requires login', async ({ request }) => {
  expect((await request.get('/api/ticket-slots')).status()).toBe(401);
  expect((await request.post('/api/ticket-slots/FIVE_A/generate', { headers: { origin: 'http://localhost:3200' } })).status()).toBe(401);
});
