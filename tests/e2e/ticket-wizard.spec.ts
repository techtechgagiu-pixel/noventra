import { expect, test } from '@playwright/test';

test('Bilet custom goes step by step: cota, ligi, perioada, agenții, gata', async ({ page }) => {
  await page.goto('/auth/test-login?email=wizard@test.local');
  await page.goto('/?tab=custom');
  await expect(page.getByLabel('Cota dorită')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pornește dezbaterea/ })).toHaveCount(0);
  // Market restriction: both boxes exist and start unticked.
  await expect(page.getByLabel('Ambele echipe marchează – DA (GG)')).not.toBeChecked();
  await expect(page.getByLabel('Peste 1,5 goluri')).not.toBeChecked();
  await expect(page.getByLabel('Peste 2,5 goluri')).not.toBeChecked();
  await expect(page.getByLabel('Peste 3,5 goluri')).not.toBeChecked();
  await expect(page.getByLabel('Sub 1,5 goluri')).not.toBeChecked();
  await page.getByRole('button', { name: 'Următorul' }).click();
  await expect(page.getByRole('heading', { name: 'Din ce ligi' })).toBeVisible();
  await expect(page.getByLabel('Cota dorită')).toHaveCount(0);
  await page.getByRole('button', { name: 'Următorul' }).click();
  await expect(page.getByRole('heading', { name: 'Perioada' })).toBeVisible();
  // Whole-day choice, each with its date in brackets; picking a day hides the free sliders.
  const days = page.getByRole('group', { name: 'Ziua meciurilor' });
  for (const n of ['Azi', 'Mâine', 'Poimâine', 'Răspoimâine']) await expect(days.getByRole('button', { name: new RegExp(`^${n} \\(`) })).toBeVisible();
  await expect(page.getByLabel('De la')).toBeVisible();
  await days.getByRole('button', { name: /^Poimâine/ }).click();
  await expect(page.getByLabel('De la')).toBeHidden();
  await expect(page.getByText(/Meciuri de poimâine:/)).toBeVisible();
  await days.getByRole('button', { name: 'Interval liber' }).click();
  await expect(page.getByLabel('De la')).toBeVisible();
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
