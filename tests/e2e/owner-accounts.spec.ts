import { expect, test } from '@playwright/test';

test('only the owner Google account sees the Google accounts list', async ({ page, browser }) => {
  await page.goto('/auth/test-login?email=remove-owner@test.local');
  await page.goto('/');
  await page.getByRole('link', { name: 'Conturi', exact: true }).click();
  await expect(page).toHaveURL(/\/conturi$/);
  await expect(page.getByRole('heading', { name: 'Conturi Google' })).toBeVisible();
  await expect(page.getByText('remove-owner@test.local').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Blochează' })).toHaveCount(0);

  const other = await (await browser.newContext()).newPage();
  await other.goto('/auth/test-login?email=someone-else@test.local');
  await other.goto('/');
  await expect(other.getByRole('link', { name: 'Conturi', exact: true })).toHaveCount(0);
  expect((await other.goto('/conturi'))!.status()).toBe(404);
});
