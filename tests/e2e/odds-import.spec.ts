import { expect, test } from '@playwright/test';

const exportFile = () => {
  const kick = new Date(Date.now() + 2 * 86400_000).toUTCString();
  const m = (id: string, home: string, away: string) => ({ source_id: id, starts_at: kick, participants: [{ name: home }, { name: away }], tournament: { name: 'Liga' },
    markets: [{ name: '1x2', status: 'active', outcomes: [{ name: home, odds: 1.8, active: true }, { name: 'Draw', odds: 3.5, active: true }, { name: away, odds: 4.2, active: true }] }] });
  return JSON.stringify({ meta: { source: 'stake', finished_at: new Date(Date.now() - 3600_000).toISOString() }, data: { matches: [m('e2e-1', 'Alpha', 'Beta'), m('e2e-2', 'Gamma', 'Delta')] } });
};

test('only the owner imports Stake odds from the exported JSON and sees how long they stay valid', async ({ page, browser }) => {
  await page.goto('/auth/test-login?email=remove-owner@test.local');
  await page.goto('/');
  await page.getByRole('link', { name: 'Cote', exact: true }).click();
  await expect(page).toHaveURL(/\/cote$/);
  await expect(page.getByRole('heading', { name: 'Import cote' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'football-full.json', mimeType: 'application/json', buffer: Buffer.from(exportFile()) });
  await expect(page.getByRole('status')).toContainText('Import reușit: 2 meciuri viitoare cu cote');
  await expect(page.getByRole('status')).toContainText('1X2 (2)');
  await expect(page.getByRole('region', { name: 'Starea importului' })).toContainText('2 din 2');
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"meta":{}}') });
  await expect(page.getByRole('alert').filter({ hasText: 'momentul exportului' })).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  await other.goto('/auth/test-login?email=someone-else@test.local');
  await other.goto('/');
  await expect(other.getByRole('link', { name: 'Cote', exact: true })).toHaveCount(0);
  expect((await other.goto('/cote'))!.status()).toBe(404);
  expect((await other.request.post('/api/odds-import', { data: exportFile(), headers: { origin: new URL(other.url()).origin } })).status()).toBe(403);
});
