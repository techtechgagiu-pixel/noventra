import { expect, test } from '@playwright/test';
import pg from 'pg';

test('pitch effects start off with system reduced motion, can be turned on and stay on after reload', async ({ page }) => {
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/betmind_e2e' }); await db.connect();
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/auth/test-login?email=map-effects@test.local');
    const user = (await db.query("SELECT id FROM users WHERE email='map-effects@test.local'")).rows[0].id;
    const job = (await db.query("INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status) VALUES($1,'CUSTOM_94',current_date,2,'map-effects','{}','{}','PAUSED') RETURNING id", [user])).rows[0].id;
    const meta = { id: job, title: 'CUSTOM — COTĂ 2', target: 2, status: 'COMPLETED', lastSeq: 1, ticketId: null, nextRunAt: new Date().toISOString(), lastError: null, mine: true };
    await page.route(`**/api/jobs/${job}/events?*`, (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: `id: 1\nevent: job\ndata: ${JSON.stringify({ seq: 1, type: 'JOB_RESUMED', stage: 'QUEUED', payload: { note: 'Start.' }, createdAt: new Date().toISOString() })}\n\nevent: meta\ndata: ${JSON.stringify(meta)}\n\nevent: end\ndata: {}\n\n` }));
    await page.goto(`/?tab=custom&job=${job}`);
    const toggle = page.getByRole('button', { name: /efecte/i });
    await expect(toggle).toHaveText(/Pornește efectele \(animații reduse de sistem\)/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveText(/Efecte pornite/);
    await page.reload();
    await expect(page.getByRole('button', { name: /efecte/i })).toHaveText(/Efecte pornite/);
    await expect(page.getByRole('button', { name: /efecte/i })).toHaveAttribute('aria-pressed', 'true');
  } finally { await db.end(); }
});
