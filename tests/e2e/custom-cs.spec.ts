import { expect, test } from '@playwright/test';

test('a custom ticket made only of Counter-Strike: one switch sends the CS2 league', async ({ page }) => {
  await page.goto('/auth/test-login?email=cs-only@test.local');
  // One CS match with prices in the window (the e2e database has no Counter-Strike data).
  const cs = { id: 'ps:1', source: 'pandascore', leagueId: 'CS2', league: 'Counter-Strike 2', country: 'Esports', home: 'Spirit', away: 'G2', homeLogo: null, awayLogo: null,
    kickoff: new Date(Date.now() + 5 * 3600_000).toISOString(), status: 'pre', score: null, odds: { home: 1.5, draw: null, away: 2.5, markets: 6, bookmaker: 'Stake' }, analysis: null };
  await page.route('**/api/matches', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [cs], leagues: [{ id: 'CS2', name: 'Counter-Strike 2', country: 'Esports', top10: false, count: 1 }] }) }));
  await page.goto('/?tab=custom');
  await page.getByRole('radio', { name: /Counter-Strike 2/ }).click();
  await expect(page.getByRole('radio', { name: /Counter-Strike 2/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#target')).toHaveValue('3');
  await expect(page.getByText('1 meci disponibil în intervalul ales.')).toBeVisible();
  let sent: { leagues?: string[] } | null = null;
  await page.route('**/api/custom-tickets', async (route) => { sent = route.request().postDataJSON(); await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'test: oprit înainte de pornire' }) }); });
  await page.getByRole('button', { name: /Pornește dezbaterea/ }).click();
  await expect.poll(() => sent?.leagues).toEqual(['CS2']);
  await page.getByRole('radio', { name: /Fotbal/ }).click();
  await page.getByRole('button', { name: /Pornește dezbaterea/ }).click();
  await expect.poll(() => sent?.leagues).toEqual([]);
});

test('statistics: football and Counter-Strike records on separate tabs', async ({ page }) => {
  await page.goto('/auth/test-login?email=cs-stats@test.local');
  await page.goto('/?tab=statistici');
  await expect(page.getByRole('link', { name: '⚽ Fotbal' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: '🎮 Counter-Strike' }).click();
  await expect(page).toHaveURL(/sport=cs/);
  await expect(page.getByRole('link', { name: '🎮 Counter-Strike' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Doar pronosticurile pe meciuri Counter-Strike 2')).toBeVisible();
  // Month and scope links keep the Counter-Strike view.
  await page.getByRole('link', { name: 'Analizele mele' }).click();
  await expect(page).toHaveURL(/scope=mine.*sport=cs|sport=cs.*scope=mine/);
});
