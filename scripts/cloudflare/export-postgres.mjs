// Read-only, bounded-memory export. Credentials come ONLY from the environment.
// Snapshot files contain private accounts/session hashes: never commit or upload them.
import pg from 'pg';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
const digest = (value) => createHash('sha256').update(value).digest('hex');

export async function exportPostgres(url, directory) {
  if (!url) throw new Error('Set MIGRATION_DATABASE_URL in the environment; do not pass credentials as arguments.');
  // Exclusive creation prevents accidentally mixing two snapshots or overwriting a backup.
  await mkdir(directory, { mode: 0o700 });
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000,
    ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined });
  // Preserve JSON numeric tokens, timestamp precision and BIGINT IDs exactly.
  const rawTypes = { getTypeParser: () => (value) => value };
  let connected = false;
  try {
    await client.connect(); connected = true;
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '60s'");
    const tables = (await client.query(`SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).rows;
    const catalog = { format: 1, createdAt: new Date().toISOString(), tables: [] };
    const snapshot = { format: 1, source: 'postgresql', complete: false, tables: [] };
    for (const { name } of tables) {
      const columns = (await client.query(`SELECT column_name AS name,udt_name AS type,is_nullable='YES' AS nullable,column_default AS "default"
        FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [name])).rows;
      const constraints = (await client.query(`SELECT c.conname AS name,c.contype AS type,pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname='public' AND t.relname=$1 ORDER BY c.conname`, [name])).rows;
      const indexes = (await client.query(`SELECT indexname AS name,indexdef AS definition FROM pg_indexes
        WHERE schemaname='public' AND tablename=$1 AND indexname NOT IN
        (SELECT c.conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=$1)
        ORDER BY indexname`, [name])).rows;
      catalog.tables.push({ name, columns, constraints, indexes });
      const file = `${String(snapshot.tables.length).padStart(3, '0')}.jsonl`;
      const handle = await open(path.join(directory, file), 'wx', 0o600);
      const hash = createHash('sha256');
      let rows = 0;
      try {
        await client.query(`DECLARE migration_rows NO SCROLL CURSOR FOR SELECT ${columns.map(c => identifier(c.name)).join(',')} FROM public.${identifier(name)}`);
        while (true) {
          const batch = await client.query({ text: 'FETCH FORWARD 100 FROM migration_rows', rowMode: 'array', types: rawTypes });
          if (!batch.rows.length) break;
          for (const row of batch.rows) {
            const line = JSON.stringify(row) + '\n';
            await handle.writeFile(line); hash.update(line); rows++;
          }
        }
        await client.query('CLOSE migration_rows');
      } finally { await handle.close(); }
      snapshot.tables.push({ name, file, rows, sha256: hash.digest('hex') });
    }
    const catalogJson = JSON.stringify(catalog, null, 2) + '\n';
    await writeFile(path.join(directory, 'catalog.json'), catalogJson, { mode: 0o600, flag: 'wx' });
    snapshot.catalogSha256 = digest(catalogJson);
    await client.query('COMMIT');
    // Manifest appears ONLY after every table is completely exported.
    snapshot.complete = true;
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    return { tables: snapshot.tables.length, rows: snapshot.tables.reduce((n, t) => n + t.rows, 0) };
  } catch (error) {
    if (connected) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { if (connected) await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) {
    console.error('Usage: npm run cf:export -- /absolute/private/new-snapshot-directory'); process.exitCode = 1;
  } else {
    exportPostgres(process.env.MIGRATION_DATABASE_URL, path.resolve(directory))
      .then((summary) => console.log(JSON.stringify({ status: 'exported', ...summary })))
      .catch(() => { console.error('Export failed. Check source availability/permissions and output directory. Incomplete snapshots cannot be imported.'); process.exitCode = 1; });
  }
}
