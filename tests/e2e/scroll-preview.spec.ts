import { expect, test } from '@playwright/test';

test('entrance preview: sticky while scrolled, lines follow the scroll, the clip never plays on its own', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const section = page.getByRole('region', { name: 'Pe scurt: cum lucrează agenții' });
  await expect(section).toHaveClass(/sv-live/);
  const top = await section.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const run = await section.evaluate((el) => el.getBoundingClientRect().height - window.innerHeight);
  const opacity = (i: number) => page.locator('.sv-line').nth(i).evaluate((n) => Number(getComputedStyle(n).opacity));
  const pinTop = () => page.locator('.sv-pin').evaluate((n) => Math.round(n.getBoundingClientRect().top));
  await page.evaluate((y) => window.scrollTo(0, y), top + run * 0.15);
  await expect.poll(() => opacity(0)).toBeGreaterThan(0.9);
  const pinnedAt = await pinTop();
  await page.evaluate((y) => window.scrollTo(0, y), top + run * 0.5);
  await expect.poll(() => opacity(1)).toBeGreaterThan(0.9);
  expect(await opacity(0)).toBeLessThan(0.1);
  expect(await pinTop()).toBe(pinnedAt); // stays in place while the clip is scrubbed
  await page.evaluate((y) => window.scrollTo(0, y), top + run * 0.9);
  await expect.poll(() => opacity(2)).toBeGreaterThan(0.9);
  expect(await page.locator('.sv-video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('entrance preview falls back to a plain section with reduced motion', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  const section = page.getByRole('region', { name: 'Pe scurt: cum lucrează agenții' });
  await expect(section).toHaveClass(/sv-fallback/);
  await expect(section.getByRole('heading', { name: 'Votează biletul' })).toBeVisible();
  await ctx.close();
});
