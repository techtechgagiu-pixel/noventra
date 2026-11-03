import { expect, test } from '@playwright/test';

test('Bilet custom goes step by step: cota, ligi, perioada, agenții, gata', async ({ page }) => {
  await page.goto('/auth/test-login?email=wizard@test.local');
  await page.goto('/?tab=custom');
  await expect(page.getByLabel('Cota dorită')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pornește dezbaterea/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Următorul' }).click();
  await expect(page.getByRole('heading', { name: 'Din ce ligi' })).toBeVisible();
  await expect(page.getByLabel('Cota dorită')).toHaveCount(0);
  await page.getByRole('button', { name: 'Următorul' }).click();
  await expect(page.getByRole('heading', { name: 'Perioada' })).toBeVisible();
  await page.getByRole('button', { name: 'Următorul' }).click();
  await expect(page.getByText('cine analizează biletul')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Echipe gata făcute' })).toBeVisible();
  await page.getByRole('button', { name: 'Următorul' }).click();
  await expect(page.getByRole('button', { name: /Pornește dezbaterea/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Următorul' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Înapoi' }).click();
  await expect(page.getByText('cine analizează biletul')).toBeVisible();
  await page.getByRole('button', { name: 'Totul pe o pagină' }).click();
  await expect(page.getByLabel('Cota dorită')).toBeVisible();
  await expect(page.locator('summary').filter({ hasText: 'Echipa de agenți' })).toBeVisible();
});
