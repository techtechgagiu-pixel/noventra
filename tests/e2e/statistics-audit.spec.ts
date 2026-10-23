import { expect, test } from '@playwright/test';

test('news identities, shared statistics and administrator results checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Ștucan', { exact: true })).toBeVisible();
  await expect(page.getByText('Hanțu', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Corina Caragea', { exact: true })).toBeVisible();
  await expect(page.locator('img[src="/agents/corina.png"]')).toBeVisible();
  await page.goto('/login?cod=1');
  await page.getByText('Am un cod de acces (administrator sau invitație)', { exact: true }).click();
  await page.getByLabel('Cod de acces').fill('P11-ADMIN-01234567-89ABCDEF-01234567-89ABCDEF');
  await page.getByRole('button', { name: 'INTRĂ CU CODUL' }).click();
  await page.goto('/?tab=statistici');
  await expect(page.getByRole('link', { name: 'Toată comunitatea', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'Actualizări automate' })).toBeVisible();
  const before = await (await page.request.get('/api/test/stats')).json();
  expect((await page.request.post('/api/admin/automation', { headers: { origin: 'https://foreign.example' } })).status()).toBe(403);
  await page.getByRole('button', { name: 'Actualizează rezultatele', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/verificate|rulează deja/);
  expect(await (await page.request.get('/api/test/stats')).json()).toEqual(before);
  await page.getByRole('link', { name: 'Analizele mele', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Analizele mele', exact: true })).toHaveAttribute('aria-current', 'page');
  const corina = page.getByRole('region', { name: 'Agenții' }).locator('article').filter({ hasText: 'Corina Caragea' });
  await expect(corina).toContainText('fără voturi');
  const activeAgents = await (await page.request.get('/api/agents')).json();
  const corinaAssignment = activeAgents.agents.find((agent: { id: string }) => agent.id === 'corina');
  await expect(corina).toContainText(corinaAssignment.model.model);
  await expect(corina).toContainText('Decizie editorială');
});
