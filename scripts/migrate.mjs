// Applies SQL migrations in order, once each, inside transactions. Safe to run on every start.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

export async function migrate(url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = new pg.Client({ connectionString: url, ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(424242)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const dir = path.join(process.cwd(), 'migrations');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(JSON.stringify({ event: 'migration_applied', file }));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(424242)').catch(() => {});
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(() => console.log('migrations: ok')).catch((e) => { console.error(e); process.exit(1); });
}
