import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const run = promisify(execFile);
describe('PostgreSQL to D1 snapshot tooling', () => {
  it('exports read-only and verifies all rows after offline conversion', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'primul11-d1-test-'));
    const source = path.join(root, 'snapshot');
    const target = path.join(root, 'converted');
    await run(process.execPath, ['scripts/cloudflare/export-postgres.mjs', source], {
      env: { ...process.env, MIGRATION_DATABASE_URL: process.env.DATABASE_URL },
    });
    const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
    expect(manifest.complete).toBe(true);
    expect(manifest.tables.map((t: { name: string }) => t.name)).toContain('agent_predictions');
    expect((await stat(source)).mode & 0o777).toBe(0o700);
    expect((await stat(path.join(source, 'manifest.json'))).mode & 0o777).toBe(0o600);
    await run('python3', ['scripts/cloudflare/convert-d1.py', source, target]);
    const report = JSON.parse(await readFile(path.join(target, 'verification.json'), 'utf8'));
    expect(report.allRowsCompared).toBe(true);
    expect(report.foreignKeyViolations).toBe(0);
    expect(report.tables.length).toBe(manifest.tables.length);
    expect(report.applicationD1Ready).toBe(false);
    // A second run cannot overwrite/mix an earlier snapshot.
    await expect(run(process.execPath, ['scripts/cloudflare/export-postgres.mjs', source], {
      env: { ...process.env, MIGRATION_DATABASE_URL: process.env.DATABASE_URL },
    })).rejects.toThrow();
  });
});
