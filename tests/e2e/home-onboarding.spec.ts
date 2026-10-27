import { expect, test } from '@playwright/test';

test('first visit explains AI debate and reaches a compact Custom form without starting AI or loading the catalogue', async ({ page }) => {
  const inference: string[] = [];
  const catalog: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /custom-tickets|generate|resume/.test(r.url())) inference.push(r.url());
    if (new URL(r.url()).pathname === '/api/matches') catalog.push(r.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Biletul tău începe cu o dezbatere.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Fragment real din dezbatere' })).toBeVisible();
  await expect(page.getByText('mercury-3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Contradicție', exact: true }).click();
  await expect(page.getByText(/Mistral Medium 3.1, Qwen 3.8 Flash și Solar Pro 4 resping analiza/)).toBeVisible();
  await page.getByRole('button', { name: 'Decizie', exact: true }).click();
  await expect(page.getByText(/Consens 4\/7\. Intră pe bilet/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Creează bilet custom', exact: true }).first().click();
  await expect(page).toHaveURL(/login\?next=custom/);
  await expect(page.getByRole('link', { name: 'Continuă cu Google' })).toHaveAttribute('href', '/auth/google?next=custom');
  await page.getByText('Am un cod de acces (administrator sau invitație)').click();
  await page.getByLabel('Cod de acces').fill('P11-ADMIN-01234567-89ABCDEF-01234567-89ABCDEF');
  await page.getByRole('button', { name: 'INTRĂ CU CODUL' }).click();
  await expect(page).toHaveURL(/tab=custom$/);
  const before = await (await page.request.get('/api/test/stats')).json();
  await expect(page.getByLabel('Cota dorită')).toHaveValue('5');
  const action = page.getByRole('button', { name: 'Pornește dezbaterea', exact: true });
  await expect(action).toBeEnabled();
  await expect(page.getByRole('spinbutton', { name: 'Câte bilete să creeze echipa?', exact: true })).toHaveValue('1');
  // Final quantity and submit follow league/agent options, as the last configuration step.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const options = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Echipa de agenți' }) });
  await expect(options).not.toHaveAttribute('open', '');
  expect(catalog).toHaveLength(0);
  await page.locator('summary').filter({ hasText: 'Echipa de agenți' }).click();
  await expect(page.getByRole('group', { name: 'Echipe gata făcute' })).toBeVisible();
  await page.getByRole('button', { name: /^Primul 11/ }).click();
  await expect(page.locator('summary').filter({ hasText: 'Echipa de agenți' })).toContainText('11 agenți aleși');
  await page.locator('summary').filter({ hasText: 'Echipa de agenți' }).click();
  await page.locator('summary').filter({ hasText: 'Interval și ligi' }).click();
  await expect(page.getByRole('button', { name: /Ligi.*Toate ligile/ })).toBeVisible({ timeout: 30_000 });
  expect(catalog).toHaveLength(1);
  expect(inference).toHaveLength(0);
  expect((await (await page.request.get('/api/test/stats')).json()).aiCalls).toBe(before.aiCalls);
  expect((await (await page.request.get('/api/test/stats')).json()).jobs).toBe(before.jobs);
});
