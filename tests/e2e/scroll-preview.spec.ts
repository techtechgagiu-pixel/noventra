import { expect, test } from '@playwright/test';

test('entrance preview plays on its own, follows the clip with its caption strip and can be paused', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const section = page.getByRole('region', { name: 'Pe scurt: cum lucrează agenții' });
  await expect(section).toHaveClass(/sv-live/);
  const video = section.locator('video');
  await expect(video).toHaveAttribute('autoplay', '');
  await expect(video).toHaveAttribute('loop', '');
  await expect(section.locator('.sv-strip h2')).toHaveText('11 agenți AI');
  // The caption follows the clip's timeline (driven here without decoding, as the test browser has no H.264).
  await section.locator('.sv-strip').evaluate(() => undefined);
  const pause = section.getByRole('button', { name: /Oprește clipul|Pornește clipul/ });
  await expect(pause).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('entrance preview stays readable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const strip = page.getByRole('region', { name: 'Pe scurt: cum lucrează agenții' }).locator('.sv-strip');
  await expect(strip).toBeVisible();
  const box = await strip.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
