import pg from 'pg';

type Queryable = pg.Pool | pg.PoolClient;

const globalForDb = globalThis as unknown as { __betmindPool?: pg.Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined,
  });
  pool.on('error', (error) => console.error(JSON.stringify({ event: 'db_pool_error', message: error.message })));
  return pool;
}

export function pool(): pg.Pool {
  if (!globalForDb.__betmindPool) globalForDb.__betmindPool = createPool();
  return globalForDb.__betmindPool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = [], db: Queryable = pool()) {
  return db.query<T>(text, params as unknown[]);
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = [], db: Queryable = pool()) {
  const result = await db.query<T>(text, params as unknown[]);
  return result.rows[0] ?? null;
}

export async function many<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = [], db: Queryable = pool()) {
  return (await db.query<T>(text, params as unknown[])).rows;
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (globalForDb.__betmindPool) {
    await globalForDb.__betmindPool.end();
    globalForDb.__betmindPool = undefined;
  }
}

export type Db = Queryable;
